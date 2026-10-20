import source from '../shaders/glass-mark.wgsl?raw';

/** "BMK1", little endian. Layout: blender/build_mark_mesh.py. */
const MAGIC = 0x314b4d42;
const HEADER_BYTES = 32;
const VERTEX_BYTES = 12;
const UNIFORM_BYTES = 288;
const SAMPLES = 4;
const DEPTH_FORMAT: GPUTextureFormat = 'depth24plus';
/** Camera distance in mark half-heights, and the near plane, close enough for the mark to fly past. */
const DISTANCE = 9;
const NEAR = 0.05;
/** Share of the inner light's frame the upright mark fills, so the light keeps its scale as the mark moves. */
const FRAME_FILL = 0.7;
/**
 * The inner light is raymarched into a texture of this many texels, covering this half-extent of
 * its frame around the mark, then sampled: a fixed cost however large the mark flies on screen.
 */
const GLOW_TEXELS = [224, 288] as const;
const GLOW_EXTENT = [0.36, 0.48] as const;
const GLOW_FORMAT: GPUTextureFormat = 'rgba16float';

/**
 * The mark's optical centre, the centroid of its ink, in half-heights from the centre of its
 * bounds (the mesh origin): a little left and below. It spins about it and flies it onto the view axis.
 */
export const MARK_CENTRE = [-0.048, -0.077] as const;

export interface MarkPose {
  /** Radians about the vertical axis; positive turns the right side away. */
  yaw: number;
  /** Radians about the horizontal axis; positive tips the top towards the viewer. */
  pitch: number;
  scale: number;
  opacity: number;
  /** Where the travelling glint sits in reflection space, about -1.2 → 1.2 across the mark. */
  glint: number;
  /** 0 on black, 1 once the warm gray ground is lit. */
  ground: number;
  /** Where the panel ends, as a fraction of the canvas height from its top; the panel lies above. */
  edge: number;
  /** Opacity of the panel and of the light Wordmark over it. */
  panel: number;
  light: number;
  /** Opacity of the text in the coverage mask. */
  word: number;
  /** Share of the way its optical centre has moved onto the screen's centre. */
  aim: number;
  /** Share of the way from rest to the camera it has flown; past 1 it is behind the viewer. */
  approach: number;
  /** Seconds on the clock of the light inside the body. */
  flow: number;
}

/** sRGB colours of the Loader's browser layer, 0..1. */
export interface MarkColors {
  ink: [number, number, number];
  ground: [number, number, number];
  lightWord: [number, number, number];
}

interface Mesh {
  vertices: Uint8Array;
  indices: Uint8Array;
  indexCount: number;
  half: Float32Array;
}

function parseMesh(data: ArrayBuffer): Mesh {
  const view = new DataView(data);
  if (view.getUint32(0, true) !== MAGIC) throw new Error('Not a Glass mark mesh');
  const vertexCount = view.getUint32(4, true);
  const indexCount = view.getUint32(8, true);
  const vertexBytes = vertexCount * VERTEX_BYTES;
  const indexBytes = Math.ceil((indexCount * 2) / 4) * 4;
  return {
    half: new Float32Array(data, 16, 4),
    vertices: new Uint8Array(data, HEADER_BYTES, vertexBytes),
    indices: new Uint8Array(data, HEADER_BYTES + vertexBytes, indexBytes),
    indexCount,
  };
}

/**
 * The Glass mark drawn live from its mesh, on a canvas of its own that shares the session's device
 * and covers the viewport, so the mark can fly out past its edges and the camera.
 * The Loader stacks the mark above browser-layer content (the panel, the Wordmark, then Home's
 * manifesto), which the stage canvas sits beneath. To refract that content the mark redraws it: flat
 * colours from the pose and the text from a coverage mask the Loader rasterises at the canvas's pixel size.
 */
export class GlassMark {
  lost = false;
  private context: GPUCanvasContext;
  private uniforms = new Float32Array(UNIFORM_BYTES / 4);
  private uniformBuffer: GPUBuffer;
  private vertexBuffer: GPUBuffer;
  private indexBuffer: GPUBuffer;
  private group: GPUBindGroup | null = null;
  private glowGroup: GPUBindGroup;
  private sampler: GPUSampler;
  private color: GPUTexture | null = null;
  private depth: GPUTexture | null = null;
  private mask: GPUTexture | null = null;
  private glow: GPUTexture;
  /** Canvas size in device px; the Wordmark mask must match it. */
  width = 0;
  height = 0;
  /** Share of the canvas height the upright mark fills at rest. */
  private fill = 0.7;
  private destroyed = false;

  static async create(device: GPUDevice, canvas: HTMLCanvasElement, data: ArrayBuffer): Promise<GlassMark> {
    const mesh = parseMesh(data);
    const format = navigator.gpu.getPreferredCanvasFormat();
    const module = device.createShaderModule({ label: 'glass-mark', code: source });
    const layout = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    // The glow pass reads only the uniforms, so it can render the texture the body samples.
    const glowLayout = device.createBindGroupLayout({
      entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
    });
    const base = {
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: VERTEX_BYTES,
            attributes: [
              { shaderLocation: 0, offset: 0, format: 'snorm16x4' },
              { shaderLocation: 1, offset: 8, format: 'snorm8x4' },
            ],
          },
        ],
      },
      primitive: { topology: 'triangle-list', cullMode: 'back', frontFace: 'ccw' },
      multisample: { count: SAMPLES },
    } satisfies Partial<GPURenderPipelineDescriptor>;
    // Depth first, then shade only the nearest surface, so overlapping rim and wall never double-blend.
    const [glowPass, depthPass, colorPass] = await Promise.all([
      device.createRenderPipelineAsync({
        label: 'glass-mark glow',
        layout: device.createPipelineLayout({ bindGroupLayouts: [glowLayout] }),
        vertex: { module, entryPoint: 'vsGlow' },
        fragment: { module, entryPoint: 'fsGlow', targets: [{ format: GLOW_FORMAT }] },
        primitive: { topology: 'triangle-list' },
      }),
      device.createRenderPipelineAsync({
        ...base,
        label: 'glass-mark depth',
        fragment: { module, entryPoint: 'fsDepth', targets: [{ format, writeMask: 0 }] },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: true, depthCompare: 'less' },
      }),
      device.createRenderPipelineAsync({
        ...base,
        label: 'glass-mark',
        fragment: {
          module,
          entryPoint: 'fs',
          targets: [
            {
              format,
              blend: {
                color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
                alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              },
            },
          ],
        },
        depthStencil: { format: DEPTH_FORMAT, depthWriteEnabled: false, depthCompare: 'equal' },
      }),
    ]);
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('No WebGPU canvas context');
    context.configure({ device, format, alphaMode: 'premultiplied' });
    return new GlassMark(device, context, format, layout, glowLayout, glowPass, depthPass, colorPass, mesh);
  }

  private constructor(
    private device: GPUDevice,
    context: GPUCanvasContext,
    private format: GPUTextureFormat,
    private layout: GPUBindGroupLayout,
    glowLayout: GPUBindGroupLayout,
    private glowPass: GPURenderPipeline,
    private depthPass: GPURenderPipeline,
    private colorPass: GPURenderPipeline,
    private mesh: Mesh,
  ) {
    this.context = context;
    this.vertexBuffer = this.upload(mesh.vertices, GPUBufferUsage.VERTEX);
    this.indexBuffer = this.upload(mesh.indices, GPUBufferUsage.INDEX);
    this.uniformBuffer = device.createBuffer({ size: UNIFORM_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });
    this.glow = device.createTexture({
      size: { width: GLOW_TEXELS[0], height: GLOW_TEXELS[1] },
      format: GLOW_FORMAT,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });
    this.glowGroup = device.createBindGroup({
      layout: glowLayout,
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer } }],
    });
    this.uniforms.set(mesh.half, 36);
    this.uniforms.set([...GLOW_TEXELS, ...GLOW_EXTENT], 68);
    this.setColors({ ink: [0, 0, 0], ground: [0, 0, 0], lightWord: [1, 1, 1] });
    device.lost.then(() => {
      this.lost = true;
    });
  }

  /** CSS size of the canvas, the device pixels to render per CSS px, and the share of its height the mark fills at rest. */
  resize(width: number, height: number, pixelRatio: number, fill: number): void {
    this.fill = fill;
    const canvas = this.context.canvas as HTMLCanvasElement;
    const pw = Math.max(1, Math.round(width * pixelRatio));
    const ph = Math.max(1, Math.round(height * pixelRatio));
    if (pw === this.width && ph === this.height) return;
    this.width = pw;
    this.height = ph;
    canvas.width = pw;
    canvas.height = ph;
    this.color?.destroy();
    this.depth?.destroy();
    this.mask?.destroy();
    const size = { width: pw, height: ph };
    const usage = GPUTextureUsage.RENDER_ATTACHMENT;
    this.color = this.device.createTexture({ size, format: this.format, sampleCount: SAMPLES, usage });
    this.depth = this.device.createTexture({ size, format: DEPTH_FORMAT, sampleCount: SAMPLES, usage });
    // Empty until the Loader uploads the Wordmark at this size.
    this.mask = this.device.createTexture({
      size,
      format: 'r8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.group = this.device.createBindGroup({
      layout: this.layout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: this.mask.createView() },
        { binding: 2, resource: this.sampler },
        { binding: 3, resource: this.glow.createView() },
      ],
    });
  }

  setColors(colors: MarkColors): void {
    this.uniforms.set([...colors.ink, 1, ...colors.ground, 1, ...colors.lightWord, 1], 52);
  }

  /** The Wordmark's coverage in its red channel, at `width` × `height`. */
  uploadWord(source: OffscreenCanvas | HTMLCanvasElement): void {
    if (this.destroyed || this.lost || !this.mask) return;
    if (source.width !== this.width || source.height !== this.height) return;
    this.device.queue.copyExternalImageToTexture({ source }, { texture: this.mask }, { width: this.width, height: this.height });
  }

  render(pose: MarkPose): void {
    if (this.destroyed || this.lost || !this.color || !this.depth || !this.group) return;
    this.writeUniforms(pose);
    const visible = pose.opacity > 0.002;
    const encoder = this.device.createCommandEncoder();
    if (visible) {
      const glow = encoder.beginRenderPass({
        colorAttachments: [{ view: this.glow.createView(), loadOp: 'clear', storeOp: 'store', clearValue: { r: 0, g: 0, b: 0, a: 0 } }],
      });
      glow.setPipeline(this.glowPass);
      glow.setBindGroup(0, this.glowGroup);
      glow.draw(3);
      glow.end();
    }
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.color.createView(),
          resolveTarget: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'discard',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
      depthStencilAttachment: {
        view: this.depth.createView(),
        depthLoadOp: 'clear',
        depthStoreOp: 'discard',
        depthClearValue: 1,
      },
    });
    if (visible) {
      pass.setBindGroup(0, this.group);
      pass.setVertexBuffer(0, this.vertexBuffer);
      pass.setIndexBuffer(this.indexBuffer, 'uint16');
      pass.setPipeline(this.depthPass);
      pass.drawIndexed(this.mesh.indexCount);
      pass.setPipeline(this.colorPass);
      pass.drawIndexed(this.mesh.indexCount);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.vertexBuffer.destroy();
    this.indexBuffer.destroy();
    this.uniformBuffer.destroy();
    this.color?.destroy();
    this.depth?.destroy();
    this.mask?.destroy();
    this.glow.destroy();
    this.context.unconfigure();
  }

  private upload(bytes: Uint8Array, usage: GPUBufferUsageFlags): GPUBuffer {
    const buffer = this.device.createBuffer({ size: bytes.byteLength, usage, mappedAtCreation: true });
    new Uint8Array(buffer.getMappedRange()).set(bytes);
    buffer.unmap();
    return buffer;
  }

  private writeUniforms(pose: MarkPose): void {
    const u = this.uniforms;
    const aspect = this.width / this.height;
    const fill = this.fill;
    const f = fill * DISTANCE;
    const near = NEAR;
    const far = DISTANCE + 2;
    // viewProj: perspective (depth 0..1) after stepping the camera back to +z DISTANCE.
    u.fill(0, 0, 16);
    u[0] = f / aspect;
    u[5] = f;
    u[10] = far / (near - far);
    u[11] = -1;
    u[14] = (near * far) / (near - far) + u[10] * -DISTANCE;
    u[15] = DISTANCE;

    // model: yaw about y, then pitch about x, and uniform scale, all about the optical centre; then
    // that centre slides onto the view axis and flies towards the camera.
    const cy = Math.cos(pose.yaw);
    const sy = Math.sin(pose.yaw);
    const cp = Math.cos(pose.pitch);
    const sp = Math.sin(pose.pitch);
    const s = pose.scale;
    const x = [cy * s, 0, -sy * s];
    const y = [sy * sp * s, cp * s, cy * sp * s];
    const z = [sy * cp * s, -sp * s, cy * cp * s];
    const [ox, oy] = MARK_CENTRE;
    const keep = 1 - pose.aim;
    const tx = ox * keep - (ox * x[0] + oy * y[0]);
    const ty = oy * keep - (ox * x[1] + oy * y[1]);
    const tz = pose.approach * DISTANCE - (ox * x[2] + oy * y[2]);
    u.set([...x, 0, ...y, 0, ...z, 0, tx, ty, tz, 1], 16);
    // How much larger things look at the mark's depth than at rest.
    const depth = Math.max(DISTANCE - tz, NEAR);
    const closer = DISTANCE / depth;

    u.set([0, 0, DISTANCE, 1], 32);
    u[40] = pose.opacity;
    u[41] = pose.glint;
    u[42] = pose.ground;
    u[43] = pose.word;
    u.set([this.width, this.height, pose.edge, pose.panel], 44);
    // Canvas uv per world unit on the mark's plane; uv y runs down.
    u.set([(fill * closer) / (2 * aspect), (-fill * closer) / 2, pose.light, 0], 48);
    // The inner light's clock, and its frame: centred on the mark's bounds as projected, in canvas px.
    const frame = (fill * this.height * closer) / FRAME_FILL;
    const centreX = (this.width / 2) * (1 + (f / aspect) * (tx / depth));
    const centreY = (this.height / 2) * (1 - f * (ty / depth));
    u.set([pose.flow, centreX, centreY, frame], 64);
    this.device.queue.writeBuffer(this.uniformBuffer, 0, u);
  }
}

import type { RenderBackend } from './backend';
import {
  BACKGROUND_BYTES,
  FRAME_BYTES,
  GLASS_REACH,
  MAX_GLASS,
  SPRITE_FLOATS,
  SPRITE_STRIDE,
  SPRITE_VERTICES,
  createPipelines,
  type Pipelines,
} from './pipelines';
import { TextureStore } from './resources';
import type { GlassBox, SceneFrame, Sprite, TextureRef } from './scene/types';

export interface RendererOptions {
  onLost: (message: string) => void;
  onTextureLoad: () => void;
  textureBudget: number;
}

/** Owns the GPU lifecycle for one device: context, pipelines, buffers, submission. */
export class WebGpuRenderer implements RenderBackend {
  readonly kind = 'webgpu';
  private pipelines: Pipelines;
  private textures: TextureStore;
  private frameBuffer: GPUBuffer;
  private backgroundBuffer: GPUBuffer;
  private backgroundGroup: GPUBindGroup;
  private sampler: GPUSampler;
  private instanceBuffer!: GPUBuffer;
  private instanceGroup!: GPUBindGroup;
  private capacity = 0;
  private instances = new Float32Array(0);
  private frameData = new Float32Array(FRAME_BYTES / 4);
  private backgroundData = new Float32Array(BACKGROUND_BYTES / 4);
  private drawGroups: GPUBindGroup[] = [];
  /** Screen bounds the glass reaches this frame, CSS px; empty when there is none. */
  private glassBounds = [0, 0, 0, 0];
  private width = 1;
  private height = 1;
  private pixelRatio = 1;
  private destroyed = false;

  static async create(canvas: HTMLCanvasElement, options: RendererOptions): Promise<WebGpuRenderer> {
    if (!navigator.gpu) throw new Error('WebGPU unavailable');
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) throw new Error('No GPU adapter');
    const device = await adapter.requestDevice();
    const context = canvas.getContext('webgpu');
    if (!context) throw new Error('No WebGPU canvas context');
    return new WebGpuRenderer(device, context, options);
  }

  private constructor(
    readonly device: GPUDevice,
    private context: GPUCanvasContext,
    options: RendererOptions,
  ) {
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format, alphaMode: 'opaque' });

    device.lost.then((info) => {
      if (this.destroyed) return;
      this.destroyed = true;
      options.onLost(info.message || info.reason || 'device lost');
    });
    device.addEventListener('uncapturederror', (event) => {
      console.error('[gpu]', (event as GPUUncapturedErrorEvent).error.message);
    });

    this.pipelines = createPipelines(device, format);
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
    this.frameBuffer = device.createBuffer({ size: FRAME_BYTES, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
    this.backgroundBuffer = device.createBuffer({
      size: BACKGROUND_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.backgroundGroup = device.createBindGroup({
      layout: this.pipelines.backgroundLayout,
      entries: [{ binding: 0, resource: { buffer: this.backgroundBuffer } }],
    });
    this.textures = new TextureStore(device, this.pipelines.textureLayout, options.textureBudget, options.onTextureLoad);
    this.ensureCapacity(128);
  }

  get loading(): boolean {
    return this.textures.pending;
  }

  resize(width: number, height: number, pixelRatio: number): void {
    const canvas = this.context.canvas as HTMLCanvasElement;
    this.width = width;
    this.height = height;
    const pw = Math.max(1, Math.round(width * pixelRatio));
    const ph = Math.max(1, Math.round(height * pixelRatio));
    this.pixelRatio = pw / width;
    if (canvas.width !== pw || canvas.height !== ph) {
      canvas.width = pw;
      canvas.height = ph;
    }
  }

  appear(ref: TextureRef): number {
    return this.textures.appear(ref);
  }

  prefetch(ref: TextureRef, devicePx: number): void {
    this.textures.prefetch(ref, devicePx);
  }

  render(scene: SceneFrame, seconds: number): void {
    if (this.destroyed) return;
    const { device } = this;
    this.textures.setTime(seconds);

    const f = this.frameData;
    f[0] = this.width;
    f[1] = this.height;
    f[2] = this.pixelRatio;
    f[3] = seconds;
    this.packGlass(scene.glass, scene.background);
    device.queue.writeBuffer(this.frameBuffer, 0, f);

    const b = this.backgroundData;
    b[0] = this.width;
    b[1] = this.height;
    b[2] = this.pixelRatio;
    b[3] = Math.min(2, scene.glows.length);
    b.set([scene.background[0], scene.background[1], scene.background[2], 1], 4);
    for (let i = 0; i < 2; i++) {
      const glow = scene.glows[i];
      const o = 8 + i * 8;
      if (glow) {
        b.set([glow.x, glow.y, glow.radius, glow.strength], o);
        b.set([glow.color[0], glow.color[1], glow.color[2], 1], o + 4);
      }
    }
    device.queue.writeBuffer(this.backgroundBuffer, 0, b);

    const count = this.packSprites(scene.sprites);

    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: this.context.getCurrentTexture().createView(),
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: scene.background[0], g: scene.background[1], b: scene.background[2], a: 1 },
        },
      ],
    });
    pass.setPipeline(this.pipelines.background);
    pass.setBindGroup(0, this.backgroundGroup);
    pass.draw(3);

    if (count) {
      pass.setPipeline(this.pipelines.sprite);
      pass.setBindGroup(0, this.instanceGroup);
      let bound: GPUBindGroup | null = null;
      for (let i = 0; i < count; i++) {
        const group = this.drawGroups[i];
        if (group !== bound) {
          pass.setBindGroup(1, group);
          bound = group;
        }
        pass.draw(SPRITE_VERTICES, 1, 0, i);
      }
    }
    pass.end();
    device.queue.submit([encoder.finish()]);
  }

  destroy(): void {
    this.destroyed = true;
    this.textures.destroy();
    this.instanceBuffer?.destroy();
    this.frameBuffer.destroy();
    this.backgroundBuffer.destroy();
    this.context.unconfigure();
    this.device.destroy();
  }

  private packSprites(sprites: readonly Sprite[]): number {
    this.ensureCapacity(sprites.length);
    const data = this.instances;
    let n = 0;
    for (const s of sprites) {
      if (s.opacity <= 0.002 || s.w <= 0 || s.h <= 0) continue;
      if (s.x > this.width || s.y > this.height || s.x + s.w < 0 || s.y + s.h + Math.abs(s.bend) < 0) continue;
      let group: GPUBindGroup | null = this.textures.empty;
      if (s.texture) {
        group = this.textures.use(s.texture, s.iw * Math.max(1, s.zoom) * this.pixelRatio, 1);
        if (!group) {
          if (s.card <= 0.001) continue;
          group = this.textures.empty;
        }
      }
      const o = n * SPRITE_FLOATS;
      data[o] = s.x;
      data[o + 1] = s.y;
      data[o + 2] = s.w;
      data[o + 3] = s.h;
      data[o + 4] = s.ix;
      data[o + 5] = s.iy;
      data[o + 6] = s.iw;
      data[o + 7] = s.ih;
      data[o + 8] = s.radius;
      data[o + 9] = s.innerRadius;
      data[o + 10] = s.card;
      data[o + 11] = s.opacity;
      data[o + 12] = s.fade[0];
      data[o + 13] = s.fade[1];
      data[o + 14] = s.fade[2];
      data[o + 15] = s.fade[3];
      data[o + 16] = s.bend;
      data[o + 17] = group === this.textures.empty ? 0 : 1;
      data[o + 18] = 1;
      data[o + 19] = s.image;
      data[o + 20] = s.zoom;
      data[o + 21] = s.hover;
      data[o + 22] = s.focusX;
      data[o + 23] = s.focusY;
      data[o + 24] = s.lift;
      data[o + 25] = s.texture && 'shadowed' in s.texture && s.texture.shadowed ? 1 : 0;
      const [gx0, gy0, gx1, gy1] = this.glassBounds;
      const glassed = gx1 > gx0 && s.x < gx1 && s.x + s.w > gx0 && s.y < gy1 && s.y + s.h + Math.abs(s.bend) > gy0;
      data[o + 26] = glassed ? 1 : 0;
      data[o + 27] = glassed ? GLASS_REACH : 0;
      this.drawGroups[n] = group;
      n++;
    }
    if (n) this.device.queue.writeBuffer(this.instanceBuffer, 0, data, 0, n * SPRITE_FLOATS);
    return n;
  }

  /** Glass boxes into the frame uniform after its first vec4, and the screen bounds they reach. */
  private packGlass(glass: readonly GlassBox[], paper: readonly [number, number, number]): void {
    const f = this.frameData;
    const bounds = this.glassBounds;
    bounds[0] = bounds[1] = Infinity;
    bounds[2] = bounds[3] = -Infinity;
    let n = 0;
    for (const g of glass) {
      if (n >= MAX_GLASS) break;
      if (g.weight <= 0.002) continue;
      f.set([g.x, g.y, g.hw, g.hh], 12 + n * 4);
      f.set([g.radius, g.weight, g.feather, g.inset], 12 + (MAX_GLASS + n) * 4);
      bounds[0] = Math.min(bounds[0], g.x - g.hw - g.feather);
      bounds[1] = Math.min(bounds[1], g.y - g.hh - g.feather);
      bounds[2] = Math.max(bounds[2], g.x + g.hw + g.feather);
      bounds[3] = Math.max(bounds[3], g.y + g.hh + g.feather);
      n++;
    }
    if (!n) bounds.fill(0);
    f[4] = n;
    f.set([paper[0], paper[1], paper[2], 1], 8);
  }

  private ensureCapacity(count: number): void {
    if (count <= this.capacity) return;
    const capacity = Math.max(count, this.capacity * 2, 64);
    this.instanceBuffer?.destroy();
    this.instanceBuffer = this.device.createBuffer({
      size: capacity * SPRITE_STRIDE,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.instanceGroup = this.device.createBindGroup({
      layout: this.pipelines.frameLayout,
      entries: [
        { binding: 0, resource: { buffer: this.frameBuffer } },
        { binding: 1, resource: { buffer: this.instanceBuffer } },
        { binding: 2, resource: this.sampler },
      ],
    });
    this.instances = new Float32Array(capacity * SPRITE_FLOATS);
    this.capacity = capacity;
  }
}

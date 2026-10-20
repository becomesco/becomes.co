import spriteSource from './shaders/sprite.wgsl?raw';
import backgroundSource from './shaders/background.wgsl?raw';

export const SPRITE_FLOATS = 28;
export const SPRITE_STRIDE = SPRITE_FLOATS * 4;
export const SPRITE_VERTICES = 16 * 6;
/** Glass boxes the frame uniform holds; MAX_GLASS in sprite.wgsl. */
export const MAX_GLASS = 12;
/** CSS px a sprite's quad grows by under glass, so bent content can spill past its edges. Covers the bend, warp and blur in sprite.wgsl. */
export const GLASS_REACH = 64;
export const FRAME_BYTES = (12 + MAX_GLASS * 8) * 4;
export const BACKGROUND_BYTES = 96;

export interface Pipelines {
  sprite: GPURenderPipeline;
  background: GPURenderPipeline;
  frameLayout: GPUBindGroupLayout;
  textureLayout: GPUBindGroupLayout;
  backgroundLayout: GPUBindGroupLayout;
}

const premultiplied: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
};

export function createPipelines(device: GPUDevice, format: GPUTextureFormat): Pipelines {
  const frameLayout = device.createBindGroupLayout({
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'read-only-storage' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });
  const textureLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } }],
  });
  const backgroundLayout = device.createBindGroupLayout({
    entries: [{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } }],
  });

  const spriteModule = device.createShaderModule({ label: 'sprite', code: spriteSource });
  const backgroundModule = device.createShaderModule({ label: 'background', code: backgroundSource });

  const sprite = device.createRenderPipeline({
    label: 'sprite',
    layout: device.createPipelineLayout({ bindGroupLayouts: [frameLayout, textureLayout] }),
    vertex: { module: spriteModule, entryPoint: 'vs' },
    fragment: { module: spriteModule, entryPoint: 'fs', targets: [{ format, blend: premultiplied }] },
    primitive: { topology: 'triangle-list', cullMode: 'none' },
  });

  const background = device.createRenderPipeline({
    label: 'background',
    layout: device.createPipelineLayout({ bindGroupLayouts: [backgroundLayout] }),
    vertex: { module: backgroundModule, entryPoint: 'vs' },
    fragment: { module: backgroundModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  });

  return { sprite, background, frameLayout, textureLayout, backgroundLayout };
}

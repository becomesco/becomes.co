import type { SceneFrame, TextureRef } from './scene/types';

export interface RenderBackend {
  readonly kind: 'webgpu' | 'dom';
  /** CSS size and the device pixel ratio to render at. */
  resize(width: number, height: number, pixelRatio: number): void;
  render(scene: SceneFrame, seconds: number): void;
  /** 0→1 fade-in since the texture became drawable. */
  appear(ref: TextureRef): number;
  prefetch(ref: TextureRef, devicePx: number): void;
  readonly loading: boolean;
  destroy(): void;
}

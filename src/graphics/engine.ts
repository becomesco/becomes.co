import type { FrameTime } from '../core/scheduler';
import type { RenderBackend } from './backend';
import { detectCapabilities } from './capabilities';
import { DomRenderer } from './dom-renderer';
import { AdaptiveQuality } from './quality';
import { WebGpuRenderer } from './renderer';
import type { SceneFrame, TextureRef } from './scene/types';

export interface EngineOptions {
  canvas: HTMLCanvasElement;
  /** Element the HTML/CSS fallback draws into. */
  fallbackHost: HTMLElement;
  /** Something changed that needs a frame (texture loaded, backend swapped). */
  invalidate: () => void;
  onBackendChange?: (kind: RenderBackend['kind']) => void;
}

const MAX_RECOVERIES = 2;

export class Engine {
  backend!: RenderBackend;
  readonly quality = new AdaptiveQuality();
  private width = 1;
  private height = 1;
  private dpr = 1;
  private recoveries = 0;
  private lastRenderedAt = 0;
  private capabilities = detectCapabilities();

  private constructor(private options: EngineOptions) {}

  static async create(options: EngineOptions): Promise<Engine> {
    const engine = new Engine(options);
    await engine.start();
    return engine;
  }

  get kind(): RenderBackend['kind'] {
    return this.backend.kind;
  }

  get loading(): boolean {
    return this.backend.loading;
  }

  /** Device pixels the canvas currently renders at per CSS px. */
  get pixelRatio(): number {
    return this.renderRatio();
  }

  resize(width: number, height: number, dpr: number): void {
    this.width = width;
    this.height = height;
    this.dpr = dpr;
    this.backend.resize(width, height, this.renderRatio());
  }

  appear(ref: TextureRef): number {
    return this.backend.appear(ref);
  }

  prefetch(ref: TextureRef, cssWidth: number): void {
    this.backend.prefetch(ref, cssWidth * this.renderRatio());
  }

  render(scene: SceneFrame, frame: FrameTime): void {
    const consecutive = this.lastRenderedAt > 0 && frame.now - this.lastRenderedAt < 120;
    if (consecutive && this.backend.kind === 'webgpu') {
      if (this.quality.sample(frame.interval)) this.backend.resize(this.width, this.height, this.renderRatio());
    } else {
      this.quality.reset();
    }
    this.lastRenderedAt = frame.now;
    this.backend.render(scene, frame.elapsed);
  }

  private renderRatio(): number {
    const max = Math.min(this.dpr, 2);
    return Math.max(1, max * this.quality.scale);
  }

  private async start(): Promise<void> {
    if (this.capabilities.webgpu) {
      try {
        this.backend = await this.createGpu();
        this.options.onBackendChange?.('webgpu');
        return;
      } catch (error) {
        console.warn('[engine] WebGPU init failed, using HTML/CSS', error);
      }
    }
    this.useDom();
  }

  private createGpu(): Promise<WebGpuRenderer> {
    const budget = (this.capabilities.lowMemory ? 160 : 384) * 1024 * 1024;
    return WebGpuRenderer.create(this.options.canvas, {
      textureBudget: budget,
      onTextureLoad: this.options.invalidate,
      onLost: (message) => void this.recover(message),
    });
  }

  private async recover(message: string): Promise<void> {
    console.warn('[engine] GPU device lost:', message);
    if (this.recoveries++ < MAX_RECOVERIES) {
      try {
        this.backend = await this.createGpu();
        this.backend.resize(this.width, this.height, this.renderRatio());
        this.options.invalidate();
        return;
      } catch (error) {
        console.warn('[engine] GPU recovery failed', error);
      }
    }
    this.useDom();
    this.backend.resize(this.width, this.height, 1);
    this.options.invalidate();
  }

  private useDom(): void {
    this.options.canvas.hidden = true;
    this.backend = new DomRenderer(this.options.fallbackHost, this.options.invalidate);
    this.options.onBackendChange?.('dom');
  }
}

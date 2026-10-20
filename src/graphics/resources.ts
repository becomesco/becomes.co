import type { TextureRef } from './scene/types';

interface Entry {
  ref: TextureRef;
  /** Loaded resolution, see `pickLevel`; 0 when nothing is uploaded. */
  level: number;
  texture: GPUTexture | null;
  bindGroup: GPUBindGroup | null;
  bytes: number;
  loading: number;
  readyAt: number;
  lastUsed: number;
  failed: boolean;
}

interface Job {
  entry: Entry;
  level: number;
  priority: number;
}

const FADE_IN = 0.35;
const MAX_PARALLEL = 6;
/** Drawn textures render in quarter steps of their 1x size, up to this. */
const DRAW_STEP = 0.25;
const MAX_DRAW_SCALE = 4;

/**
 * Resolution to load for a display width: 1 (`half`) or 2 (`src`) for files; for drawn
 * textures, the scale to draw at, so they stay 1:1 with device pixels when shown large.
 */
export function pickLevel(ref: TextureRef, devicePx: number): number {
  const ratio = devicePx / (ref.px[0] * 0.5);
  if ('draw' in ref) return Math.min(MAX_DRAW_SCALE, Math.max(1, Math.ceil(ratio / DRAW_STEP - 0.01) * DRAW_STEP));
  return ratio <= 1.15 ? 1 : 2;
}

async function decode(url: string, signal: AbortSignal): Promise<ImageBitmap> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const blob = await response.blob();
  return createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}

/**
 * Asset textures on the GPU. Requested on demand, decoded off the main thread by
 * createImageBitmap, uploaded once, evicted least-recently-used over a byte budget.
 */
export class TextureStore {
  private entries = new Map<string, Entry>();
  private queue: Job[] = [];
  private inFlight = 0;
  private abort = new AbortController();
  private bytes = 0;
  readonly empty: GPUBindGroup;
  private emptyTexture: GPUTexture;
  private now = 0;

  constructor(
    private device: GPUDevice,
    private layout: GPUBindGroupLayout,
    private budget: number,
    private onLoad: () => void,
  ) {
    this.emptyTexture = device.createTexture({
      size: [1, 1],
      format: 'rgba8unorm',
      usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
    });
    device.queue.writeTexture({ texture: this.emptyTexture }, new Uint8Array(4), { bytesPerRow: 4 }, [1, 1]);
    this.empty = device.createBindGroup({ layout, entries: [{ binding: 0, resource: this.emptyTexture.createView() }] });
  }

  setTime(seconds: number): void {
    this.now = seconds;
  }

  /** Bind group for drawing, or null while nothing is uploaded yet. */
  use(ref: TextureRef, devicePx: number, priority = 1): GPUBindGroup | null {
    const entry = this.entry(ref);
    entry.lastUsed = this.now;
    this.want(entry, pickLevel(ref, devicePx), priority);
    return entry.bindGroup;
  }

  prefetch(ref: TextureRef, devicePx: number): void {
    const entry = this.entry(ref);
    entry.lastUsed = Math.max(entry.lastUsed, this.now - 1);
    this.want(entry, pickLevel(ref, devicePx), 0);
  }

  /** 0→1 since the texture became drawable; drives the Layer fade-in. */
  appear(ref: TextureRef): number {
    const entry = this.entries.get(ref.key);
    if (!entry?.bindGroup) return entry?.failed ? 1 : 0;
    return Math.min(1, (this.now - entry.readyAt) / FADE_IN);
  }

  get pending(): boolean {
    return this.inFlight > 0 || this.queue.length > 0;
  }

  destroy(): void {
    this.abort.abort();
    for (const entry of this.entries.values()) entry.texture?.destroy();
    this.entries.clear();
    this.emptyTexture.destroy();
    this.queue = [];
  }

  private entry(ref: TextureRef): Entry {
    let entry = this.entries.get(ref.key);
    if (!entry) {
      entry = {
        ref,
        level: 0,
        texture: null,
        bindGroup: null,
        bytes: 0,
        loading: 0,
        readyAt: 0,
        lastUsed: this.now,
        failed: false,
      };
      this.entries.set(ref.key, entry);
    }
    return entry;
  }

  private want(entry: Entry, level: number, priority: number): void {
    if (entry.failed) return;
    // Never downgrade a loaded texture; the lower level stays drawn while a higher one loads.
    if (entry.level >= level) return;
    if (entry.loading >= level) {
      const job = this.queue.find((j) => j.entry === entry);
      if (job && priority > job.priority) job.priority = priority;
      return;
    }
    if (entry.loading) return;
    entry.loading = level;
    this.queue.push({ entry, level, priority });
    this.pump();
  }

  private pump(): void {
    while (this.inFlight < MAX_PARALLEL && this.queue.length) {
      let best = 0;
      for (let i = 1; i < this.queue.length; i++) if (this.queue[i].priority > this.queue[best].priority) best = i;
      const [job] = this.queue.splice(best, 1);
      this.inFlight++;
      void this.load(job).finally(() => {
        this.inFlight--;
        this.pump();
      });
    }
  }

  private async load({ entry, level }: Job): Promise<void> {
    const { ref } = entry;
    const url = 'draw' in ref ? ref.key : level === 2 ? ref.src : ref.half;
    try {
      const source = 'draw' in ref ? await ref.draw(level) : await decode(url, this.abort.signal);
      if (this.abort.signal.aborted) {
        if (source instanceof ImageBitmap) source.close();
        return;
      }
      const texture = this.device.createTexture({
        size: [source.width, source.height],
        format: 'rgba8unorm',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
      });
      this.device.queue.copyExternalImageToTexture(
        { source },
        { texture, premultipliedAlpha: true },
        [source.width, source.height],
      );
      const bytes = source.width * source.height * 4;
      if (source instanceof ImageBitmap) source.close();

      if (entry.texture) {
        entry.texture.destroy();
        this.bytes -= entry.bytes;
      } else {
        entry.readyAt = this.now;
      }
      entry.texture = texture;
      entry.bytes = bytes;
      entry.level = level;
      entry.bindGroup = this.device.createBindGroup({
        layout: this.layout,
        entries: [{ binding: 0, resource: texture.createView() }],
      });
      this.bytes += bytes;
      this.evict();
      this.onLoad();
    } catch (error) {
      if (!this.abort.signal.aborted) {
        console.warn('[textures] failed', url, error);
        entry.failed = true;
        this.onLoad();
      }
    } finally {
      entry.loading = 0;
    }
  }

  private evict(): void {
    if (this.bytes <= this.budget) return;
    const candidates = [...this.entries.values()]
      .filter((e) => e.texture && this.now - e.lastUsed > 2)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const entry of candidates) {
      if (this.bytes <= this.budget * 0.8) break;
      entry.texture?.destroy();
      this.bytes -= entry.bytes;
      entry.texture = null;
      entry.bindGroup = null;
      entry.level = 0;
      entry.bytes = 0;
    }
  }
}

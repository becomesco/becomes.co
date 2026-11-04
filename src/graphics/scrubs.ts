import { fetchMedia } from './media-cache';
import type { FileTexture } from './scene/types';

type Frames = NonNullable<FileTexture['frames']>;

interface Scrub {
  key: string;
  frames: Frames;
  level: number;
  texture: GPUTexture;
  /** Frame the texture holds; 0, the poster, when it is uploaded. */
  shown: number;
  target: number;
  /** Frame stamp of the last `show`. */
  drawn: number;
  /** Download order, and how far along it is. */
  order: number[];
  next: number;
  downloading: number;
  fetched: Uint8Array;
  decoded: Map<number, ImageBitmap>;
  decoding: Set<number>;
}

const DOWNLOADS = 4;
const DECODES = 2;
/** Decoded frames held per drawn clip, nearest the target first. */
const KEEP = 6;

/**
 * Frames first, then every frame between: halving strides, so the whole clip scrubs coarsely
 * after a few downloads and sharpens into every frame as the rest arrive.
 */
function coarseToFine(count: number, first: number): number[] {
  const order = [first];
  const seen = new Set(order);
  for (let stride = 2 ** Math.floor(Math.log2(Math.max(1, count - 1))); stride >= 1; stride /= 2) {
    for (let i = 0; i < count; i += stride) {
      if (!seen.has(i)) {
        seen.add(i);
        order.push(i);
      }
    }
    if (!seen.has(count - 1)) {
      seen.add(count - 1);
      order.push(count - 1);
    }
  }
  return order;
}

/**
 * Video Assets scrubbed by scroll. Each drawn clip shows the still for its place in the
 * viewport, copied into the texture its poster was uploaded to. Stills download as the clip
 * is drawn and stay compressed in the media cache; only the few nearest the current frame are
 * decoded, and those are dropped once the clip leaves the screen. Nothing runs while the
 * page is still: a frame is uploaded only when scrolling moves the target.
 */
export class Scrubs {
  private scrubs = new Map<string, Scrub>();
  private frame = 0;
  private reduced = matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private device: GPUDevice,
    private onReady: () => void,
  ) {}

  /** Shows the frame at `progress`, 0 to 1 across the clip, in `texture`. */
  show(key: string, frames: Frames, level: number, texture: GPUTexture, progress: number): void {
    if (this.reduced.matches) return;
    let scrub = this.scrubs.get(key);
    if (scrub?.drawn === this.frame) return;
    const target = Math.round(Math.min(1, Math.max(0, progress)) * (frames.count - 1));
    if (!scrub || scrub.texture !== texture) {
      if (scrub) this.release(key);
      scrub = {
        key,
        frames,
        level,
        texture,
        shown: 0,
        target,
        drawn: this.frame,
        order: coarseToFine(frames.count, target),
        next: 0,
        downloading: 0,
        fetched: new Uint8Array(frames.count),
        decoded: new Map(),
        decoding: new Set(),
      };
      this.scrubs.set(key, scrub);
    }
    const step = Math.sign(target - scrub.target);
    scrub.drawn = this.frame;
    scrub.target = target;
    this.download(scrub);

    const want = this.nearest(scrub, (i) => scrub.fetched[i] === 1);
    if (want >= 0) this.decode(scrub, want);
    // Scrolling on usually wants the next frame; decode it ahead with a spare slot.
    const ahead = target + step;
    if (step && ahead >= 0 && ahead < frames.count && scrub.fetched[ahead]) this.decode(scrub, ahead);

    const best = this.nearest(scrub, (i) => scrub.decoded.has(i));
    if (best >= 0 && Math.abs(best - target) < Math.abs(scrub.shown - target)) this.upload(scrub, best);
  }

  /** End of a frame: clips that were not drawn in it drop their decoded frames. */
  settle(): void {
    for (const scrub of this.scrubs.values()) {
      if (scrub.drawn === this.frame || !scrub.decoded.size) continue;
      for (const bitmap of scrub.decoded.values()) bitmap.close();
      scrub.decoded.clear();
    }
    this.frame++;
  }

  /** Forgets a clip; call before its texture is destroyed. */
  release(key: string): void {
    const scrub = this.scrubs.get(key);
    if (!scrub) return;
    this.scrubs.delete(key);
    for (const bitmap of scrub.decoded.values()) bitmap.close();
    scrub.decoded.clear();
  }

  destroy(): void {
    for (const key of [...this.scrubs.keys()]) this.release(key);
  }

  private url(scrub: Scrub, i: number): string {
    return `${scrub.frames.dir}/${i}${scrub.level === 2 ? '' : '.half'}.webp`;
  }

  private alive(scrub: Scrub): boolean {
    return this.scrubs.get(scrub.key) === scrub;
  }

  /** The frame nearest the target that passes `ok`, or -1. */
  private nearest(scrub: Scrub, ok: (i: number) => boolean): number {
    const { target } = scrub;
    for (let d = 0; d < scrub.frames.count; d++) {
      if (target - d >= 0 && ok(target - d)) return target - d;
      if (target + d < scrub.frames.count && ok(target + d)) return target + d;
    }
    return -1;
  }

  private download(scrub: Scrub): void {
    while (scrub.downloading < DOWNLOADS && scrub.next < scrub.order.length) {
      const i = scrub.order[scrub.next++];
      scrub.downloading++;
      fetchMedia(this.url(scrub, i))
        .then(() => {
          scrub.fetched[i] = 1;
          if (this.alive(scrub)) this.onReady();
        })
        .catch((error: unknown) => console.warn('[scrub] frame failed', this.url(scrub, i), error))
        .finally(() => {
          scrub.downloading--;
          if (this.alive(scrub)) this.download(scrub);
        });
    }
  }

  private decode(scrub: Scrub, i: number): void {
    if (scrub.decoded.has(i) || scrub.decoding.has(i) || scrub.decoding.size >= DECODES) return;
    scrub.decoding.add(i);
    fetchMedia(this.url(scrub, i))
      .then((blob) => createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }))
      .then((bitmap) => {
        scrub.decoding.delete(i);
        if (!this.alive(scrub)) {
          bitmap.close();
          return;
        }
        scrub.decoded.set(i, bitmap);
        this.trim(scrub);
        this.onReady();
      })
      .catch((error: unknown) => {
        scrub.decoding.delete(i);
        console.warn('[scrub] decode failed', this.url(scrub, i), error);
      });
  }

  private trim(scrub: Scrub): void {
    while (scrub.decoded.size > KEEP) {
      let far = -1;
      for (const i of scrub.decoded.keys()) {
        if (far < 0 || Math.abs(i - scrub.target) > Math.abs(far - scrub.target)) far = i;
      }
      scrub.decoded.get(far)!.close();
      scrub.decoded.delete(far);
    }
  }

  private upload(scrub: Scrub, i: number): void {
    const bitmap = scrub.decoded.get(i)!;
    const { texture } = scrub;
    if (bitmap.width !== texture.width || bitmap.height !== texture.height) return;
    this.device.queue.copyExternalImageToTexture({ source: bitmap }, { texture, premultipliedAlpha: true }, [
      texture.width,
      texture.height,
    ]);
    scrub.shown = i;
  }
}

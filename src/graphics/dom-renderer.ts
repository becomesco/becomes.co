import type { RenderBackend } from './backend';
import { pickLevel } from './resources';
import { LAYER_GAP, type EdgeFade, type SceneFrame, type Sprite, type TextureRef } from './scene/types';

interface Node {
  root: HTMLDivElement;
  img: HTMLImageElement | null;
  src: string;
  fade: EdgeFade | null;
  seen: number;
}

interface ImageState {
  /** Null until a drawn texture has its blob URL, or when it failed. */
  url: string | null;
  loaded: boolean;
}

/** The sharpest loaded image of a texture, and when the texture first appeared. */
interface Best {
  level: number;
  url: string;
  readyAt: number;
}

const FADE_IN = 0.35;

function maskFor(fade: EdgeFade): string {
  const [t, r, b, l] = fade.map((v) => `${(v * 100).toFixed(1)}%`);
  const layers: string[] = [];
  if (fade[0] || fade[2]) layers.push(`linear-gradient(to bottom, transparent, #000 ${t}, #000 calc(100% - ${b}), transparent)`);
  if (fade[1] || fade[3]) layers.push(`linear-gradient(to right, transparent, #000 ${l}, #000 calc(100% - ${r}), transparent)`);
  return layers.join(', ');
}

/**
 * HTML/CSS fallback when WebGPU is missing or lost. Draws the same sprite list
 * with pooled, absolutely positioned elements. Not a visual twin: no bend.
 */
export class DomRenderer implements RenderBackend {
  readonly kind = 'dom';
  private nodes = new Map<string, Node>();
  private images = new Map<string, ImageState>();
  private best = new Map<string, Best>();
  private failed = new Set<string>();
  private frame = 0;
  private now = 0;
  private glow: HTMLDivElement;

  constructor(
    private host: HTMLElement,
    private onLoad: () => void,
  ) {
    host.classList.add('dom-stage');
    this.glow = document.createElement('div');
    this.glow.className = 'dom-stage__glow';
    host.append(this.glow);
  }

  get loading(): boolean {
    for (const state of this.images.values()) if (!state.loaded) return true;
    return false;
  }

  resize(): void {}

  appear(ref: TextureRef): number {
    const best = this.best.get(ref.key);
    if (!best) return this.failed.has(ref.key) ? 1 : 0;
    return Math.min(1, (this.now - best.readyAt) / FADE_IN);
  }

  prefetch(ref: TextureRef, devicePx: number): void {
    this.track(ref, pickLevel(ref, devicePx));
  }

  render(scene: SceneFrame, seconds: number): void {
    this.now = seconds;
    this.frame++;
    const [r, g, b] = scene.background;
    this.host.style.backgroundColor = `rgb(${r * 255} ${g * 255} ${b * 255})`;
    const glow = scene.glows[0];
    if (glow && glow.strength > 0.01) {
      const [gr, gg, gb] = glow.color;
      this.glow.style.opacity = String(Math.min(1, glow.strength));
      this.glow.style.background = `radial-gradient(circle ${glow.radius}px at ${glow.x}px ${glow.y}px, rgb(${gr * 255} ${gg * 255} ${gb * 255}), transparent)`;
    } else {
      this.glow.style.opacity = '0';
    }

    const dpr = window.devicePixelRatio || 1;
    for (let i = 0; i < scene.sprites.length; i++) {
      const s = scene.sprites[i];
      if (s.opacity <= 0.002 || s.y > window.innerHeight || s.y + s.h < 0) continue;
      this.draw(s, i, dpr);
    }
    for (const [id, node] of this.nodes) {
      if (node.seen === this.frame) continue;
      if (this.frame - node.seen > 120) {
        node.root.remove();
        this.nodes.delete(id);
      } else if (node.root.style.display !== 'none') {
        node.root.style.display = 'none';
      }
    }
  }

  destroy(): void {
    for (const node of this.nodes.values()) node.root.remove();
    this.nodes.clear();
    for (const state of this.images.values()) if (state.url?.startsWith('blob:')) URL.revokeObjectURL(state.url);
    this.images.clear();
    this.best.clear();
    this.failed.clear();
    this.glow.remove();
    this.host.classList.remove('dom-stage');
  }

  /** Loads a texture at a level unless a level at least as sharp is already loaded. */
  private track(ref: TextureRef, level: number): void {
    const best = this.best.get(ref.key);
    if (best && best.level >= level) return;
    const id = `${ref.key}:${level}`;
    if (this.images.has(id)) return;
    const state: ImageState = { url: null, loaded: false };
    this.images.set(id, state);
    const done = (ok: boolean) => {
      state.loaded = true;
      const current = this.best.get(ref.key);
      if (ok && state.url && (!current || current.level < level)) {
        this.best.set(ref.key, { level, url: state.url, readyAt: current?.readyAt ?? this.now });
      } else if (!ok && !current) {
        this.failed.add(ref.key);
      }
      this.onLoad();
    };
    const load = (url: string) => {
      state.url = url;
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => done(true);
      img.onerror = () => done(false);
      img.src = url;
    };
    if ('draw' in ref) {
      ref
        .draw(level)
        .then((canvas) => (ref.shadowed ? flatten(canvas) : canvas))
        .then((canvas) => new Promise<Blob | null>((resolve) => canvas.toBlob(resolve)))
        .then((blob) => (blob ? load(URL.createObjectURL(blob)) : done(false)))
        .catch((error) => {
          console.warn('[textures] failed', ref.key, error);
          done(false);
        });
    } else {
      load(level === 2 ? ref.src : ref.half);
    }
  }

  private draw(s: Sprite, order: number, dpr: number): void {
    let node = this.nodes.get(s.id);
    if (!node) {
      const root = document.createElement('div');
      root.className = 'dom-sprite';
      this.host.append(root);
      node = { root, img: null, src: '', fade: null, seen: 0 };
      this.nodes.set(s.id, node);
    }
    node.seen = this.frame;
    const { root } = node;
    const style = root.style;
    style.display = '';
    style.zIndex = String(order);
    style.width = `${s.w}px`;
    style.height = `${s.h}px`;
    style.transform = `translate3d(${s.x}px, ${s.y}px, 0)`;
    style.opacity = String(s.opacity);
    style.borderRadius = `${s.radius}px`;
    style.setProperty('--card', String(s.card));

    if (s.texture) {
      this.track(s.texture, pickLevel(s.texture, s.iw * dpr));
      const best = this.best.get(s.texture.key);
      if (!node.img) {
        node.img = document.createElement('img');
        node.img.alt = '';
        node.img.decoding = 'async';
        root.append(node.img);
      }
      if (best && node.src !== best.url) {
        node.img.src = best.url;
        node.src = best.url;
      }
      const img = node.img.style;
      img.width = `${s.iw}px`;
      img.height = `${s.ih}px`;
      img.transform = `translate3d(${s.ix - s.x}px, ${s.iy - s.y}px, 0)`;
      img.borderRadius = `${s.innerRadius}px`;
      img.opacity = String(s.image);
      if (node.fade !== s.fade) {
        node.fade = s.fade;
        const mask = s.fade.some((v) => v > 0) ? maskFor(s.fade) : '';
        img.maskImage = mask;
        img.webkitMaskImage = mask;
        img.maskComposite = 'intersect';
      }
    }
  }
}

/** One image from a shadowed texture: its shadow layer under its image layer. */
function flatten(source: HTMLCanvasElement): HTMLCanvasElement {
  const rows = (source.height - LAYER_GAP) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = rows;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  ctx.drawImage(source, 0, rows + LAYER_GAP, source.width, rows, 0, 0, source.width, rows);
  ctx.drawImage(source, 0, 0, source.width, rows, 0, 0, source.width, rows);
  return canvas;
}

import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { createSprite, type Sprite, type TextureRef } from '../../graphics/scene/types';
import type { MarkSpot } from '../../ui/overlays/loader';
import { clamp, easeOutCubic, saturate } from '../../utils/math';
import { textureFor } from '../data/works';
import { createGrid } from '../home/grid';
import { NotePress, noteTexture } from '../note';
import type { AppContext, DrawList, View } from '../view';

interface Piece {
  texture: TextureRef;
  /** Figma rect at 1440×1024: x, y, width (height follows the media aspect). */
  x: number;
  y: number;
  w: number;
  frame: boolean;
  depth: number;
  sprite: Sprite;
  base: { x: number; y: number; w: number; h: number };
  delay: number;
}

const FRAME_PAD = 6;
const FRAME_RADIUS = 17;

const NOTE = [
  'Every so often we pack our laptops and work together from somewhere new.',
  'A change of scenery keeps the ideas fresh and the team close.',
];

function piece(texture: TextureRef, x: number, y: number, w: number, frame: boolean, depth: number, delay: number): Piece {
  const sprite = createSprite(`about:${texture.key}`, texture);
  if (frame) {
    sprite.card = 1;
    sprite.radius = FRAME_RADIUS;
    sprite.innerRadius = FRAME_RADIUS - FRAME_PAD;
  }
  return { texture, x, y, w, frame, depth, sprite, base: { x: 0, y: 0, w: 0, h: 0 }, delay };
}

/**
 * About: readable copy in the browser layer, framed photos on the canvas with pointer parallax, and
 * the live Glass mark standing between them. The mark's still holds its spot and shows without WebGPU.
 */
export class AboutView implements View, MarkSpot {
  readonly name = 'about';
  readonly scroll = new VirtualScroll();
  readonly root: HTMLElement;
  presence = 0;
  hidden: string | null = null;
  markLive = false;
  readonly markFrame = { x: 0, y: 0, height: 0, opacity: 0 };

  private content: HTMLElement;
  private copy: HTMLElement;
  private pieces: Piece[] = [
    piece(textureFor('brand/glass-mark'), 20, 400, 721, false, 1.3, 0.1),
    piece(textureFor('about/photo-desk'), 150, -30, 300, true, 0.55, 0.3),
    piece(textureFor('about/photo-studio'), -110, 290, 420, true, 0.7, 0.25),
    piece(textureFor('about/photo-team'), 880, 40, 470, true, 1, 0.2),
    piece(textureFor('about/photo-terrace'), 1075, 545, 330, true, 0.85, 0.4),
    piece(noteTexture('about/note', NOTE), 667, -34, 264, false, 0.45, 0.5),
  ];
  private press = new NotePress();
  private px = new Spring(0, 60, 14);
  private py = new Spring(0, 60, 14);
  private openedAt = 0;
  private now = 0;
  private contentStyle = '';

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="about"]')!;
    this.content = this.root.querySelector<HTMLElement>('.about__content')!;
    this.copy = this.root.querySelector<HTMLElement>('.about__copy')!;
  }

  open(): void {
    this.openedAt = this.now;
    this.scroll.to(0, true);
    this.contentStyle = '';
  }

  layout(): void {
    const { width: vw, height: vh, reducedMotion } = this.ctx.viewport.state;
    this.content.style.transform = 'none';
    this.contentStyle = '';
    let bottom = vh;

    if (vw >= 900 && vh >= 560) {
      // The Figma composition, scaled to the viewport and kept centered on it.
      const sx = vw / 1440;
      const sy = clamp(vh / 1024, 0.7, 1.25);
      const s = Math.min(sx, sy * 1.1);
      for (const p of this.pieces) {
        const [pw, ph] = p.texture.px;
        const w = p.w * s;
        const h = p.frame ? (w - FRAME_PAD * 2) * (ph / pw) + FRAME_PAD * 2 : (w * ph) / pw;
        const cx = (p.x + p.w / 2) * sx;
        const cy = vh / 2 + (p.y + (p.w * ph) / pw / 2 - 512) * sy;
        p.base = { x: cx - w / 2, y: cy - h / 2, w, h };
      }
      this.copy.classList.remove('about__copy--flow');
    } else {
      // Narrow screens: copy first, then the photos in a single column.
      this.copy.classList.add('about__copy--flow');
      const grid = createGrid(vw);
      let y = this.copy.offsetTop + this.copy.offsetHeight + 48;
      const order = [3, 5, 2, 4, 1, 0];
      const W = vw - grid.margin * 2;
      for (const index of order) {
        const p = this.pieces[index];
        const [pw, ph] = p.texture.px;
        const w = index === 5 ? W * 0.62 : index === 0 ? W * 0.9 : W;
        const h = p.frame ? (w - FRAME_PAD * 2) * (ph / pw) + FRAME_PAD * 2 : (w * ph) / pw;
        const x = index === 5 ? vw - grid.margin - w : (vw - w) / 2;
        p.base = { x, y, w, h };
        y += h + grid.gutter * 2;
      }
      bottom = y + 40;
    }
    bottom = Math.max(bottom, this.copy.offsetTop + this.copy.offsetHeight + 40);
    this.scroll.setEase(reducedMotion ? 60 : 9);
    this.scroll.setMax(bottom - vh);
  }

  update(frame: FrameTime): boolean {
    this.now = frame.elapsed;
    let active = this.scroll.update(frame.dt);
    const { reducedMotion, height: vh } = this.ctx.viewport.state;
    const pointer = this.ctx.pointer.state;
    const s = this.scroll.current;
    this.px.target = reducedMotion || !pointer.inside ? 0 : pointer.nx;
    this.py.target = reducedMotion || !pointer.inside ? 0 : pointer.ny;
    if (this.px.update(frame.dt)) active = true;
    if (this.py.update(frame.dt)) active = true;
    if (this.press.update(this.scroll.velocity, frame.dt, reducedMotion)) active = true;
    const t = this.now - this.openedAt;

    const copyIn = reducedMotion ? 1 : easeOutCubic(saturate((t - 0.15) / 0.8));
    if (copyIn < 1) active = true;
    const contentStyle = `${(-s).toFixed(2)}|${copyIn.toFixed(3)}|${this.presence.toFixed(3)}`;
    if (contentStyle !== this.contentStyle) {
      this.contentStyle = contentStyle;
      this.content.style.transform = `translate3d(0, ${(-s).toFixed(2)}px, 0)`;
      this.copy.style.opacity = (copyIn * this.presence).toFixed(3);
      this.copy.style.transform = `translate3d(0, ${((1 - copyIn) * 24).toFixed(2)}px, 0)`;
    }

    for (const p of this.pieces) {
      const reveal = reducedMotion ? 1 : easeOutCubic(saturate((t - p.delay) / 0.9));
      if (reveal < 1) active = true;
      this.ctx.engine.prefetch(p.texture, p.base.w);
      const appear = this.ctx.engine.appear(p.texture);
      if (appear < 1) active = true;
      const shiftX = -this.px.value * 18 * p.depth;
      const shiftY = -this.py.value * 14 * p.depth + (1 - reveal) * 60 * p.depth - s * (0.9 + p.depth * 0.1);
      const { x, y, w, h } = p.base;
      const sprite = p.sprite;
      sprite.x = x + shiftX;
      sprite.y = y + shiftY;
      sprite.w = w;
      sprite.h = h;
      const pad = p.frame ? FRAME_PAD : 0;
      sprite.ix = sprite.x + pad;
      sprite.iy = sprite.y + pad;
      sprite.iw = w - pad * 2;
      sprite.ih = h - pad * 2;
      sprite.opacity = reveal * this.presence * (p.frame ? 1 : appear);
      sprite.image = appear;
      sprite.lift = this.press.lift;
      if (sprite.y > vh * 2) sprite.opacity = 0;
    }

    const mark = this.pieces[0];
    const reveal = reducedMotion ? 1 : easeOutCubic(saturate((t - mark.delay) / 0.9));
    this.markFrame.x = mark.sprite.x + mark.sprite.w / 2;
    this.markFrame.y = mark.sprite.y + mark.sprite.h / 2;
    this.markFrame.height = mark.sprite.h;
    this.markFrame.opacity = mark.sprite.y > vh * 2 ? 0 : reveal * this.presence;
    return active;
  }

  draw(out: DrawList): void {
    if (this.presence <= 0.001) return;
    for (const p of this.pieces) {
      if (p === this.pieces[0] && this.markLive) continue;
      out.sprites.push(p.sprite);
    }
  }

  sleep(): void {
    this.copy.style.opacity = '0';
    this.contentStyle = '';
    this.markFrame.opacity = 0;
  }
}

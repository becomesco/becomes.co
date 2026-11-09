import { clamp, lerp, saturate } from '../utils/math';
import { createRandom, range } from '../utils/random';
import { OTHER_INSET } from './home/other';

/** Largest display size relative to the design size; beyond this the 2x export goes soft. */
export const MAX_UPSCALE = 1.3;
/** How much further a magnet is turned as it lands, as a multiple of its resting turn. */
export const LAND_TURN = 2.2;
/** Share of the collage the magnets cover; the rest is fridge showing between them. */
const COLLAGE_FILL = 0.66;
/** Shortest collage, share of the viewport. */
const COLLAGE_MIN = 0.8;
/** Positions tried per magnet; the one with the least overlap and the most room around it wins. */
const COLLAGE_TRIES = 260;
/** Widest a Note gets in the collage, share of the content width, so its copy stays readable. */
const NOTE_SHARE = 0.62;
/** Largest magnet turn in degrees, for small and large magnets. */
const TILT_SMALL = 7;
const TILT_LARGE = 2;
const DEG = Math.PI / 180;

export interface Magnet {
  /** Design size, CSS px, including the frame. */
  width: number;
  height: number;
  /** Texture pixel size. */
  px: readonly [number, number];
  frame: boolean;
  note: boolean;
}

/** Where a magnet rests: outer rect, image rect inside the frame, turn in radians, and scroll px past the viewport's bottom edge before it lands. */
export interface Placement {
  x: number;
  y: number;
  w: number;
  h: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  tilt: number;
  delay: number;
}

export interface Collage {
  placements: Placement[];
  /** Magnet indices in draw order, so smaller magnets sit on top of the larger ones they overlap. */
  order: number[];
  height: number;
}

/** Area two rects share. */
function overlap(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): number {
  const w = Math.min(ax + aw, bx + bw) - Math.max(ax, bx);
  const h = Math.min(ay + ah, by + bh) - Math.max(ay, by);
  return w > 0 && h > 0 ? w * h : 0;
}

/** Distance between two rects' edges; 0 when they touch or overlap. */
function clearance(ax: number, ay: number, aw: number, ah: number, bx: number, by: number, bw: number, bh: number): number {
  const dx = Math.max(0, bx - (ax + aw), ax - (bx + bw));
  const dy = Math.max(0, by - (ay + ah), ay - (by + bh));
  return Math.hypot(dx, dy);
}

/**
 * Magnets tilted and scattered like on a fridge, in a `W` wide band at `top`. Sized so together
 * they cover COLLAGE_FILL of the band; largest first, each where it overlaps the others least and,
 * among spots that are clear, the one with the most room around it.
 */
export function layoutCollage(magnets: readonly Magnet[], left: number, top: number, W: number, vw: number, vh: number, gap: number, seed: number): Collage {
  const random = createRandom(seed);
  const base = clamp(0.25 + (vw / 1440) * 0.75, 0.42, 1.15);
  const scales = magnets.map((m) => (m.note ? Math.max(base, Math.min(1, (W * NOTE_SHARE) / m.width)) : base));
  const area = (k: number) => magnets.reduce((sum, m, i) => sum + m.width * m.height * (scales[i] * k) ** 2, 0);
  // A few magnets grow to fill the shortest band, as far as their exports stay sharp.
  const grow = clamp(Math.sqrt((vh * COLLAGE_MIN * COLLAGE_FILL * W) / Math.max(1, area(1))), 1, MAX_UPSCALE / base);

  const items = magnets.map((m, index) => {
    const scale = scales[index];
    const [pw, ph] = m.px;
    const inset = m.frame ? OTHER_INSET : 0;
    let w = Math.min(m.width * scale * grow, W * 0.9);
    if (m.note) w = Math.min(w, Math.max(m.width * scale, W * NOTE_SHARE));
    const iw = w - inset * 2;
    const ih = (iw * ph) / pw;
    const h = ih + inset * 2;
    const size = Math.max(w, h);
    const tilt = range(random, -1, 1) * lerp(TILT_SMALL, TILT_LARGE, saturate((size - 160) / 520)) * DEG;
    const cos = Math.abs(Math.cos(tilt));
    const sin = Math.abs(Math.sin(tilt));
    // Turned bounds, with half a gutter of room on every side.
    const bw = w * cos + h * sin + gap;
    const bh = w * sin + h * cos + gap;
    return { index, w, h, iw, ih, inset, tilt, bw, bh, bx: 0, by: 0 };
  });
  const covered = items.reduce((sum, it) => sum + it.bw * it.bh, 0);
  const H = Math.max(vh * COLLAGE_MIN, covered / (W * COLLAGE_FILL), ...items.map((it) => it.bh));

  const order = items.slice().sort((a, b) => b.bw * b.bh - a.bw * a.bh);
  const placed: typeof items = [];
  for (const it of order) {
    let best = Infinity;
    for (let k = 0; k < COLLAGE_TRIES; k++) {
      const x = range(random, 0, Math.max(0, W + gap - it.bw)) - gap / 2;
      const y = range(random, 0, Math.max(0, H - it.bh));
      let hit = 0;
      let room = Infinity;
      for (const p of placed) {
        hit += overlap(x, y, it.bw, it.bh, p.bx, p.by, p.bw, p.bh);
        room = Math.min(room, clearance(x, y, it.bw, it.bh, p.bx, p.by, p.bw, p.bh));
      }
      const score = hit / (it.bw * it.bh) - Math.min(room, W) / W;
      if (score < best) {
        best = score;
        it.bx = x;
        it.by = y;
      }
    }
    placed.push(it);
  }

  const height = Math.max(...items.map((it) => it.by + it.bh)) - gap / 2;
  const placements = items.map((it) => {
    const x = left + it.bx + (it.bw - it.w) / 2;
    const y = top + it.by + (it.bh - it.h) / 2;
    return {
      x,
      y,
      w: it.w,
      h: it.h,
      ix: x + it.inset,
      iy: y + it.inset,
      iw: it.iw,
      ih: it.ih,
      tilt: it.tilt,
      delay: range(random, 0, vh * 0.12),
    };
  });
  return { placements, order: order.map((it) => it.index), height };
}

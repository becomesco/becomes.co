import type { Asset } from '../data/works';
import { clamp } from '../../utils/math';
import { createRandom, hashString, range, shuffle, type Random } from '../../utils/random';
import { columnX, createGrid, spanFor, spanWidth, type Grid } from './grid';
import { computeOther, type OtherLayout } from './other';

/**
 * Home layout, in scroll space.
 *
 * Every object has an anchor `a`: the scroll offset at which its center sits at the
 * viewport center. Its screen center is `c + (a - s) * v` for scroll `s` and parallax
 * speed `v`. Titles are piecewise: they enter at speed 1, pin at the center between
 * `p0` and `p1`, then leave at speed 1. Because every motion is linear in `s`, two
 * objects can be tested for overlap exactly by checking the ends of the scroll range
 * where both are on screen.
 *
 * Wide screens lay Assets out as a field around the title: left, center and right zones,
 * as in the Figma screens. The title is not an obstacle there; Assets pass behind it, and
 * the renderer's glass keeps it readable. Narrow screens stack Assets in one column.
 */

export type LayoutMode = 'field' | 'stack';

type Zone = 'left' | 'center' | 'right';

/** Chance the next Asset after a side one goes to the center; about 30% of a Work's Assets end up there. */
const CENTER_CHANCE = 0.42;

export interface TitleBox {
  width: number;
  height: number;
}

export interface SectionInput {
  key: string;
  title: TitleBox;
  assets: readonly Asset[];
}

export interface Placement {
  index: number;
  section: number;
  asset: Asset;
  copy: number;
  x: number;
  w: number;
  h: number;
  anchor: number;
  speed: number;
  /** Scroll range where any part can be on screen. */
  sMin: number;
  sMax: number;
}

export interface SectionLayout {
  key: string;
  p0: number;
  p1: number;
  title: TitleBox;
  placements: Placement[];
}

export interface HomeLayout {
  mode: LayoutMode;
  grid: Grid;
  width: number;
  height: number;
  sections: SectionLayout[];
  /** All placements, sorted by `sMin`. */
  placements: Placement[];
  /** Longest visible window, for range queries. */
  span: number;
  /** The Other grid under the last section's title, if any. */
  other: OtherLayout | null;
  max: number;
}

export interface LayoutOptions {
  width: number;
  height: number;
  reducedMotion: boolean;
  copies: number;
  /** Height over width of each Other piece; the last section is then the Other title. */
  other?: readonly number[];
}

interface Body {
  x0: number;
  x1: number;
  h: number;
  a: number;
  v: number;
  s0: number;
  s1: number;
}

const ENTRY_MARGIN = 48;
/** Empty ground after the last section, in viewport heights, for the Glass mark to fly back in over. */
const CLOSING = 1;

const screenOffset = (b: Body, s: number): number => (b.a - s) * b.v;

function collides(p: Body, q: Body, gapX: number, gapY: number): boolean {
  if (p.x1 + gapX <= q.x0 || q.x1 + gapX <= p.x0) return false;
  const lo = Math.max(p.s0, q.s0);
  const hi = Math.min(p.s1, q.s1);
  if (lo > hi) return false;
  const need = (p.h + q.h) / 2 + gapY;
  const d0 = screenOffset(p, lo) - screenOffset(q, lo);
  const d1 = screenOffset(p, hi) - screenOffset(q, hi);
  if (d0 > 0 !== d1 > 0) return true;
  return Math.min(Math.abs(d0), Math.abs(d1)) < need;
}

function titleBodies(width: number, height: number, title: TitleBox, p0: number, p1: number): Body[] {
  const x0 = (width - title.width) / 2;
  const x1 = x0 + title.width;
  const reach = height / 2 + title.height / 2 + ENTRY_MARGIN;
  return [
    { x0, x1, h: title.height, a: p0, v: 1, s0: p0 - reach, s1: p0 },
    { x0, x1, h: title.height, a: 0, v: 0, s0: p0, s1: p1 },
    { x0, x1, h: title.height, a: p1, v: 1, s0: p1, s1: p1 + reach },
  ];
}

/**
 * Copies of a Work's Assets, each copy shuffled, never the same Asset again within three
 * places (fewer for Works with fewer Assets), so one doesn't show up twice on screen.
 */
function sequence(assets: readonly Asset[], copies: number, random: Random): { asset: Asset; copy: number }[] {
  const out: { asset: Asset; copy: number }[] = [];
  const spacing = Math.min(3, assets.length - 1);
  for (let copy = 0; copy < copies; copy++) {
    const order = shuffle(assets, random);
    for (let i = 0; i < spacing; i++) {
      const recent = (a: Asset) => out.slice(out.length - (spacing - i)).some((o) => o.asset === a);
      if (!recent(order[i])) continue;
      const j = order.findIndex((a, k) => k > i && !recent(a));
      if (j > 0) [order[i], order[j]] = [order[j], order[i]];
    }
    for (const asset of order) out.push({ asset, copy });
  }
  return out;
}

export function computeLayout(sections: readonly SectionInput[], options: LayoutOptions): HomeLayout {
  const { width, height: vh } = options;
  const grid = createGrid(width);

  // Side zones beside the widest Work title; fall back to a single stacked column.
  const workTitleWidth = Math.max(0, ...sections.filter((s) => s.assets.length).map((s) => s.title.width));
  const laneEdge = (width - workTitleWidth) / 2 - grid.gutter;
  let laneCols = 0;
  while (laneCols < grid.columns / 2 && columnX(grid, laneCols) + grid.column <= laneEdge) laneCols++;
  const mode: LayoutMode = laneCols >= 2 && vh >= 480 ? 'field' : 'stack';
  const laneRight = columnX(grid, laneCols - 1) + grid.column;

  const depth = options.reducedMotion ? 0 : mode === 'field' ? 0.12 : 0.05;
  const sizeScale = mode === 'field' ? clamp(width / 1440, 0.62, 1.3) : clamp(width / 620, 0.55, 1);
  const maxH = vh * (mode === 'field' ? 0.62 : 0.56);
  // Center Assets cross the title, so they stay small, as they are in Figma.
  const centerMaxH = vh * 0.42;
  const pinShort = vh * 0.28;
  const step = vh * 0.035;

  const bodies: Body[] = [];
  const placements: Placement[] = [];
  const out: SectionLayout[] = [];
  let p0 = 0;

  for (let k = 0; k < sections.length; k++) {
    const section = sections[k];
    const random = createRandom(hashString(`${section.key}:${mode}`));
    const placed: Placement[] = [];
    const layout: SectionLayout = { key: section.key, p0, p1: p0, title: section.title, placements: placed };

    const field = mode === 'field' && section.assets.length > 0;
    if (!field) {
      layout.p1 = section.assets.length ? p0 + pinShort : p0;
      if (mode === 'stack') bodies.push(...titleBodies(width, vh, section.title, layout.p0, layout.p1));
    }

    let cursor = mode === 'field' ? p0 - vh * 0.22 : layout.p1 + vh * 0.2;
    // A Work's Assets stay below the fold while the previous title is still pinned.
    const previousP1 = k > 0 ? out[k - 1].p1 : -Infinity;
    let zone: Zone = random() < 0.5 ? 'left' : 'right';
    const maxArea = Math.max(1, ...section.assets.map((a) => a.width * a.height));

    for (const { asset, copy } of sequence(section.assets, options.copies, random)) {
      const forced: Zone | null = asset.cut.has('left') ? 'left' : asset.cut.has('right') ? 'right' : null;
      if (mode === 'field') zone = forced ?? nextZone(zone, random);

      const box = mode === 'stack'
        ? stackBox(asset, grid, sizeScale, maxH, random)
        : zone === 'center'
          ? centerBox(asset, grid, sizeScale, centerMaxH, random)
          : sideBox(asset, grid, laneCols, laneRight, sizeScale, maxH, random);
      let x = box.x;
      if (mode === 'field' && zone === 'right') x = width - (x + box.w);

      const z = clamp(0.5 * ((box.w * box.h) / (maxArea * sizeScale * sizeScale)) + 0.5 * random(), 0, 1);
      const v = 1 + depth * (z * 2 - 1);
      const reach = (vh / 2 + box.h / 2 + ENTRY_MARGIN) / v;
      const gapY = grid.gutter * range(random, 1.6, 4.2);

      const body: Body = { x0: x, x1: x + box.w, h: box.h, a: Math.max(cursor, previousP1 + reach), v, s0: 0, s1: 0 };
      for (let tries = 0; tries < 600; tries++) {
        body.s0 = body.a - reach;
        body.s1 = body.a + reach;
        if (!bodies.some((other) => collides(body, other, grid.gutter, gapY))) break;
        body.a += step;
      }
      bodies.push(body);

      const placement: Placement = {
        index: placements.length,
        section: k,
        asset,
        copy,
        x,
        w: box.w,
        h: box.h,
        anchor: body.a,
        speed: v,
        sMin: body.s0,
        sMax: body.s1,
      };
      placements.push(placement);
      placed.push(placement);
      cursor = body.a + vh * (mode === 'field' ? range(random, 0.08, 0.2) : range(random, 0.04, 0.14));
    }

    const lastAnchor = placed.length ? Math.max(...placed.map((p) => p.anchor)) : layout.p1;
    if (field) layout.p1 = Math.max(p0 + pinShort, lastAnchor + vh * 0.15);
    out.push(layout);

    const next = sections[k + 1];
    if (next) {
      const gap = Math.max(vh * 0.75, (section.title.height + next.title.height) / 2 + 160);
      let nextP0 = Math.max(layout.p1 + gap, mode === 'stack' ? lastAnchor + vh * 0.25 : 0);
      for (let tries = 0; mode === 'stack' && tries < 400; tries++) {
        const probe = titleBodies(width, vh, next.title, nextP0, nextP0 + pinShort).slice(0, 2);
        if (!placed.some((p) => probe.some((t) => collides(t, bodyOf(p), grid.gutter, grid.gutter * 2)))) break;
        nextP0 += step;
      }
      p0 = nextP0;
    }
  }

  placements.sort((a, b) => a.sMin - b.sMin);
  const last = out[out.length - 1];
  const other = last && options.other?.length ? computeOther(grid, vh, last.p0, last.title.height, options.other) : null;
  return {
    mode,
    grid,
    width,
    height: vh,
    sections: out,
    placements,
    span: Math.max(0, ...placements.map((p) => p.sMax - p.sMin)),
    other,
    max: last ? Math.max(last.p1, other ? other.max : 0) + vh * CLOSING : 0,
  };
}

function bodyOf(p: Placement): Body {
  return { x0: p.x, x1: p.x + p.w, h: p.h, a: p.anchor, v: p.speed, s0: p.sMin, s1: p.sMax };
}

interface Box {
  x: number;
  w: number;
  h: number;
}

/** The zone after `zone`: never the same twice, so the field keeps moving around the title. */
function nextZone(zone: Zone, random: Random): Zone {
  if (zone === 'center') return random() < 0.5 ? 'left' : 'right';
  if (random() < CENTER_CHANCE) return 'center';
  return zone === 'left' ? 'right' : 'left';
}

/**
 * Center box, up to a third of the grid wide, around the viewport center and nudged up to
 * a column and a half either way on half-column steps.
 */
function centerBox(asset: Asset, grid: Grid, scale: number, maxH: number, random: Random): Box {
  const aspect = asset.height / asset.width;
  const maxSpan = Math.max(2, Math.round(grid.columns / 3));
  let span = clamp(spanFor(grid, asset.width * scale * range(random, 0.8, 1.05)), 1, maxSpan);
  while (span > 1 && spanWidth(grid, span) * aspect > maxH) span--;
  const w = spanWidth(grid, span);
  const nudge = (Math.floor(random() * 7) - 3) / 2;
  return { x: columnX(grid, (grid.columns - span) / 2 + nudge), w, h: w * aspect };
}

/** Left-zone box; the caller mirrors it for the right zone. */
function sideBox(
  asset: Asset,
  grid: Grid,
  laneCols: number,
  laneRight: number,
  scale: number,
  maxH: number,
  random: Random,
): Box {
  const aspect = asset.height / asset.width;
  const cut = asset.cut.has('left') || asset.cut.has('right');
  const maxSpan = laneCols + Math.max(1, Math.floor(laneCols * 0.6));
  let span = clamp(spanFor(grid, asset.width * scale * range(random, 0.85, 1.15)), 1, maxSpan);
  while (span > 1 && spanWidth(grid, span) * aspect > maxH) span--;

  for (;;) {
    const w = spanWidth(grid, span);
    const h = w * aspect;
    if (cut) {
      const x = Math.min(laneRight - w, -w * range(random, 0.05, 0.14));
      if (x + w >= w * 0.55 || span === 1) return { x, w, h };
    } else if (span <= laneCols) {
      const slots = (laneCols - span) * 2;
      let x = columnX(grid, Math.floor(random() * (slots + 1)) / 2);
      if (span >= 2 && random() < 0.22) x -= w * range(random, 0.1, 0.28);
      return { x, w, h };
    } else {
      const x = laneRight - w;
      if (-x <= w * 0.35) return { x, w, h };
    }
    span--;
  }
}

function stackBox(asset: Asset, grid: Grid, scale: number, maxH: number, random: Random): Box {
  const aspect = asset.height / asset.width;
  const minSpan = Math.min(2, grid.columns);
  let span = clamp(spanFor(grid, asset.width * scale * range(random, 0.85, 1.15)), minSpan, grid.columns);
  while (span > minSpan && spanWidth(grid, span) * aspect > maxH) span--;
  const w = spanWidth(grid, span);
  const h = w * aspect;
  if (asset.cut.has('left')) return { x: -w * range(random, 0.06, 0.16), w, h };
  if (asset.cut.has('right')) return { x: grid.width - w * range(random, 0.84, 0.94), w, h };
  const slots = (grid.columns - span) * 2;
  return { x: columnX(grid, Math.floor(random() * (slots + 1)) / 2), w, h };
}

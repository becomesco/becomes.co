import { LAYER_GAP, type DrawnTexture } from '../graphics/scene/types';
import { damp, smoothstep } from '../utils/math';
import media from './data/media.json';

/*
 * The Note from Figma (node 167:45439), drawn in code: three blurred shadow shapes,
 * the paper, then the copy. CSS px at the 1440 design size. The canvas origin is the
 * left edge of the shadow, 4.18px left of the note frame.
 */
const WIDTH = 264;
const HEIGHT = 289;

const PAPER = { x: 0.18, y: 0, w: 260.38, h: 254.51 };
/** Words are set with thin spaces (1/5 em) in Figma, not the font's wider space. */
const TEXT = { x: 29.18, y: 72, w: 202, size: 14, lineHeight: 20, paragraphGap: 14, wordGap: 0.2, color: '#000' };
const FALLBACK_FONT = "'Grillmaster Wide', 'Helvetica Neue', Arial, sans-serif";

interface Shadow {
  /** Polygon in the Figma shadow vector's own space. */
  points: readonly number[];
  /** Gaussian standard deviation. */
  blur: number;
  /** The Figma filter region; the blur is cut off at its edges. */
  clip: readonly [number, number, number, number];
  fill: string | { from: readonly [number, number]; to: readonly [number, number]; stops: readonly [string, string] };
}

/** The shadow vector sits this far down the canvas. */
const SHADOW_Y = 27.24;
const SHADOWS: readonly Shadow[] = [
  {
    points: [233.141, 188.113, 43.2394, 188.113, 35.4084, 242.93, 235.099, 230.948],
    blur: 9,
    clip: [17.4084, 170.113, 235.69, 90.8168],
    fill: 'rgba(0, 0, 0, 0.29)',
  },
  {
    points: [238.035, 202.796, 19.7465, 202.796, 15.831, 239.014, 256.634, 226.289],
    blur: 3.5,
    clip: [8.83098, 195.796, 254.803, 50.2183],
    fill: { from: [105.887, 209.648], to: [21.7043, 239.014], stops: ['rgba(0, 0, 0, 0.4)', 'rgba(32, 32, 32, 0.144)'] },
  },
  {
    points: [239.014, 14.8521, 11.9155, 8, 8, 219.437, 252.718, 219.437],
    blur: 4,
    clip: [0, 0, 260.718, 227.437],
    fill: { from: [129.38, -21.3662], to: [134.275, 252.718], stops: ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0.3)'] },
  },
];

/**
 * Canvas `filter` is not reliable in Safari, so each shape is drawn off to the left
 * and only its shadow (σ = shadowBlur / 2, in device px) lands inside the clip.
 */
const OFFSET = 300;
/** Line breaks are measured at this scale, so a redraw at another resolution never reflows the copy. */
const LAYOUT_SCALE = 2;

/** Paper (top layer) and shadow (bottom layer), shared by every Note at one scale. */
const bases = new Map<number, Promise<HTMLCanvasElement>>();

function canvasAt(scale: number): [HTMLCanvasElement, CanvasRenderingContext2D, number] {
  const rows = Math.round(HEIGHT * scale);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(WIDTH * scale);
  canvas.height = rows * 2 + LAYER_GAP;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  return [canvas, ctx, rows];
}

function drawShadow(ctx: CanvasRenderingContext2D, shadow: Shadow, scale: number, top: number): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, top + SHADOW_Y * scale);
  const [cx, cy, cw, ch] = shadow.clip;
  ctx.beginPath();
  ctx.rect(cx, cy, cw, ch);
  ctx.clip();

  ctx.translate(-OFFSET, 0);
  ctx.shadowOffsetX = OFFSET * scale;
  ctx.shadowBlur = shadow.blur * 2 * scale;
  ctx.shadowColor = '#000';
  const { fill } = shadow;
  if (typeof fill === 'string') {
    ctx.fillStyle = fill;
  } else {
    const gradient = ctx.createLinearGradient(fill.from[0], fill.from[1], fill.to[0], fill.to[1]);
    gradient.addColorStop(0, fill.stops[0]);
    gradient.addColorStop(1, fill.stops[1]);
    ctx.fillStyle = gradient;
  }
  const p = shadow.points;
  ctx.beginPath();
  ctx.moveTo(p[0], p[1]);
  for (let i = 2; i < p.length; i += 2) ctx.lineTo(p[i], p[i + 1]);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

function base(scale: number): Promise<HTMLCanvasElement> {
  let pending = bases.get(scale);
  if (!pending) {
    const paper = media['note/paper'];
    pending = loadImage(scale > 1.15 ? paper.src : paper.half).then((img) => {
      const [canvas, ctx, rows] = canvasAt(scale);
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, PAPER.x, PAPER.y, PAPER.w, PAPER.h);
      for (const shadow of SHADOWS) drawShadow(ctx, shadow, scale, rows + LAYER_GAP);
      return canvas;
    });
    pending.catch(() => bases.delete(scale));
    bases.set(scale, pending);
  }
  return pending;
}

function fontAt(scale: number): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue('--font-text').trim() || FALLBACK_FONT;
  // Set at device size: a scaled transform keeps 1x glyph advances and sets the copy too wide.
  return `${TEXT.size * scale}px ${family}`;
}

/** Words per line, per paragraph. */
type Lines = string[][][];

async function layout(paragraphs: readonly string[]): Promise<Lines> {
  const font = fontAt(LAYOUT_SCALE);
  await document.fonts.load(font).catch(() => []);
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) throw new Error('No 2D canvas context');
  ctx.font = font;
  const width = TEXT.w * LAYOUT_SCALE;
  const gap = TEXT.size * TEXT.wordGap * LAYOUT_SCALE;
  return paragraphs.map((paragraph) => {
    const lines: string[][] = [];
    let line: string[] = [];
    let used = 0;
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const w = ctx.measureText(word).width;
      if (line.length && used + gap + w > width) {
        lines.push(line);
        line = [];
        used = 0;
      }
      used += (line.length ? gap : 0) + w;
      line.push(word);
    }
    if (line.length) lines.push(line);
    return lines;
  });
}

async function drawNote(paragraphs: Lines, scale: number): Promise<HTMLCanvasElement> {
  const font = fontAt(scale);
  const [source] = await Promise.all([base(scale), document.fonts.load(font).catch(() => [])]);
  const [canvas, ctx] = canvasAt(scale);
  ctx.drawImage(source, 0, 0);

  ctx.font = font;
  ctx.fillStyle = TEXT.color;
  ctx.textBaseline = 'alphabetic';
  // CSS line boxes: the font's ascent + descent centered in the line height.
  const metrics = ctx.measureText('Hg');
  const ascent = metrics.fontBoundingBoxAscent ?? TEXT.size * scale * 0.8;
  const descent = metrics.fontBoundingBoxDescent ?? TEXT.size * scale * 0.2;
  const lineHeight = TEXT.lineHeight * scale;
  const baseline = (lineHeight - ascent - descent) / 2 + ascent;

  const gap = TEXT.size * TEXT.wordGap * scale;
  let y = TEXT.y * scale;
  for (const lines of paragraphs) {
    for (const line of lines) {
      let x = TEXT.x * scale;
      // Whole-pixel baselines keep horizontal strokes crisp.
      const by = Math.round(y + baseline);
      for (const word of line) {
        ctx.fillText(word, x, by);
        x += ctx.measureText(word).width + gap;
      }
      y += lineHeight;
    }
    y += TEXT.paragraphGap * scale;
  }
  return canvas;
}

/** Scroll speeds, px/s, between which a Note goes from lifted to pressed flat. */
const PRESS_FROM = 40;
const PRESS_FULL = 1600;
/** Shadow strength left at full press. */
const PRESSED = 0.15;
/** Rates, per second: quick to press down, slow to lift back once the scroll settles. */
const PRESS_IN = 9;
const PRESS_OUT = 2.6;

/**
 * Shadow strength for Notes from scroll velocity (`Sprite.lift`): moving presses the
 * paper flat, rest lifts it back to the Figma shadow.
 */
export class NotePress {
  lift = 1;

  /** Returns true while still easing. */
  update(velocity: number, dt: number, reducedMotion: boolean): boolean {
    const target = reducedMotion ? 1 : 1 - (1 - PRESSED) * smoothstep(PRESS_FROM, PRESS_FULL, Math.abs(velocity));
    this.lift = damp(this.lift, target, target < this.lift ? PRESS_IN : PRESS_OUT, dt);
    if (Math.abs(this.lift - target) < 0.002) this.lift = target;
    return this.lift !== 1;
  }
}

/** A Note Asset texture. One string per paragraph; lines wrap like the Figma text box. */
export function noteTexture(key: string, paragraphs: readonly string[]): DrawnTexture {
  let lines: Promise<Lines> | null = null;
  return {
    key,
    px: [WIDTH * 2, HEIGHT * 2],
    shadowed: true,
    draw: (scale) => {
      lines ??= layout(paragraphs);
      return lines.then((l) => drawNote(l, scale));
    },
  };
}


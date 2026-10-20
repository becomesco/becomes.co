interface TextureBase {
  key: string;
  /** Pixel size of the 2x variant. */
  px: readonly [number, number];
}

/** Delivery variants for one piece of media. `src` is 2x, `half` is 1x. */
export interface FileTexture extends TextureBase {
  src: string;
  half: string;
}

/** Rows of clear pixels between the two layers of a `shadowed` texture. */
export const LAYER_GAP = 4;

/**
 * Media drawn at runtime, at any scale of its 1x size (`draw(2)` is `px`). A `shadowed`
 * texture stacks two layers of that size, LAYER_GAP rows apart: the image on top, its
 * shadow below, so the shadow can be scaled by `Sprite.lift` when drawn.
 */
export interface DrawnTexture extends TextureBase {
  draw: (scale: number) => Promise<HTMLCanvasElement>;
  shadowed?: boolean;
}

export type TextureRef = FileTexture | DrawnTexture;

/** Fade lengths per edge as a fraction of the image size: top, right, bottom, left. */
export type EdgeFade = readonly [number, number, number, number];

export const NO_FADE: EdgeFade = [0, 0, 0, 0];

/**
 * One textured Layer on the canvas, in CSS px viewport space. The outer rect is the
 * card; the inner rect is where the image sits. A plain Home Asset has both equal
 * and `card` 0; the Work View card has `card` 1. A morph is a lerp between the two.
 */
export interface Sprite {
  id: string;
  texture: TextureRef | null;
  x: number;
  y: number;
  w: number;
  h: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  radius: number;
  innerRadius: number;
  card: number;
  opacity: number;
  /** Image-only opacity, so a card can show before its image has loaded. */
  image: number;
  fade: EdgeFade;
  /** Vertical bend at the horizontal center, in px (View morph arc). */
  bend: number;
  /** Hover, 0 to 1. Home grows the Asset with this. */
  hover: number;
  /** Cursor across the sprite, -1 to 1 per axis. */
  focusX: number;
  focusY: number;
  /** Strength of a `shadowed` texture's shadow, 0 to 1: lower presses the Asset flat. */
  lift: number;
}

export interface Glow {
  /** Center in CSS px. */
  x: number;
  y: number;
  radius: number;
  color: readonly [number, number, number];
  strength: number;
}

/**
 * A rounded box of browser-layer text that Assets passing behind it are seen through glass at:
 * bent towards the text, diffused, blurred and washed towards the background, so the text
 * stays readable. Full strength inside the box less `inset`, gone `feather` outside it.
 */
export interface GlassBox {
  /** Center and half size, CSS px. */
  x: number;
  y: number;
  hw: number;
  hh: number;
  radius: number;
  feather: number;
  inset: number;
  /** 0 to 1. */
  weight: number;
}

export interface SceneFrame {
  sprites: readonly Sprite[];
  background: readonly [number, number, number];
  glows: readonly Glow[];
  glass: readonly GlassBox[];
}

export function createSprite(id: string, texture: TextureRef | null): Sprite {
  return {
    id,
    texture,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ix: 0,
    iy: 0,
    iw: 0,
    ih: 0,
    radius: 0,
    innerRadius: 0,
    card: 0,
    opacity: 1,
    image: 1,
    fade: NO_FADE,
    bend: 0,
    hover: 0,
    focusX: 0,
    focusY: 0,
    lift: 1,
  };
}

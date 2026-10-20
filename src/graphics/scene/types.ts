/** Delivery variants for one piece of media. `src` is 2x, `half` is 1x. */
export interface TextureRef {
  key: string;
  src: string;
  half: string;
  /** Pixel size of `src`. */
  px: readonly [number, number];
}

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
  /** Vertical bend at the horizontal center, in px (scroll velocity). */
  bend: number;
}

export interface Glow {
  /** Center in CSS px. */
  x: number;
  y: number;
  radius: number;
  color: readonly [number, number, number];
  strength: number;
}

export interface SceneFrame {
  sprites: readonly Sprite[];
  background: readonly [number, number, number];
  glows: readonly Glow[];
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
  };
}

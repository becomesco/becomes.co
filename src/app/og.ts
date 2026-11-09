/** Open Graph video of the landing manifesto, Glass mark turning once at constant speed. */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;
export const OG_FPS = 30;
/** Seconds for one full turn. Start and end match, so the file loops as a still rotation. */
export const OG_TURN = 8;

export const ogCapture =
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('og');

export interface OgBridge {
  ready: boolean;
  period: number;
  seek(time: number): void;
}

declare global {
  interface Window {
    __og?: OgBridge;
  }
}

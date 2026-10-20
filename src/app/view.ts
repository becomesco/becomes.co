import type { FrameTime } from '../core/scheduler';
import type { VirtualScroll } from '../core/scroll';
import type { Pointer } from '../core/pointer';
import type { Viewport } from '../core/viewport';
import type { Engine } from '../graphics/engine';
import type { Glow, Sprite } from '../graphics/scene/types';

export type ViewName = 'home' | 'work' | 'about' | 'contact';

export interface AppContext {
  engine: Engine;
  viewport: Viewport;
  pointer: Pointer;
  navigate: (path: string, intent?: NavigationIntent) => void;
  wake: () => void;
}

/** Extra context for a navigation started by a click on a Home Asset. */
export interface NavigationIntent {
  morph?: { sprite: Sprite; assetId: string; placement: number };
}

export interface DrawList {
  sprites: Sprite[];
  glows: Glow[];
}

export interface View {
  readonly name: ViewName;
  readonly root: HTMLElement;
  readonly scroll: VirtualScroll;
  /** 0 hidden → 1 fully shown. Driven by the app's View transition. */
  presence: number;
  /** Sprite id another system is drawing (a morph); the View skips it. */
  hidden: string | null;
  layout(): void;
  update(frame: FrameTime): boolean;
  draw(out: DrawList): void;
  /** Called after the View is fully hidden. */
  sleep?(): void;
  pointerTarget?(x: number, y: number): boolean;
  tap?(x: number, y: number): void;
}

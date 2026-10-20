export interface PointerState {
  x: number;
  y: number;
  inside: boolean;
  type: string;
  /** Normalized -1..1 from viewport center, for subtle parallax. */
  nx: number;
  ny: number;
}

type TapListener = (x: number, y: number, event: PointerEvent) => void;

const TAP_DISTANCE = 8;
const TAP_TIME = 600;

/**
 * Pointer position and taps. A tap is a press and release with little travel, so
 * a touch drag that scrolls never opens a Work by accident.
 */
export class Pointer {
  readonly state: PointerState = { x: -1, y: -1, inside: false, type: 'mouse', nx: 0, ny: 0 };
  private downX = 0;
  private downY = 0;
  private downT = 0;
  private tracking = false;
  private taps = new Set<TapListener>();

  constructor(
    private surface: HTMLElement,
    private wake: () => void,
  ) {
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', () => (this.tracking = false), { passive: true });
    document.documentElement.addEventListener('pointerleave', () => {
      this.state.inside = false;
      this.wake();
    });
  }

  onTap(fn: TapListener): void {
    this.taps.add(fn);
  }

  private update(event: PointerEvent): void {
    const s = this.state;
    s.x = event.clientX;
    s.y = event.clientY;
    s.type = event.pointerType;
    s.inside = event.pointerType === 'mouse' || event.pointerType === 'pen';
    s.nx = (event.clientX / window.innerWidth) * 2 - 1;
    s.ny = (event.clientY / window.innerHeight) * 2 - 1;
  }

  private onMove = (event: PointerEvent): void => {
    this.update(event);
    if (this.tracking && Math.hypot(event.clientX - this.downX, event.clientY - this.downY) > TAP_DISTANCE) {
      this.tracking = false;
    }
    this.wake();
  };

  private onDown = (event: PointerEvent): void => {
    this.update(event);
    this.tracking = event.button === 0 && event.target instanceof Node && this.surface.contains(event.target);
    this.downX = event.clientX;
    this.downY = event.clientY;
    this.downT = event.timeStamp;
  };

  private onUp = (event: PointerEvent): void => {
    const wasTap =
      this.tracking &&
      event.timeStamp - this.downT < TAP_TIME &&
      Math.hypot(event.clientX - this.downX, event.clientY - this.downY) <= TAP_DISTANCE;
    this.tracking = false;
    if (event.pointerType !== 'mouse') this.state.inside = false;
    if (wasTap) for (const fn of this.taps) fn(event.clientX, event.clientY, event);
    this.wake();
  };
}

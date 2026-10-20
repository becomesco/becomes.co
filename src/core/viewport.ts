export interface ViewportState {
  width: number;
  height: number;
  dpr: number;
  reducedMotion: boolean;
  coarse: boolean;
}

type Listener = (state: ViewportState) => void;

/**
 * Single source for viewport size, DPR, and motion preference. Layout code reads
 * from here instead of touching window sizes in the draw path.
 */
export class Viewport {
  readonly state: ViewportState;
  private listeners = new Set<Listener>();
  private pending = 0;
  private dprQuery: MediaQueryList | null = null;

  constructor() {
    const motion = matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = matchMedia('(pointer: coarse)');
    this.state = { ...this.measure(), reducedMotion: motion.matches, coarse: coarse.matches };

    motion.addEventListener('change', () => {
      this.state.reducedMotion = motion.matches;
      this.emit();
    });
    coarse.addEventListener('change', () => {
      this.state.coarse = coarse.matches;
      this.emit();
    });
    window.addEventListener('resize', this.schedule);
    window.addEventListener('orientationchange', this.schedule);
    this.watchDpr();
  }

  onChange(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private measure() {
    return {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: window.innerHeight,
      dpr: window.devicePixelRatio || 1,
    };
  }

  private watchDpr(): void {
    this.dprQuery?.removeEventListener('change', this.onDpr);
    this.dprQuery = matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    this.dprQuery.addEventListener('change', this.onDpr);
  }

  private onDpr = (): void => {
    this.watchDpr();
    this.schedule();
  };

  private schedule = (): void => {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      const next = this.measure();
      if (next.width === this.state.width && next.height === this.state.height && next.dpr === this.state.dpr) return;
      Object.assign(this.state, next);
      this.emit();
    });
  };

  private emit(): void {
    for (const fn of this.listeners) fn(this.state);
  }
}

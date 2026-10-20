export interface FrameTime {
  /** Seconds since the previous frame, clamped so a backgrounded tab does not jump. */
  dt: number;
  /** Seconds since the scheduler started. */
  elapsed: number;
  /** Raw rAF interval in ms, unclamped. Used by adaptive quality. */
  interval: number;
  now: number;
}

/** Returns true while it still has motion to run (keeps the loop awake). */
export type UpdateFn = (frame: FrameTime) => boolean;
export type RenderFn = (frame: FrameTime) => void;

interface Phase {
  name: string;
  fn: UpdateFn;
}

/**
 * The one rAF loop. Phases run in insertion order (sample input, motion, scene),
 * then render. The loop stops when no phase reports activity; `wake()` restarts it.
 */
export class Scheduler {
  private phases: Phase[] = [];
  private renderers: RenderFn[] = [];
  private rafId = 0;
  private last = 0;
  private start = 0;
  private running = false;
  private forced = 0;

  add(name: string, fn: UpdateFn): void {
    this.phases.push({ name, fn });
  }

  onRender(fn: RenderFn): void {
    this.renderers.push(fn);
  }

  /** Request at least `frames` more frames even if every phase reports idle. */
  wake(frames = 2): void {
    this.forced = Math.max(this.forced, frames);
    if (this.running) return;
    this.running = true;
    this.last = 0;
    this.rafId = requestAnimationFrame(this.tick);
  }

  get awake(): boolean {
    return this.running;
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.running = false;
  }

  private tick = (now: number): void => {
    if (!this.start) this.start = now;
    const interval = this.last ? now - this.last : 1000 / 60;
    const dt = Math.min(interval / 1000, 1 / 20);
    this.last = now;
    const frame: FrameTime = { dt, elapsed: (now - this.start) / 1000, interval, now };

    let active = false;
    for (const phase of this.phases) {
      if (phase.fn(frame)) active = true;
    }
    for (const render of this.renderers) render(frame);

    if (this.forced > 0) this.forced--;
    if (active || this.forced > 0) {
      this.rafId = requestAnimationFrame(this.tick);
    } else {
      this.running = false;
    }
  };
}

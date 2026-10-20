/** Damped spring, integrated with semi-implicit Euler in fixed sub-steps. */
export class Spring {
  value: number;
  target: number;
  velocity = 0;

  constructor(
    value = 0,
    public stiffness = 170,
    public damping = 22,
  ) {
    this.value = value;
    this.target = value;
  }

  set(value: number): void {
    this.value = value;
    this.target = value;
    this.velocity = 0;
  }

  /** Returns true while moving. */
  update(dt: number): boolean {
    const step = 1 / 240;
    let remaining = dt;
    while (remaining > 1e-6) {
      const h = Math.min(step, remaining);
      const force = -this.stiffness * (this.value - this.target) - this.damping * this.velocity;
      this.velocity += force * h;
      this.value += this.velocity * h;
      remaining -= h;
    }
    if (Math.abs(this.value - this.target) < 1e-4 && Math.abs(this.velocity) < 1e-3) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }
}

/** A 0→1 progress driven by elapsed time. */
export class Tween {
  progress = 1;
  private duration = 1;
  private running = false;
  private done: (() => void) | null = null;

  start(duration: number, onDone?: () => void): void {
    this.duration = Math.max(1e-3, duration);
    this.progress = 0;
    this.running = true;
    this.done = onDone ?? null;
  }

  finish(): void {
    if (!this.running) return;
    this.progress = 1;
    this.running = false;
    const done = this.done;
    this.done = null;
    done?.();
  }

  get active(): boolean {
    return this.running;
  }

  update(dt: number): boolean {
    if (!this.running) return false;
    this.progress = Math.min(1, this.progress + dt / this.duration);
    if (this.progress >= 1) this.finish();
    return true;
  }
}

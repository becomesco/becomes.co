import { clamp, damp } from '../utils/math';

/**
 * Virtual scroll position. Input writes `target`; the scheduler eases `current`
 * towards it. Nothing here touches the DOM.
 */
export class VirtualScroll {
  target = 0;
  current = 0;
  max = 0;
  /** Smoothed velocity of `current` in px/s. */
  velocity = 0;
  dragging = false;
  enabled = true;

  private ease = 9;
  private dragEase = 30;

  setMax(max: number): void {
    this.max = Math.max(0, max);
    this.target = clamp(this.target, 0, this.max);
    this.current = clamp(this.current, 0, this.max);
  }

  setEase(ease: number): void {
    this.ease = ease;
  }

  add(delta: number): void {
    if (!this.enabled) return;
    this.target = clamp(this.target + delta, 0, this.max);
  }

  to(value: number, immediate = false): void {
    this.target = clamp(value, 0, this.max);
    if (immediate) {
      this.current = this.target;
      this.velocity = 0;
    }
  }

  /** Returns true while still moving. */
  update(dt: number): boolean {
    const prev = this.current;
    const k = this.dragging ? this.dragEase : this.ease;
    this.current = damp(this.current, this.target, k, dt);
    if (Math.abs(this.target - this.current) < 0.05) this.current = this.target;
    const instant = dt > 0 ? (this.current - prev) / dt : 0;
    this.velocity = damp(this.velocity, instant, 14, dt);
    if (this.current === this.target && Math.abs(this.velocity) < 1) this.velocity = 0;
    return this.current !== this.target || this.velocity !== 0;
  }
}

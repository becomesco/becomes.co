const STANDARD_INTERVALS = [1000 / 240, 1000 / 165, 1000 / 144, 1000 / 120, 1000 / 90, 1000 / 75, 1000 / 60, 1000 / 30];

/**
 * Adaptive render resolution. Watches consecutive frame intervals while the loop
 * runs and steps the canvas DPR down when frames miss the display's refresh, back
 * up after a long stable stretch. Hysteresis and a cooldown prevent flicker.
 */
export class AdaptiveQuality {
  scale = 1;
  private ema = 0;
  private refresh = 1000 / 60;
  private samples: number[] = [];
  private slowFor = 0;
  private fastFor = 0;
  private cooldown = 0;

  constructor(
    private readonly minScale = 0.6,
    private readonly step = 0.85,
  ) {}

  /** Refresh interval estimate in ms (snapped to a standard display rate). */
  get refreshInterval(): number {
    return this.refresh;
  }

  /** Feed the interval of a frame that directly followed another. Returns true if scale changed. */
  sample(interval: number): boolean {
    if (interval <= 0 || interval > 250) return false;
    this.samples.push(interval);
    if (this.samples.length > 90) this.samples.shift();
    if (this.samples.length >= 30) {
      const sorted = [...this.samples].sort((a, b) => a - b);
      const low = sorted[Math.floor(sorted.length * 0.1)];
      this.refresh = STANDARD_INTERVALS.reduce((best, v) => (Math.abs(v - low) < Math.abs(best - low) ? v : best));
    }
    this.ema = this.ema ? this.ema + (interval - this.ema) * 0.08 : interval;
    const seconds = interval / 1000;
    this.cooldown = Math.max(0, this.cooldown - seconds);

    if (this.ema > this.refresh * 1.45) {
      this.slowFor += seconds;
      this.fastFor = 0;
    } else if (this.ema < this.refresh * 1.12) {
      this.fastFor += seconds;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }

    if (this.cooldown > 0) return false;
    if (this.slowFor > 1 && this.scale > this.minScale) {
      this.scale = Math.max(this.minScale, this.scale * this.step);
      return this.changed();
    }
    if (this.fastFor > 6 && this.scale < 1) {
      this.scale = Math.min(1, this.scale / this.step);
      return this.changed();
    }
    return false;
  }

  /** The loop slept; the next interval is not a frame-time signal. */
  reset(): void {
    this.slowFor = 0;
    this.fastFor = 0;
  }

  private changed(): boolean {
    this.slowFor = 0;
    this.fastFor = 0;
    this.cooldown = 3;
    this.ema = this.refresh;
    return true;
  }
}

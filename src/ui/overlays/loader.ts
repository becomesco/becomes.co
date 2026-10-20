import type { FrameTime } from '../../core/scheduler';
import { damp, easeInOutCubic, saturate } from '../../utils/math';

const MIN_DURATION = 1.6;
const HOLD = 0.25;
const OUTRO = 0.7;

/**
 * Intro into Home. A black panel retracts upward as loading completes; the wordmark
 * is white where the panel covers it and black below. Not a View and not a URL.
 */
export class Loader {
  private root: HTMLElement;
  private panel: HTMLElement;
  private light: HTMLElement;
  private stage: HTMLElement;
  private target = 0;
  private shown = 0;
  private start = -1;
  private doneAt = -1;
  private finished = false;
  private onDone: (() => void) | null = null;
  private reduced: boolean;

  constructor(reducedMotion: boolean) {
    this.root = document.querySelector<HTMLElement>('.loader')!;
    this.panel = this.root.querySelector<HTMLElement>('.loader__panel')!;
    this.light = this.root.querySelector<HTMLElement>('.loader__word--light')!;
    this.stage = this.root.querySelector<HTMLElement>('.loader__stage')!;
    this.reduced = reducedMotion;
  }

  get active(): boolean {
    return !this.finished;
  }

  /** Skip the intro (direct entry to a non-Home View). */
  dismiss(): void {
    this.finished = true;
    this.root.remove();
    this.onDone?.();
  }

  setProgress(value: number): void {
    this.target = Math.max(this.target, saturate(value));
  }

  whenDone(fn: () => void): void {
    this.onDone = fn;
  }

  /** Outro progress 0→1 once the panel has cleared, for the landing reveal. */
  outro = 0;

  update(frame: FrameTime): boolean {
    if (this.finished) return false;
    if (this.start < 0) this.start = frame.elapsed;
    const t = frame.elapsed - this.start;
    const cap = this.reduced ? 1 : saturate(t / MIN_DURATION);
    this.shown = damp(this.shown, Math.min(this.target, cap), this.reduced ? 30 : 7, frame.dt);
    if (this.target >= 1 && cap >= 1 && 1 - this.shown < 0.01) this.shown = 1;

    const eased = easeInOutCubic(this.shown);
    const vh = window.innerHeight;
    const covered = (1 - eased) * vh;
    this.panel.style.transform = `translate3d(0, ${(covered - vh).toFixed(2)}px, 0)`;
    this.light.style.clipPath = `inset(0 0 ${(vh - covered).toFixed(2)}px 0)`;

    if (this.shown >= 1) {
      if (this.doneAt < 0) this.doneAt = frame.elapsed;
      const o = saturate((frame.elapsed - this.doneAt - (this.reduced ? 0 : HOLD)) / (this.reduced ? 0.3 : OUTRO));
      this.outro = o;
      const e = easeInOutCubic(o);
      this.stage.style.opacity = (1 - e).toFixed(3);
      this.stage.style.transform = `scale(${(1 + e * 0.06).toFixed(4)})`;
      if (o >= 1) {
        this.finished = true;
        this.root.remove();
        this.onDone?.();
        return false;
      }
    }
    return true;
  }
}

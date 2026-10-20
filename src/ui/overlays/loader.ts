import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import { saturate } from '../../utils/math';

const SEEN_KEY = 'becomes:intro';

const MARK_HOLD = 0.35;
const SHORT_HOLD = 0.2;
const RISE_STAGGER = 0.055;
const PANEL_MIN = 0.9;
const WIPE_HOLD = 0.12;
const REDUCED_FADE = 0.3;
/** Panel and wipe springs aim past the screen edge so they leave decisively instead of creeping out. */
const PAST = 1.04;

/** Wordmark viewBox height in SVG units. */
const WORD_H = 78.6151;

/** sessionStorage throws in some privacy modes. */
function storage<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch {
    return undefined;
  }
}

const settled = (s: Spring): boolean =>
  s.target === 0 && Math.abs(s.value) < 0.01 && Math.abs(s.velocity) < 0.1;

type Phase = 'mark' | 'word' | 'panel' | 'wipe';

/**
 * Intro into Home. The Glass mark sits alone on black, the Wordmark letters rise from behind a
 * baseline cut, a black panel retracts to warm gray as loading completes, then a hard upward wipe
 * erases both and uncovers the landing manifesto. Later loads in the session skip the Wordmark
 * entrance. Not a View and not a URL.
 */
export class Loader {
  /** Screen y of the wipe edge. Home is uncovered below it. */
  edge = Infinity;

  private root: HTMLElement;
  private stage: HTMLElement;
  private panel: HTMLElement;
  private light: HTMLElement;
  /** Per letter, the path in each Wordmark copy. */
  private letters: SVGPathElement[][];
  private rise: Spring[];
  private progress: Spring;
  private wipe = new Spring(0, 140, 24);
  private phase: Phase;
  private target = 0;
  private start = -1;
  private phaseAt = 0;
  private hold: number;
  private finished = false;
  private onDone: (() => void) | null = null;

  constructor(private reduced: boolean) {
    this.root = document.querySelector<HTMLElement>('.loader')!;
    this.stage = this.root.querySelector<HTMLElement>('.loader__stage')!;
    this.panel = this.root.querySelector<HTMLElement>('.loader__panel')!;
    const dark = this.root.querySelector<HTMLElement>('.loader__word--dark')!;
    this.light = dark.cloneNode(true) as HTMLElement;
    this.light.classList.replace('loader__word--dark', 'loader__word--light');
    dark.after(this.light);

    const copies = [dark, this.light].map((word) => Array.from(word.querySelectorAll('path')));
    this.letters = copies[0].map((_, i) => copies.map((paths) => paths[i]));

    const seen = storage(() => sessionStorage.getItem(SEEN_KEY)) != null;
    const skipWord = seen || reduced;
    this.rise = this.letters.map(() => new Spring(skipWord ? 0 : 1, 170, 19));
    this.applyRise();
    this.phase = skipWord ? 'panel' : 'mark';
    this.hold = skipWord ? SHORT_HOLD : MARK_HOLD;
    this.progress = reduced ? new Spring(0, 400, 40) : new Spring(0, 70, 16.5);
    this.root.classList.add('loader--live');
  }

  get active(): boolean {
    return !this.finished;
  }

  /** Skip the intro (direct entry to a non-Home View). */
  dismiss(): void {
    this.finish(false);
  }

  setProgress(value: number): void {
    this.target = Math.max(this.target, saturate(value));
  }

  whenDone(fn: () => void): void {
    this.onDone = fn;
  }

  update(frame: FrameTime): boolean {
    if (this.finished) return false;
    if (this.start < 0) this.start = frame.elapsed;
    const t = frame.elapsed - this.start;
    const dt = frame.dt;
    const vh = window.innerHeight;

    if (this.phase === 'mark' && t >= this.hold) this.enter('word', t);
    if (this.phase !== 'mark') {
      const risen = this.updateRise(this.phase === 'word' ? t - this.phaseAt : Infinity, dt);
      if (this.phase === 'word' && risen) this.enter('panel', t);
    }

    if (this.phase === 'panel' && t >= this.hold) {
      const ramp = this.reduced ? 1 : saturate((t - Math.max(this.phaseAt, this.hold)) / PANEL_MIN);
      const goal = Math.min(this.target, ramp);
      this.progress.target = goal >= 1 ? PAST : goal;
      this.progress.update(dt);
      if (this.progress.value >= 1) {
        this.progress.set(1);
        this.enter('wipe', t);
      }
    }
    const p = saturate(this.progress.value);
    if (this.reduced) {
      this.panel.style.opacity = (1 - p).toFixed(3);
      this.light.style.opacity = (1 - p).toFixed(3);
    } else {
      const covered = (1 - p) * vh;
      this.panel.style.transform = `translate3d(0, ${(covered - vh).toFixed(2)}px, 0)`;
      this.light.style.clipPath = `inset(0 0 ${(vh - covered).toFixed(2)}px 0)`;
    }

    if (this.phase === 'wipe') {
      const since = t - this.phaseAt - WIPE_HOLD;
      if (since >= 0 && this.reduced) {
        this.edge = -Infinity;
        const o = saturate(since / REDUCED_FADE);
        this.stage.style.opacity = (1 - o).toFixed(3);
        if (o >= 1) return this.finish();
      } else if (since >= 0) {
        this.wipe.target = PAST;
        this.wipe.update(dt);
        const w = saturate(this.wipe.value);
        this.edge = (1 - w) * vh;
        this.stage.style.clipPath = `inset(0 0 ${(vh - this.edge).toFixed(2)}px 0)`;
        if (w >= 1) return this.finish();
      }
    }
    return true;
  }

  /** Releases letters left to right; `t` is seconds since the entrance began. True once all have settled. */
  private updateRise(t: number, dt: number): boolean {
    let done = true;
    this.rise.forEach((s, i) => {
      if (t >= i * RISE_STAGGER) s.target = 0;
      s.update(dt);
      if (!settled(s)) done = false;
    });
    this.applyRise();
    return done;
  }

  private applyRise(): void {
    this.rise.forEach((s, i) => {
      const transform = s.value ? `translate(0 ${(s.value * WORD_H).toFixed(2)})` : '';
      for (const path of this.letters[i]) {
        if (transform) path.setAttribute('transform', transform);
        else path.removeAttribute('transform');
      }
    });
  }

  private enter(phase: Phase, t: number): void {
    this.phase = phase;
    this.phaseAt = t;
  }

  private finish(played = true): false {
    if (!this.finished) {
      this.finished = true;
      this.edge = -Infinity;
      this.root.remove();
      if (played) storage(() => sessionStorage.setItem(SEEN_KEY, '1'));
      this.onDone?.();
    }
    return false;
  }
}

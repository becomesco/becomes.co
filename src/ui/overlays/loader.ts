import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import { saturate, smoothstep } from '../../utils/math';

const SEEN_KEY = 'becomes:intro';

const MARK_HOLD = 0.35;
const SHORT_HOLD = 0.2;
const RISE_STAGGER = 0.055;
const PANEL_MIN = 0.9;
/** Panel progress at which the handoff begins, overlapping the panel's exit. */
const HANDOFF_AT = 0.9;
const REDUCED_FADE = 0.3;
/**
 * Springs aim slightly past their goal and are read clamped, so they arrive with a soft
 * ease-out instead of creeping through the last pixels.
 */
const PAST = 1.04;
const CARRY_PAST = 1.02;

/** Wordmark viewBox size, and its baseline (bottom of the b stem), in SVG units. */
const WORD_W = 478.083;
const WORD_H = 78.6151;
const WORD_BASELINE = 77.2901;

/** Where the Wordmark lands: the manifesto's first word, in screen px. */
export interface LandingWord {
  baseline: number;
  /** Baseline to the top of the ink. */
  ascent: number;
  /** Ink centre of each letter. */
  centers: number[];
}

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

type Phase = 'mark' | 'word' | 'panel' | 'handoff';

interface Carry {
  dx: number;
  dy: number;
  scale: number;
  /** Per letter, the extra x travel in SVG units: the Wordmark is tracked tighter than the live text. */
  spread: number[];
}

/**
 * Intro into Home. The Glass mark sits alone on black, the Wordmark letters rise from behind a
 * baseline cut, and a black panel retracts to warm gray as loading completes. Then the Glass mark
 * recedes and the Wordmark glides into the manifesto's first word, handing over to the live text.
 * Later loads in the session skip the Wordmark entrance. Not a View and not a URL.
 */
export class Loader {
  /** Seconds since the handoff into Home began: -Infinity before it, Infinity once the Loader is gone. */
  handoffTime = -Infinity;
  /** Opacity of the manifesto's own first word as the Wordmark settles onto it. */
  landed = 0;

  private root: HTMLElement;
  private stage: HTMLElement;
  private ground: HTMLElement;
  private panel: HTMLElement;
  private mark: HTMLElement;
  private word: SVGSVGElement;
  private light: HTMLElement;
  /** Per letter, the path in each Wordmark copy. */
  private letters: SVGPathElement[][];
  private rise: Spring[];
  private progress: Spring;
  /** Wordmark travel into the manifesto, 0 → 1. */
  private carry = new Spring(0, 45, 13.4);
  /** Glass mark and ground receding, 0 → 1. */
  private recede = new Spring(0, 30, 11);
  /** Wordmark fading out once it sits exactly on the live text, 0 → 1. */
  private swap = new Spring(0, 160, 25);
  private path: Carry | null = null;
  private landing: (() => LandingWord | null) | null = null;
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
    this.ground = this.root.querySelector<HTMLElement>('.loader__ground')!;
    this.panel = this.root.querySelector<HTMLElement>('.loader__panel')!;
    this.mark = this.root.querySelector<HTMLElement>('.loader__mark')!;
    const dark = this.root.querySelector<HTMLElement>('.loader__word--dark')!;
    this.word = dark.querySelector('svg')!;
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

  /** Where the Wordmark should land; read once, when the handoff starts. */
  landOn(fn: () => LandingWord | null): void {
    this.landing = fn;
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
    if (this.phase === 'word' || this.phase === 'panel') {
      const risen = this.updateRise(this.phase === 'word' ? t - this.phaseAt : Infinity, dt);
      if (this.phase === 'word' && risen) this.enter('panel', t);
    }

    if (this.phase === 'panel' && t >= this.hold) {
      const ramp = this.reduced ? 1 : saturate((t - Math.max(this.phaseAt, this.hold)) / PANEL_MIN);
      const goal = Math.min(this.target, ramp);
      this.progress.target = goal >= 1 ? PAST : goal;
      if (goal >= 1 && this.progress.value >= HANDOFF_AT) this.enter('handoff', t);
    }
    if (this.progress.value < 1) this.progress.update(dt);
    const p = saturate(this.progress.value);
    if (this.reduced) {
      this.panel.style.opacity = (1 - p).toFixed(3);
      this.light.style.opacity = (1 - p).toFixed(3);
    } else {
      const covered = (1 - p) * vh;
      this.panel.style.transform = `translate3d(0, ${(covered - vh).toFixed(2)}px, 0)`;
      this.light.style.clipPath = `inset(0 0 ${(vh - covered).toFixed(2)}px 0)`;
    }

    if (this.phase === 'handoff') return this.updateHandoff(t - this.phaseAt, dt);
    return true;
  }

  /** The Glass mark recedes while the Wordmark glides onto the manifesto's first word, then gives way to it. */
  private updateHandoff(since: number, dt: number): boolean {
    if (this.handoffTime === -Infinity) {
      this.path = this.reduced ? null : this.measureCarry();
      this.light.style.display = 'none';
    }
    this.handoffTime = since;

    if (!this.path) {
      const o = saturate(since / REDUCED_FADE);
      this.landed = 1;
      this.stage.style.opacity = (1 - o).toFixed(3);
      return o >= 1 ? this.finish() : true;
    }

    this.recede.target = 1;
    this.carry.target = CARRY_PAST;
    this.recede.update(dt);
    this.carry.update(dt);
    const r = saturate(this.recede.value);
    const c = saturate(this.carry.value);

    this.ground.style.opacity = (1 - smoothstep(0, 0.6, r)).toFixed(3);
    this.mark.style.opacity = (1 - r).toFixed(3);
    this.mark.style.transform = `translate(-50%, -50%) scale(${(1 - 0.08 * r).toFixed(4)})`;

    const { dx, dy, scale, spread } = this.path;
    this.word.style.transform =
      `translate(${(dx * c).toFixed(2)}px, ${(dy * c).toFixed(2)}px) scale(${(1 + (scale - 1) * c).toFixed(4)})`;
    this.letters.forEach(([path], i) => path.setAttribute('transform', `translate(${(spread[i] * c).toFixed(3)} 0)`));

    // Same letterforms, now in the same place: show the live word underneath and let the Wordmark go.
    if (c >= 1) {
      this.landed = 1;
      this.swap.target = PAST;
      this.swap.update(dt);
    }
    const s = saturate(this.swap.value);
    this.word.style.opacity = (1 - s).toFixed(3);

    return s >= 1 && r >= 0.97 ? this.finish() : true;
  }

  /**
   * Scale that matches the landing word's glyph height, translation onto its baseline, and per-letter
   * travel onto its letter centres.
   */
  private measureCarry(): Carry | null {
    const to = this.landing?.();
    if (!to || to.centers.length !== this.letters.length) return null;
    const rect = this.word.getBoundingClientRect();
    const unit = rect.width / WORD_W;
    const baseline = WORD_BASELINE * unit;
    const scale = to.ascent / baseline;
    this.word.style.transformOrigin = `0 ${baseline.toFixed(2)}px`;

    const k = unit * scale;
    const centers = this.letters.map(([path]) => {
      const box = path.getBBox();
      return box.x + box.width / 2;
    });
    const gaps = centers.map((cx, i) => to.centers[i] - rect.left - cx * k);
    const dx = gaps.reduce((sum, g) => sum + g, 0) / gaps.length;
    return {
      dx,
      dy: to.baseline - (rect.top + baseline),
      scale,
      spread: gaps.map((g) => (g - dx) / k),
    };
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
      this.handoffTime = Infinity;
      this.landed = 1;
      this.root.remove();
      if (played) storage(() => sessionStorage.setItem(SEEN_KEY, '1'));
      this.onDone?.();
    }
    return false;
  }
}

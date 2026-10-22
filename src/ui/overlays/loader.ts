import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import type { Engine } from '../../graphics/engine';
import { MARK_CENTRE, type GlassMark, type MarkColors, type MarkPose } from '../../graphics/layers/glass-mark';
import { easeInOutCubic, easeOutCubic, lerp, saturate, smoothstep } from '../../utils/math';

const SEEN_KEY = 'becomes:intro';

const MESH_URL = '/media/brand/glass-mark.mesh';
const POSTER_SRCSET = '/media/brand/glass-mark-model.half.webp 1x, /media/brand/glass-mark-model.webp 2x';
/** Longest the intro waits on black for the live Glass mark before showing its still. */
const MARK_WAIT = 1.4;
/** Seconds for the Glass mark to turn face-on; later loads in the session use the short one. */
const APPEAR = 1.7;
const APPEAR_SHORT = 1.0;
/** Radians the Glass mark starts turned by, so its reflections slide as it settles. */
const TURN_YAW = -0.3;
const TURN_PITCH = 0.1;
/**
 * Speed of the light inside the Glass mark, as a multiple of real time: it arrives moving and
 * springs down to a slow drift that never stops while the mark is on screen.
 */
const FLOW_APPEAR = 0.6;
const FLOW_REST = 0.07;
/** Glint travel through reflection space, from below-left of the mark to beyond its top right. */
const GLINT_FROM = -1.3;
const GLINT_TO = 1.3;

const MARK_HOLD = 0.35;
const SHORT_HOLD = 0.2;
const RISE_STAGGER = 0.055;
/** Seconds the panel holds on black once the Wordmark is up, before it starts to retract. */
const PANEL_WAIT = 1.2;
const PANEL_MIN = 0.9;
/** Panel progress at which the handoff begins, overlapping the panel's exit. */
const HANDOFF_AT = 0.9;
const REDUCED_FADE = 0.3;
/**
 * Home scroll, in viewport heights, over which the Glass mark turns and flies out past the viewer,
 * and over which it flies back into place before the end of Home.
 */
const AWAY = 0.4;
/**
 * The mark follows the scroll on a soft spring of its own, so it glides on after the page stops
 * and settles without snapping to each wheel step.
 */
const AWAY_STIFFNESS = 16;
const AWAY_DAMPING = 7.4;
/** Turns the Glass mark makes on its way out, evenly over the scroll, so it spins as fast as the page moves. */
const TURNS = 1.5;
/** Where its flight ends: a little past the camera, as a share of the way there. */
const FLY = 1.1;
/** Share of the flight by which its optical centre has reached the screen's centre. */
const AIM_BY = 0.35;
/** Share of the flight over which it fades: it is gone just before it reaches the viewer. */
const FADE_FROM = 0.45;
const FADE_TO = 0.92;
/** Share of the still's frame the mark fills, which sets its size at rest. */
const MARK_FILL = 0.7;
/** Most device px the viewport-sized mark canvas renders, which bounds its multisampled targets. */
const MARK_PIXELS = 3.5e6;
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
/** How far a letter waits below its place, in SVG units: clear of the baseline cut, so no anti-aliased edge shows. */
const RISE_DROP = WORD_H + 6;

/** Where the Wordmark lands: the manifesto's first word, in screen px. */
export interface LandingWord {
  baseline: number;
  /** Baseline to the top of the ink. */
  ascent: number;
  /** Ink centre of each letter. */
  centers: number[];
}

/** Home, as the Glass mark sees it once the Wordmark has handed over. */
export interface MarkHost {
  readonly scroll: { readonly current: number; readonly max: number };
  readonly presence: number;
  /** Changes whenever `drawUnderlay` would draw something different. */
  underlayKey(): string;
  /** Draws the text under the Glass mark as white coverage, in screen px. */
  drawUnderlay(ctx: OffscreenCanvasRenderingContext2D): void;
}

/** About, where the Glass mark stands still at a spot of its own, over the photos and under the copy. */
export interface MarkSpot {
  /** Set by the Loader: true while the live Glass mark stands in for the View's still of it. */
  markLive: boolean;
  /** The still's frame in screen px (centre and height, the mark filling it as it fills the Loader's) and its opacity. */
  readonly markFrame: { x: number; y: number; height: number; opacity: number };
}

/** A computed colour as sRGB 0..1, normalised through a 2D context. */
function cssColor(ctx: OffscreenCanvasRenderingContext2D, value: string): [number, number, number] {
  ctx.fillStyle = '#000';
  ctx.fillStyle = value;
  const hex = String(ctx.fillStyle);
  if (!hex.startsWith('#')) return [0, 0, 0];
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
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
 * Intro into Home. The Glass mark turns face-on alone on black, a glint crossing its rim, the
 * Wordmark letters rise from behind a baseline cut, and a black panel retracts to warm gray as
 * loading completes. Then the Wordmark glides into the manifesto's first word, handing over to the
 * live text, and the Glass mark stays over Home until the scroll turns it away, returning at the end
 * of Home. Later loads in the session shorten the Glass mark's entrance. Not a View and not a URL.
 */
export class Loader {
  /** Seconds since the handoff into Home began: -Infinity before it, Infinity once the Loader is gone. */
  handoffTime = -Infinity;
  /** Opacity of the manifesto's own first word as the Wordmark settles onto it. */
  landed = 0;

  private root: HTMLElement;
  private ground: HTMLElement;
  private panel: HTMLElement;
  private mark: HTMLElement;
  private canvas: HTMLCanvasElement;
  private frame: HTMLElement;
  private poster: HTMLImageElement;
  private mesh: Promise<ArrayBuffer | null>;
  private glass: GlassMark | null = null;
  private sizer: ResizeObserver | null = null;
  /** Which Glass mark is showing: the live mesh, or the still when WebGPU is missing or slow. */
  private markSource: 'pending' | 'glass' | 'poster' = 'pending';
  private markReady = false;
  /** Loader seconds at which the Glass mark began to appear; Infinity until it can. */
  private markAt = Infinity;
  private appear: number;
  private pose: MarkPose = {
    yaw: TURN_YAW,
    pitch: TURN_PITCH,
    scale: 0.95,
    opacity: 0,
    glint: GLINT_FROM,
    ground: 0,
    edge: 2,
    panel: 1,
    light: 1,
    word: 1,
    aim: 0,
    approach: 0,
    flow: 0,
    x: 0,
    y: 0,
    scene: 0,
  };
  /** The pose About stands the mark in. */
  private standing: MarkPose = { ...this.pose };
  /** Opacity of the pose last drawn, Home's or About's. */
  private shown = 0;
  /** Low and well damped, so the inner light glides between speeds. */
  private flowSpeed = new Spring(FLOW_APPEAR, 2.5, 3.4);
  /** The pose as drawn: `pose` with Home's scroll applied. */
  private drawn: MarkPose = { ...this.pose };
  /** The Wordmark rasterised for the Glass mark to refract, in its canvas's device px. */
  private wordMask: OffscreenCanvasRenderingContext2D | null = null;
  private glyphs: Path2D[] = [];
  /** Untransformed layout in CSS px, read on resize: the viewport-sized mark canvas, the still's frame, and the Wordmark box. */
  private markBox = { width: 0, height: 0 };
  private frameHeight = 0;
  private wordBox = { left: 0, top: 0, width: 0 };
  private wordKey = '';
  /** How far along its way out the Glass mark is, 0 → 1, following Home's scroll. */
  private away = new Spring(0, AWAY_STIFFNESS, AWAY_DAMPING);
  /** Radians the Glass mark has turned as Home scrolls. */
  private spin = 0;
  /** The last frame drew nothing, so the canvas is already clear. */
  private blank = false;
  private word: SVGSVGElement;
  /** Opacity of the Wordmark in the browser layer. */
  private wordAlpha = 1;
  private light: HTMLElement;
  /** Per letter, the path in each Wordmark copy. */
  private letters: SVGPathElement[][];
  private rise: Spring[];
  private progress: Spring;
  /** Wordmark travel into the manifesto, 0 → 1. */
  private carry = new Spring(0, 45, 13.4);
  /** Ground fading off Home, 0 → 1. */
  private recede = new Spring(0, 30, 11);
  /** Wordmark fading out once it sits exactly on the live text, 0 → 1. */
  private swap = new Spring(0, 160, 25);
  private path: Carry | null = null;
  private landing: (() => LandingWord | null) | null = null;
  private host: MarkHost | null = null;
  private spot: MarkSpot | null = null;
  /** About holds the mark this frame: it drops under the browser layer and refracts no text. */
  private standingOn = false;
  /** The intro is over but the Glass mark stays, for About and, once the intro has played, Home. */
  private resting = false;
  private onHome = false;
  private phase: Phase;
  private target = 0;
  private start = -1;
  private phaseAt = 0;
  private hold: number;
  private finished = false;
  private onDone: (() => void) | null = null;

  constructor(private reduced: boolean) {
    this.root = document.querySelector<HTMLElement>('.loader')!;
    this.ground = this.root.querySelector<HTMLElement>('.loader__ground')!;
    this.panel = this.root.querySelector<HTMLElement>('.loader__panel')!;
    this.mark = document.querySelector<HTMLElement>('.loader__mark')!;
    this.canvas = this.mark.querySelector('canvas')!;
    this.frame = this.mark.querySelector<HTMLElement>('.loader__mark-box')!;
    this.poster = this.mark.querySelector('img')!;
    this.mesh = fetch(MESH_URL)
      .then((response) => (response.ok ? response.arrayBuffer() : null))
      .catch(() => null);
    const dark = this.root.querySelector<HTMLElement>('.loader__word--dark')!;
    this.word = dark.querySelector('svg')!;
    this.light = dark.cloneNode(true) as HTMLElement;
    this.light.classList.replace('loader__word--dark', 'loader__word--light');
    this.light.querySelector('clipPath')!.id = 'loader-cut-light';
    this.light.querySelector('g')!.setAttribute('clip-path', 'url(#loader-cut-light)');
    dark.after(this.light);

    const copies = [dark, this.light].map((word) => Array.from(word.querySelectorAll('path')));
    this.letters = copies[0].map((_, i) => copies.map((paths) => paths[i]));

    const short = reduced || storage(() => sessionStorage.getItem(SEEN_KEY)) != null;
    this.rise = this.letters.map(() => new Spring(reduced ? 0 : 1, 170, 19));
    this.applyRise();
    this.phase = reduced ? 'panel' : 'mark';
    this.hold = short ? SHORT_HOLD : MARK_HOLD;
    this.appear = short ? APPEAR_SHORT : APPEAR;
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

  /** What the Glass mark sits over once the Wordmark hands over, and the scroll that takes it away. */
  restOn(host: MarkHost): void {
    this.host = host;
  }

  /**
   * How far the Glass mark over Home is along its way out, 0 at rest (its turns unwound) to 1 gone.
   * With no mark over Home, where it would be for the scroll.
   */
  get markAway(): number {
    if (this.resting && this.onHome && this.handoffTime !== -Infinity) return saturate(this.away.value);
    return this.awayGoal();
  }

  /** Where the Glass mark stands still once the Loader is gone, whether or not the intro played. */
  standOn(spot: MarkSpot): void {
    this.spot = spot;
  }

  whenDone(fn: () => void): void {
    this.onDone = fn;
  }

  /** Draws the Glass mark live once the Engine is up; without WebGPU it shows the still. */
  async attach(engine: Engine): Promise<void> {
    const mesh = await this.mesh;
    let glass: GlassMark | null = null;
    if (mesh && this.markSource === 'pending' && (!this.finished || this.resting)) {
      glass = await engine.glassMark(this.canvas, mesh).catch((error: unknown) => {
        console.warn('[loader] live Glass mark unavailable', error);
        return null;
      });
    }
    if (!glass) return this.showPoster();
    if (this.markSource !== 'pending' || (this.finished && !this.resting)) return glass.destroy();

    this.markSource = 'glass';
    this.glass = glass;
    if (this.spot) this.spot.markLive = true;
    const mask = new OffscreenCanvas(1, 1).getContext('2d');
    if (mask) {
      this.wordMask = mask;
      this.glyphs = this.letters.map(([path]) => new Path2D(path.getAttribute('d') ?? ''));
      // The panel shares the dark Wordmark's ink.
      const colors: MarkColors = {
        ink: cssColor(mask, getComputedStyle(this.panel).backgroundColor),
        ground: cssColor(mask, getComputedStyle(this.ground).backgroundColor),
        lightWord: cssColor(mask, getComputedStyle(this.light).color),
      };
      glass.setColors(colors);
    }
    this.measure();
    this.sizer = new ResizeObserver(() => this.measure());
    this.sizer.observe(this.canvas);
    this.sizer.observe(this.frame);
    this.sizer.observe(this.word);
    this.markReady = true;
  }

  /** Render phase, after the stage: `scene` is the stage canvas's texture for this frame, when it has one. */
  draw(scene: GPUTexture | null = null): void {
    if (this.finished && !this.resting) return;
    if (this.resting && this.glass?.lost) {
      this.dropGlass();
      this.markSource = 'pending';
      this.showPoster();
    }
    const home = this.leave();
    if (this.markSource === 'poster') this.placePoster(home);
    if (!this.glass) return;
    const pose = this.stand(home);
    this.shown = pose.opacity;
    const blank = pose.opacity <= 0.002;
    if (blank && this.blank) return;
    this.blank = blank;
    if (!blank) this.drawWord(this.glass);
    this.glass.render(pose, scene);
  }

  /**
   * About takes the mark from Home while it shows more of it, and stands it face-on and still in
   * its own spot, refracting the stage under the copy. Across a View change the two cross through
   * zero opacity, so the mark never jumps between spots or layers while visible.
   */
  private stand(home: MarkPose): MarkPose {
    const spot = this.spot;
    const frame = spot?.markFrame;
    const homeOpacity = this.onHome ? home.opacity : 0;
    const standing = this.finished && !!frame && frame.opacity > homeOpacity;
    if (standing !== this.standingOn) {
      this.standingOn = standing;
      this.mark.classList.toggle('loader__mark--under', standing);
    }
    if (!this.finished || !frame) return home;
    if (!standing) {
      home.opacity = homeOpacity - frame.opacity;
      return home;
    }
    const { width, height } = this.markBox;
    return Object.assign(this.standing, {
      yaw: 0,
      pitch: 0,
      scale: this.frameHeight ? frame.height / this.frameHeight : 1,
      opacity: frame.opacity - homeOpacity,
      glint: GLINT_TO,
      ground: 1,
      edge: 2,
      panel: 0,
      light: 0,
      word: 0,
      aim: 0,
      approach: 0,
      flow: this.pose.flow,
      x: width ? frame.x / width - 0.5 : 0,
      y: height ? frame.y / height - 0.5 : 0,
      scene: 1,
    } satisfies MarkPose);
  }

  /**
   * Once the Wordmark has handed over, Home's scroll takes the Glass mark away: it turns about its
   * vertical axis as fast as the page moves while its optical centre settles on the screen's centre
   * and it flies straight at the viewer. Nearing the end of Home the same flight runs backwards: it
   * comes from behind the viewer, unwinding its turns, and settles where it rested at the top.
   */
  private leave(): MarkPose {
    const pose = Object.assign(this.drawn, this.pose);
    const host = this.host;
    if (!host || this.handoffTime === -Infinity) return pose;
    const p = saturate(this.away.value);
    pose.opacity *= (1 - smoothstep(FADE_FROM, FADE_TO, p)) * saturate(host.presence);
    this.spin = this.reduced ? 0 : TURNS * 2 * Math.PI * p;
    pose.yaw += this.spin;
    if (!this.reduced) {
      pose.approach = FLY * p;
      pose.aim = smoothstep(0, AIM_BY, p);
    }
    return pose;
  }

  /** Eases the way out towards Home's scroll, and back in towards its end. True while it is still moving. */
  private follow(dt: number): boolean {
    if (!this.host || this.handoffTime === -Infinity) return false;
    const goal = this.awayGoal();
    if (this.reduced) {
      this.away.set(goal);
      return false;
    }
    this.away.target = goal;
    return this.away.update(dt);
  }

  /** The way out Home's scroll asks for: out over its first stretch, back in over its last. */
  private awayGoal(): number {
    if (!this.host) return 0;
    const { current, max } = this.host.scroll;
    const span = window.innerHeight * AWAY;
    return Math.min(saturate(current / span), saturate((max - current) / span));
  }

  /** The still follows the live mark's flight with a CSS perspective of its own. */
  private placePoster(pose: MarkPose): void {
    const closer = pose.approach < 0.97 ? 1 / (1 - pose.approach) : 0;
    this.poster.style.opacity = (closer ? pose.opacity : 0).toFixed(3);
    if (!closer) return;
    // The optical centre, in px from the frame's centre: the mark fills MARK_FILL of the frame at rest.
    const half = (MARK_FILL * this.frameHeight) / 2;
    const dx = MARK_CENTRE[0] * half;
    const dy = -MARK_CENTRE[1] * half;
    this.frame.style.transformOrigin = `calc(50% + ${dx.toFixed(2)}px) calc(50% + ${dy.toFixed(2)}px)`;
    this.frame.style.transform =
      `translate(-50%, -50%) translate(${(-dx * pose.aim).toFixed(2)}px, ${(-dy * pose.aim).toFixed(2)}px) ` +
      `scale(${closer.toFixed(4)}) perspective(2400px) rotateY(${this.spin.toFixed(4)}rad)`;
  }

  /** Resize callback: the layout the Glass mark redraws behind itself. */
  private measure(): void {
    this.frameHeight = this.frame.clientHeight;
    if (!this.glass) return;
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.markBox = { width, height };
    const budget = Math.sqrt(MARK_PIXELS / Math.max(1, width * height));
    const ratio = Math.min(window.devicePixelRatio || 1, 2, budget);
    this.glass.resize(width, height, ratio, height ? (MARK_FILL * this.frameHeight) / height : MARK_FILL);
    // The Wordmark carries a transform during the handoff; its resting box is kept from before.
    if (this.handoffTime === -Infinity) {
      const rect = this.word.getBoundingClientRect();
      this.wordBox = { left: rect.left, top: rect.top, width: rect.width };
    }
    this.wordKey = '';
  }

  /**
   * Rasterises the Wordmark into the mask the Glass mark refracts, with the same letter rise,
   * baseline cut, handoff travel and fade as the browser layer, and Home's text beside it. Only
   * when any of them has changed.
   */
  private drawWord(glass: GlassMark): void {
    const ctx = this.wordMask;
    if (!ctx || !glass.width) return;
    const c = this.path ? saturate(this.carry.value) : 0;
    const word = this.wordAlpha > 0.001 ? `${c} ${this.wordAlpha} ${this.rise.map((s) => s.value).join(' ')}` : '';
    const under = this.standingOn ? null : this.host;
    const key = `${glass.width}x${glass.height} ${word} | ${under?.underlayKey() ?? ''}`;
    if (key === this.wordKey) return;
    this.wordKey = key;

    const canvas = ctx.canvas;
    if (canvas.width !== glass.width || canvas.height !== glass.height) {
      canvas.width = glass.width;
      canvas.height = glass.height;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Screen px into canvas px; the canvas covers the viewport.
    const k = glass.width / this.markBox.width;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = '#fff';

    if (word) {
      ctx.save();
      ctx.globalAlpha = this.wordAlpha;
      const box = this.wordBox;
      const unit = box.width / WORD_W;
      if (this.path && c > 0) {
        const { dx, dy, scale } = this.path;
        const ox = box.left;
        const oy = box.top + WORD_BASELINE * unit;
        ctx.translate(ox + dx * c, oy + dy * c);
        ctx.scale(1 + (scale - 1) * c, 1 + (scale - 1) * c);
        ctx.translate(-ox, -oy);
      }
      ctx.translate(box.left, box.top);
      ctx.scale(unit, unit);
      ctx.beginPath();
      ctx.rect(-0.1 * WORD_W, -0.6 * WORD_H, 1.2 * WORD_W, 1.6 * WORD_H);
      ctx.clip();
      this.glyphs.forEach((glyph, i) => {
        const spread = this.path ? this.path.spread[i] * c : 0;
        ctx.save();
        ctx.translate(spread, this.rise[i].value * RISE_DROP);
        ctx.fill(glyph);
        ctx.restore();
      });
      ctx.restore();
    }
    if (under) {
      ctx.save();
      under.drawUnderlay(ctx);
      ctx.restore();
    }
    glass.uploadWord(canvas);
  }

  update(frame: FrameTime): boolean {
    if (this.finished) return this.resting && this.drift(frame);
    if (this.start < 0) this.start = frame.elapsed;
    const t = frame.elapsed - this.start;
    const dt = frame.dt;
    this.follow(dt);
    this.updateFlow(t - this.markAt, dt);
    const vh = window.innerHeight;

    if (this.glass?.lost) {
      this.dropGlass();
      this.markSource = 'pending';
      this.showPoster();
    }
    if (this.markAt === Infinity) {
      if (this.markReady) this.markAt = t;
      else if (t >= MARK_WAIT) this.showPoster();
    }
    const shown = this.markAt + this.hold;

    if (this.phase === 'mark' && t >= shown) this.enter('word', t);
    if (this.phase === 'word' || this.phase === 'panel') {
      const risen = this.updateRise(this.phase === 'word' ? t - this.phaseAt : Infinity, dt);
      if (this.phase === 'word' && risen) this.enter('panel', t);
    }

    const retract = Math.max(this.phaseAt, shown) + PANEL_WAIT;
    if (this.phase === 'panel' && t >= retract) {
      const ramp = this.reduced ? 1 : saturate((t - retract) / PANEL_MIN);
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
    // The panel clears the screen's middle, where the mark sits, around halfway.
    this.updateMark(t - this.markAt, this.reduced ? p : smoothstep(0.3, 0.7, p));

    const alive = this.phase === 'handoff' ? this.updateHandoff(t - this.phaseAt, dt) : true;
    if (alive) this.updateBackdrop(p);
    return alive;
  }

  /** What the Glass mark redraws behind itself: the panel edge, and how much of each layer shows. */
  private updateBackdrop(p: number): void {
    const pose = this.pose;
    const handoff = this.handoffTime !== -Infinity;
    if (this.reduced) {
      pose.edge = 2;
      pose.panel = 1 - p;
      pose.light = handoff ? 0 : 1 - p;
      return;
    }
    // The canvas covers the viewport, so the panel's covered share of it is the edge.
    pose.edge = 1 - p;
    pose.panel = 1;
    pose.light = handoff ? 0 : 1;
  }

  /** The ground lifts off Home while the Wordmark glides onto the manifesto's first word, then gives way to it. */
  private updateHandoff(since: number, dt: number): boolean {
    if (this.handoffTime === -Infinity) {
      this.path = this.reduced ? null : this.measureCarry();
      this.light.style.display = 'none';
    }
    this.handoffTime = since;

    if (!this.path) {
      const o = saturate(since / REDUCED_FADE);
      this.landed = 1;
      this.wordAlpha = 1 - o;
      this.ground.style.opacity = this.word.style.opacity = (1 - o).toFixed(3);
      return o >= 1 ? this.finish() : true;
    }

    this.recede.target = 1;
    this.carry.target = CARRY_PAST;
    this.recede.update(dt);
    this.carry.update(dt);
    const r = saturate(this.recede.value);
    const c = saturate(this.carry.value);

    this.ground.style.opacity = (1 - smoothstep(0, 0.6, r)).toFixed(3);

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
    this.wordAlpha = 1 - s;
    this.word.style.opacity = this.wordAlpha.toFixed(3);

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
      const transform = s.value ? `translate(0 ${(s.value * RISE_DROP).toFixed(2)})` : '';
      for (const path of this.letters[i]) {
        if (transform) path.setAttribute('transform', transform);
        else path.removeAttribute('transform');
      }
    });
  }

  /**
   * The Glass mark fades in turned slightly away and eases face-on while a glint crosses its rim,
   * then sways just enough to keep its reflections alive. `since` is seconds since it appeared.
   */
  private updateMark(since: number, ground: number): void {
    const pose = this.pose;
    pose.ground = ground;
    if (!(since >= 0)) return;
    if (this.reduced) {
      pose.opacity = saturate(since / REDUCED_FADE);
      pose.yaw = 0;
      pose.pitch = 0;
      pose.scale = 1;
      pose.glint = 0.35;
    } else {
      const e = easeOutCubic(saturate(since / this.appear));
      pose.opacity = easeOutCubic(saturate(since / 0.6));
      pose.yaw = TURN_YAW * (1 - e) + 0.022 * Math.sin(since * 0.9) * e;
      pose.pitch = TURN_PITCH * (1 - e) + 0.012 * Math.sin(since * 0.7) * e;
      pose.scale = 0.95 + 0.05 * e;
      pose.glint = lerp(GLINT_FROM, GLINT_TO, easeInOutCubic(saturate((since - 0.1) / (this.appear * 0.9))));
    }
  }

  /** Advances the inner light's own clock, so its speed can ease and a woken loop never jumps it. */
  private updateFlow(since: number, dt: number): void {
    if (this.reduced || !(since >= 0)) return;
    this.flowSpeed.target = FLOW_REST;
    this.flowSpeed.update(dt);
    this.pose.flow += this.flowSpeed.value * dt;
  }

  /** Resting: eases Home's way out, and keeps the sway and the inner light going while the live mark is on screen. */
  private drift(frame: FrameTime): boolean {
    const moving = this.follow(frame.dt);
    if (this.reduced || this.markSource !== 'glass') return moving;
    if (this.onHome) {
      const since = frame.elapsed - this.start - this.markAt;
      this.updateFlow(since, frame.dt);
      this.updateMark(since, this.pose.ground);
    } else {
      this.pose.flow += FLOW_REST * frame.dt;
    }
    return moving || this.shown > 0.002;
  }

  private showPoster(): void {
    if (this.markSource !== 'pending' || (this.finished && !this.resting)) return;
    // Without the intro the mark only stands on About, which shows its own still instead.
    if (this.finished && !this.onHome) return this.retire();
    this.markSource = 'poster';
    this.canvas.hidden = true;
    this.mark.classList.add('loader__mark--poster');
    this.sizer = new ResizeObserver(() => this.measure());
    this.sizer.observe(this.frame);
    this.poster.srcset = POSTER_SRCSET;
    this.poster
      .decode()
      .catch(() => undefined)
      .then(() => {
        this.markReady = true;
      });
  }

  private dropGlass(): void {
    this.sizer?.disconnect();
    this.sizer = null;
    this.glass?.destroy();
    this.glass = null;
    if (this.spot) this.spot.markLive = false;
  }

  private retire(): void {
    this.resting = false;
    this.dropGlass();
    this.mark.remove();
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
      if (played && this.host && this.markSource !== 'pending') {
        this.rest(true);
      } else if (this.spot && this.markSource !== 'poster') {
        this.rest(false);
      } else {
        this.retire();
      }
      this.root.remove();
      if (played) storage(() => sessionStorage.setItem(SEEN_KEY, '1'));
      this.onDone?.();
    }
    return false;
  }

  /** The Glass mark outlives the Loader, holding still over Home until the scroll takes it, and standing on About. */
  private rest(onHome: boolean): void {
    this.resting = true;
    this.onHome = onHome;
    this.wordAlpha = 0;
    this.pose.panel = 0;
    this.pose.light = 0;
    this.mark.classList.add('loader__mark--rest');
  }
}

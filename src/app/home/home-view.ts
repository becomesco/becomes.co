import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { createSprite, NO_FADE, type EdgeFade, type Sprite } from '../../graphics/scene/types';
import type { LandingWord } from '../../ui/overlays/loader';
import { clamp, damp, easeInOutCubic, lerp, saturate, smoothstep } from '../../utils/math';
import { assetsOf, works, type Asset, type Work } from '../data/works';
import { NotePress } from '../note';
import type { AppContext, DrawList, View } from '../view';
import { computeLayout, type HomeLayout, type Placement, type SectionInput } from './layout';

const COPIES = 4;
const CUT_FADE = 0.2;
/** Hover spring: just under critical damping, so it glides in over ~0.6 s and settles without a bounce. */
const HOVER_STIFFNESS = 70;
const HOVER_DAMPING = 16;
/** Rate the hover vignette follows the cursor at, per second. Low enough to trail it a little. */
const FOCUS_RATE = 7;
/** How much smaller Assets get at full scroll speed (Notes excepted). */
const SCROLL_SHRINK = 0.025;
/** Scroll speeds, px/s, between which Assets go from rest to fully shrunk. */
const SHRINK_FROM = 60;
const SHRINK_FULL = 2400;
/**
 * Rates, per second, the shrink follows scroll speed at: Assets the content is moving
 * towards react first, the far side last, so the shrink and its release ripple across.
 */
const SHRINK_RATE_LEAD = 9;
const SHRINK_RATE_LAG = 3.5;
/** How far each manifesto line sits below rest before the intro brings it in, px. */
const RISE = 28;
/**
 * Seconds into the Loader handoff when the first manifesto line starts to rise, then per line.
 * Late enough that the Wordmark has mostly arrived and doesn't crowd its neighbours.
 */
const LINE_START = 0.45;
const LINE_STAGGER = 0.12;
/** Seconds for one title to morph into the next once the scroll crosses a threshold. */
const MORPH_TIME = 0.9;
/** Blur of each title halfway through a morph, as a share of its font size. */
const MORPH_BLUR = 0.07;
/** Extra scroll the manifesto stays for before the first Work's title, as a share of viewport height. */
const MANIFESTO_HOLD = 0.3;
/** Dead band either side of a threshold, as a share of viewport height, so resting on it can't flicker. */
const THRESHOLD_BAND = 0.03;
/** Longest blur a fading title reaches, as a multiple of its halfway blur. */
const MORPH_BLUR_MAX = 6;
/** Alpha the gooey filter snaps to solid at full strength, and how steep that edge is. */
const GOO_CUT = 0.35;
const GOO_SLOPE = 30;
const GOO_ID = 'home-title-morph';

interface Title {
  el: HTMLElement;
  work: Work | null;
  /** Halfway blur for this title's morph, px. */
  blur: number;
  /** Headline center below the title's top edge, px. Every title pins this point to the viewport center. */
  anchor: number;
  alpha: number;
  transform: string;
  opacity: string;
  filter: string;
}

interface Line {
  words: HTMLElement[];
  spring: Spring;
  style: string;
}

/** Wraps each word so manifesto lines can move on their own. */
function splitWords(el: HTMLElement): HTMLElement[] {
  const words: HTMLElement[] = [];
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType !== Node.TEXT_NODE) continue;
    const parts = (node.textContent ?? '').split(/(\s+)/);
    const fragment = document.createDocumentFragment();
    for (const part of parts) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        fragment.append(part);
        continue;
      }
      const word = document.createElement('span');
      word.className = 'home-title__word';
      word.textContent = part;
      fragment.append(word);
      words.push(word);
    }
    node.replaceWith(fragment);
  }
  return words;
}

/**
 * Alpha threshold over the stacked titles. While two titles blur through each other it
 * welds their soft edges into one shape, which is what reads as a morph rather than a fade.
 */
function gooFilter(): SVGFEColorMatrixElement {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  const filter = document.createElementNS(ns, 'filter');
  filter.id = GOO_ID;
  filter.setAttribute('color-interpolation-filters', 'sRGB');
  const matrix = document.createElementNS(ns, 'feColorMatrix');
  matrix.setAttribute('type', 'matrix');
  filter.append(matrix);
  svg.append(filter);
  document.body.append(svg);
  return matrix;
}

/**
 * Halfway between where a section's last Asset passes the center and where the next section begins.
 * The manifesto holds on later, up to the first section's start.
 */
function thresholdsOf(layout: HomeLayout): number[] {
  const out: number[] = [];
  for (let k = 0; k + 1 < layout.sections.length; k++) {
    const section = layout.sections[k];
    const next = layout.sections[k + 1].p0;
    const end = Math.max(section.p1, ...section.placements.map((p) => p.anchor));
    const mid = (end + next) / 2;
    out.push(k === 0 ? Math.min(mid + MANIFESTO_HOLD * layout.height, next) : mid);
  }
  return out;
}

function newTitle(el: HTMLElement, work: Work | null): Title {
  return { el, work, blur: 0, anchor: 0, alpha: 0, transform: '', opacity: '', filter: '' };
}

function fadeFor(asset: Asset): EdgeFade {
  if (!asset.cut.has('top') && !asset.cut.has('bottom')) return NO_FADE;
  return [asset.cut.has('top') ? CUT_FADE : 0, 0, asset.cut.has('bottom') ? CUT_FADE : 0, 0];
}

function titleElement(work: Work): HTMLElement {
  const el = document.createElement('article');
  el.className = 'home-title';
  el.dataset.slug = work.slug;
  const logo = document.createElement('img');
  logo.className = 'home-title__logo';
  logo.src = work.logo.src;
  logo.alt = work.name;
  logo.style.setProperty('--logo-w', String(work.logo.width));
  logo.style.setProperty('--logo-h', String(work.logo.height));
  const heading = document.createElement('h2');
  heading.className = 'home-title__headline';
  heading.textContent = work.headline.toLowerCase();
  el.append(logo, heading);
  return el;
}

export class HomeView implements View {
  readonly name = 'home';
  readonly scroll = new VirtualScroll();
  readonly root: HTMLElement;
  presence = 0;
  hidden: string | null = null;

  private titles: Title[] = [];
  private sections: SectionInput[] = [];
  private assets = new Map<Work, Asset[]>();
  private layoutState: HomeLayout | null = null;
  private sprites = new Map<number, Sprite>();
  private hover = new Map<number, Spring>();
  /** Cursor over each hovered placement, -1 to 1 across it; held after the cursor leaves so the fade-out keeps its shape. */
  private focus = new Map<number, { x: number; y: number }>();
  private hovered = -1;
  private visible: Placement[] = [];
  private lastPrefetch = Number.NaN;
  /** Scroll shrink of each placement, 0 to 1. */
  private shrink = new Map<number, number>();
  private press = new NotePress();
  private words: HTMLElement[];
  private lines: Line[] = [];
  /** Seconds into the intro: -Infinity while armed and waiting, Infinity when there is no intro. */
  private introClock = Infinity;
  /** Opacity of the manifesto's first word, which the Loader Wordmark lands on. */
  private landed = 1;
  private landedStyle = '';
  private armed = false;
  private measure: CanvasRenderingContext2D | null = null;
  /** Where each manifesto word rests on screen: its left edge and baseline, px. */
  private spots = new Map<HTMLElement, { x: number; y: number }>();
  private spotFont = '';
  private spotSpacing = '';
  private layouts = 0;
  /** Scroll offsets between consecutive sections where the title hands over. */
  private thresholds: number[] = [];
  /** Section the scroll is in, with the dead band applied. */
  private wanted = 0;
  /** Title on screen, or being morphed to. */
  private shown = 0;
  /** Title being morphed away from, -1 at rest. */
  private leaving = -1;
  /** Morph progress, 0 to 1. */
  private morph = 1;
  private goo: SVGFEColorMatrixElement;
  private gooValue = '';

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="home"]')!;
    this.goo = gooFilter();
    const landing = this.root.querySelector<HTMLElement>('.home-title--landing')!;
    this.words = splitWords(landing.querySelector<HTMLElement>('.home-title__manifesto')!);
    this.titles.push(newTitle(landing, null));
    for (const work of works) {
      const el = titleElement(work);
      this.root.append(el);
      this.titles.push(newTitle(el, work));
      this.assets.set(work, assetsOf(work));
    }
  }

  /** Hide the manifesto and hold its lines low until the Loader hands over. */
  armIntro(): void {
    this.armed = true;
    this.introClock = -Infinity;
    this.landed = 0;
    for (const line of this.lines) line.spring.set(RISE);
  }

  /** The Loader handoff has begun; lines rise in on their own clock from here. */
  startIntro(): void {
    if (this.introClock === -Infinity) this.introClock = 0;
  }

  setLanded(value: number): void {
    this.landed = value;
  }

  /** Ink box and baseline of the manifesto's first word at rest, in screen px. */
  landingWord(): LandingWord | null {
    const word = this.words[0];
    if (!word || !this.layoutState) return null;
    // The first word never carries a line transform, so its client rect is its rest position.
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0';
    word.append(probe);
    const baseline = probe.getBoundingClientRect().top;
    probe.remove();

    const style = getComputedStyle(word);
    const ctx = (this.measure ??= document.createElement('canvas').getContext('2d')!);
    ctx.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    ctx.letterSpacing = style.letterSpacing;
    const text = word.textContent ?? '';
    const left = word.getBoundingClientRect().left;
    // A prefix's ink ends at its last glyph, so each letter's centre is that edge less half its own ink.
    const centers = Array.from(text, (ch, i) => {
      const glyph = ctx.measureText(ch);
      const right = ctx.measureText(text.slice(0, i + 1)).actualBoundingBoxRight;
      return left + right - (glyph.actualBoundingBoxLeft + glyph.actualBoundingBoxRight) / 2;
    });
    return { baseline, ascent: ctx.measureText(text).actualBoundingBoxAscent, centers };
  }

  /** Changes whenever `drawUnderlay` would draw something different. */
  underlayKey(): string {
    return `${this.layouts} ${this.titles[0]?.opacity} ${this.landedStyle} ${this.lines.map((l) => l.style).join(',')}`;
  }

  /** The manifesto as the browser layer shows it, as white coverage in screen px, for the Glass mark over it. */
  drawUnderlay(ctx: OffscreenCanvasRenderingContext2D): void {
    const alpha = this.titles[0]?.alpha ?? 0;
    if (alpha <= 0.001 || !this.spots.size) return;
    ctx.font = this.spotFont;
    ctx.letterSpacing = this.spotSpacing;
    ctx.textBaseline = 'alphabetic';
    const write = (word: HTMLElement, a: number, dy: number): void => {
      const spot = this.spots.get(word);
      if (!spot || a <= 0.001) return;
      ctx.globalAlpha = a;
      ctx.fillText(word.textContent ?? '', spot.x, spot.y + dy);
    };
    write(this.words[0], alpha * saturate(this.landed), 0);
    for (const line of this.lines) {
      const rise = line.spring.value;
      for (const word of line.words) write(word, alpha * saturate(1 - rise / RISE), rise);
    }
  }

  layout(): void {
    const { width, height, reducedMotion } = this.ctx.viewport.state;
    const previous = this.layoutState;
    const ratio = previous && previous.max > 0 ? this.scroll.current / previous.max : 0;

    this.sections = this.titles.map((title) => {
      title.el.style.transform = 'none';
      const rect = title.el.getBoundingClientRect();
      const headline = title.el.querySelector('.home-title__headline, .home-title__manifesto');
      const text = headline ? headline.getBoundingClientRect() : rect;
      title.transform = '';
      title.blur = MORPH_BLUR * parseFloat(getComputedStyle(headline ?? title.el).fontSize);
      // The logo hangs off the headline, so titles with or without one line up.
      title.anchor = text.top - rect.top + text.height / 2;
      return {
        key: title.work?.slug ?? 'landing',
        // Symmetric about the anchor, since that is the point the layout centers.
        title: { width: text.width, height: 2 * Math.max(title.anchor, rect.height - title.anchor) },
        assets: title.work ? (this.assets.get(title.work) ?? []) : [],
      };
    });
    this.measureSpots();
    this.measureLines();

    const t0 = performance.now();
    this.layoutState = computeLayout(this.sections, { width, height, reducedMotion, copies: COPIES });
    if (import.meta.env.DEV) {
      const l = this.layoutState;
      console.debug(
        `[home] ${l.mode} layout, ${l.placements.length} Assets, ${(l.max / height).toFixed(1)} screens, ${(performance.now() - t0).toFixed(1)} ms`,
      );
    }
    this.scroll.setEase(reducedMotion ? 60 : 9);
    this.scroll.setMax(this.layoutState.max);
    this.scroll.to(ratio * this.layoutState.max, true);
    this.thresholds = thresholdsOf(this.layoutState);
    this.wanted = this.sectionAt(this.scroll.current, 0);
    this.settle();
    this.sprites.clear();
    this.hover.clear();
    this.focus.clear();
    this.shrink.clear();
    this.lastPrefetch = Number.NaN;
  }

  update(frame: FrameTime): boolean {
    const layout = this.layoutState;
    if (!layout) return false;
    let active = this.scroll.update(frame.dt);
    const s = this.scroll.current;
    const { height: vh, reducedMotion } = this.ctx.viewport.state;

    this.visible = this.query(layout, s, s);
    if (this.updateTitles(layout, s, vh, frame.dt, reducedMotion)) active = true;
    if (this.updateLines(frame.dt, reducedMotion)) active = true;

    if (!(Math.abs(s - this.lastPrefetch) < vh * 0.25)) {
      this.lastPrefetch = s;
      for (const p of this.query(layout, s - vh * 0.5, s + vh * 1.75)) this.ctx.engine.prefetch(p.asset.texture, p.w);
    }

    const pointer = this.ctx.pointer.state;
    const hovered = this.presence > 0.9 && pointer.inside ? this.hitTest(pointer.x, pointer.y, s) : -1;
    if (hovered !== this.hovered) {
      this.hovered = hovered;
      active = true;
    }

    const speed = reducedMotion ? 0 : smoothstep(SHRINK_FROM, SHRINK_FULL, Math.abs(this.scroll.velocity));
    if (this.press.update(this.scroll.velocity, frame.dt, reducedMotion)) active = true;
    for (const p of this.visible) {
      let spring = this.hover.get(p.index);
      if (!spring) {
        spring = new Spring(0, HOVER_STIFFNESS, HOVER_DAMPING);
        this.hover.set(p.index, spring);
      }
      spring.target = p.index === hovered ? 1 : 0;
      if (spring.update(frame.dt)) active = true;
      if (this.updateShrink(p, s, vh, speed, frame.dt)) active = true;
      const sprite = this.place(p, s, vh, spring.value, this.shrink.get(p.index) ?? 0, reducedMotion);
      if (this.updateFocus(p, s, vh, p.index === hovered, frame.dt, sprite)) active = true;
      if (this.ctx.engine.appear(p.asset.texture) < 1) active = true;
      sprite.opacity *= this.ctx.engine.appear(p.asset.texture);
    }
    return active;
  }

  draw(out: DrawList): void {
    const layout = this.layoutState;
    if (!layout || this.presence <= 0.001) return;
    for (const p of this.visible) {
      const sprite = this.sprites.get(p.index);
      if (!sprite || sprite.id === this.hidden) continue;
      sprite.opacity *= this.presence;
      out.sprites.push(sprite);
    }
    const vh = layout.height;
    const s = this.scroll.current;
    for (let i = 0; i < layout.sections.length; i++) {
      const glow = this.titles[i].work?.glow;
      if (!glow) continue;
      const section = layout.sections[i];
      const off = s < section.p0 ? section.p0 - s : s > section.p1 ? section.p1 - s : 0;
      const strength = (1 - smoothstep(0, vh * 0.9, Math.abs(off))) * 0.32 * this.presence;
      if (strength > 0.002) {
        out.glows.push({
          x: layout.width / 2,
          y: vh / 2 + off * 0.6,
          radius: Math.max(layout.width, vh) * 0.5,
          color: glow,
          strength,
        });
      }
    }
  }

  pointerTarget(x: number, y: number): boolean {
    return this.hitTest(x, y, this.scroll.current) >= 0;
  }

  tap(x: number, y: number): void {
    const index = this.hitTest(x, y, this.scroll.current);
    if (index < 0) return;
    const sprite = this.sprites.get(index);
    const placement = this.layoutState?.placements.find((p) => p.index === index);
    if (!sprite || !placement) return;
    this.ctx.navigate(`/${placement.asset.work.slug}`, {
      morph: { sprite: { ...sprite, opacity: 1 }, assetId: placement.asset.id, placement: index },
    });
  }

  /** Live sprite of a placement at the current scroll, for a morph back to Home. */
  spriteFor(index: number): Sprite | null {
    const layout = this.layoutState;
    const placement = layout?.placements.find((p) => p.index === index);
    if (!layout || !placement) return null;
    const { reducedMotion } = this.ctx.viewport.state;
    const sprite = this.place(placement, this.scroll.current, layout.height, 0, 0, reducedMotion);
    return { ...sprite, opacity: 1 };
  }

  /** The visible placement of an Asset closest to the viewport center. */
  placementOf(assetId: string): number {
    const layout = this.layoutState;
    if (!layout) return -1;
    const s = this.scroll.current;
    let best = -1;
    let bestDistance = Infinity;
    for (const p of layout.placements) {
      if (p.asset.id !== assetId) continue;
      const distance = Math.abs(p.anchor - s);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = p.index;
      }
    }
    return best;
  }

  sleep(): void {
    for (const title of this.titles) {
      title.el.style.visibility = 'hidden';
      title.el.style.filter = '';
      title.alpha = 0;
      title.opacity = '';
      title.transform = '';
      title.filter = '';
    }
    this.settle();
    this.setGoo(0);
  }

  private place(p: Placement, s: number, vh: number, hover: number, shrink: number, reduced: boolean): Sprite {
    let sprite = this.sprites.get(p.index);
    if (!sprite) {
      sprite = createSprite(`home:${p.index}`, p.asset.texture);
      sprite.fade = fadeFor(p.asset);
      this.sprites.set(p.index, sprite);
    }
    const cy = vh / 2 + (p.anchor - s) * p.speed;
    const edge = reduced ? 0 : smoothstep(vh * 0.28, vh * 0.62, Math.abs(cy - vh / 2));
    const scale = (1 - 0.07 * edge) * (1 - SCROLL_SHRINK * shrink);
    const w = p.w * scale;
    const h = p.h * scale;
    sprite.x = p.x + (p.w - w) / 2;
    sprite.y = cy - h / 2;
    sprite.w = sprite.iw = w;
    sprite.h = sprite.ih = h;
    sprite.ix = sprite.x;
    sprite.iy = sprite.y;
    sprite.hover = hover;
    sprite.lift = this.press.lift;
    sprite.opacity = 1;
    sprite.image = 1;
    return sprite;
  }

  private query(layout: HomeLayout, from: number, to: number): Placement[] {
    const list = layout.placements;
    let lo = 0;
    let hi = list.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (list[mid].sMin <= to) lo = mid + 1;
      else hi = mid;
    }
    const out: Placement[] = [];
    for (let i = lo - 1; i >= 0; i--) {
      const p = list[i];
      if (p.sMin < from - layout.span) break;
      if (p.sMax >= from) out.push(p);
    }
    return out.reverse();
  }

  /** Eases a placement's scroll shrink towards `speed`. Notes stay full size. Returns true while still easing. */
  private updateShrink(p: Placement, s: number, vh: number, speed: number, dt: number): boolean {
    if (p.asset.note) return false;
    const current = this.shrink.get(p.index) ?? 0;
    if (current === speed) return false;
    const cy = vh / 2 + (p.anchor - s) * p.speed;
    // Content moves up while scrolling down, so the top of the screen leads; reversed going up.
    const along = saturate(cy / vh);
    const lag = this.scroll.velocity < 0 ? 1 - along : along;
    let next = damp(current, speed, lerp(SHRINK_RATE_LEAD, SHRINK_RATE_LAG, lag), dt);
    if (Math.abs(next - speed) < 1e-4) next = speed;
    this.shrink.set(p.index, next);
    return next !== speed;
  }

  /** Eases the vignette's lean towards the cursor while hovered. Returns true while it is still catching up. */
  private updateFocus(p: Placement, s: number, vh: number, hovered: boolean, dt: number, sprite: Sprite): boolean {
    let focus = this.focus.get(p.index);
    if (!focus) {
      if (!hovered) return false;
      focus = { x: 0, y: 0 };
      this.focus.set(p.index, focus);
    }
    let moving = false;
    if (hovered) {
      const pointer = this.ctx.pointer.state;
      const cy = vh / 2 + (p.anchor - s) * p.speed;
      const tx = clamp((pointer.x - (p.x + p.w / 2)) / (p.w / 2), -1, 1);
      const ty = clamp((pointer.y - cy) / (p.h / 2), -1, 1);
      focus.x = damp(focus.x, tx, FOCUS_RATE, dt);
      focus.y = damp(focus.y, ty, FOCUS_RATE, dt);
      moving = Math.abs(focus.x - tx) > 1e-3 || Math.abs(focus.y - ty) > 1e-3;
    }
    sprite.focusX = focus.x;
    sprite.focusY = focus.y;
    return moving;
  }

  private hitTest(x: number, y: number, s: number): number {
    const layout = this.layoutState;
    if (!layout) return -1;
    for (let i = this.visible.length - 1; i >= 0; i--) {
      const p = this.visible[i];
      const cy = layout.height / 2 + (p.anchor - s) * p.speed;
      if (x >= p.x && x <= p.x + p.w && y >= cy - p.h / 2 && y <= cy + p.h / 2) return p.index;
    }
    return -1;
  }

  /** Section for scroll `s`, moving from `from` only once `s` clears a threshold's dead band. */
  private sectionAt(s: number, from: number): number {
    const band = this.ctx.viewport.state.height * THRESHOLD_BAND;
    let k = clamp(from, 0, this.thresholds.length);
    while (k < this.thresholds.length && s > this.thresholds[k] + band) k++;
    while (k > 0 && s < this.thresholds[k - 1] - band) k--;
    return k;
  }

  /** Drop any morph in flight and show the wanted title outright. */
  private settle(): void {
    this.shown = this.wanted;
    this.leaving = -1;
    this.morph = 1;
  }

  /**
   * Titles stay fixed at the viewport center. Crossing a threshold starts a timed morph
   * from the current title to the next; scrolling only decides when, never how far along.
   */
  private updateTitles(layout: HomeLayout, s: number, vh: number, dt: number, reduced: boolean): boolean {
    const presence = this.presence;
    this.wanted = this.sectionAt(s, this.wanted);

    if (presence <= 0.001 || reduced) {
      this.settle();
    } else if (this.leaving >= 0) {
      // Heading back mid-morph: run the same morph in reverse rather than pop.
      if (this.wanted === this.leaving) {
        [this.leaving, this.shown] = [this.shown, this.leaving];
        this.morph = 1 - this.morph;
      }
    } else if (this.wanted !== this.shown) {
      this.leaving = this.shown;
      this.shown = this.wanted;
      this.morph = 0;
    }
    if (this.leaving >= 0) {
      this.morph = Math.min(1, this.morph + dt / MORPH_TIME);
      if (this.morph >= 1) this.leaving = -1;
    }

    const morphing = this.leaving >= 0;
    const t = morphing ? easeInOutCubic(this.morph) : 1;
    // The threshold only welds blurred shapes; let go of it before either title is sharp, or its hard alpha edge shows.
    this.setGoo(morphing ? smoothstep(0.04, 0.3, Math.min(t, 1 - t)) : 0);
    const dim = layout.mode === 'stack' ? this.covered(layout, s, vh) : 0;
    const visibility = presence > 0.001 ? 'visible' : 'hidden';

    for (let i = 0; i < this.titles.length; i++) {
      const title = this.titles[i];
      const section = layout.sections[i];
      if (!section) continue;
      const weight = i === this.shown ? t : i === this.leaving ? 1 - t : 0;
      // Full strength through the middle, where the threshold needs mass; gone by the tails so no haze outlives it.
      const opacity = smoothstep(0, 0.6, weight) * presence * (1 - dim);
      title.alpha = opacity;
      const blur = weight > 0 && weight < 1 ? Math.min(title.blur / weight - title.blur, title.blur * MORPH_BLUR_MAX) : 0;

      const transform = `translate3d(0, ${(-title.anchor).toFixed(2)}px, 0)`;
      if (transform !== title.transform) {
        title.transform = transform;
        title.el.style.transform = transform;
      }
      const filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : '';
      if (filter !== title.filter) {
        title.filter = filter;
        title.el.style.filter = filter;
      }
      const opacityValue = `${opacity.toFixed(3)}|${visibility}`;
      if (opacityValue !== title.opacity) {
        title.opacity = opacityValue;
        title.el.style.opacity = opacity.toFixed(3);
        title.el.style.visibility = visibility;
      }
    }
    return morphing;
  }

  /** Ramps the alpha threshold in over a morph and out again, so titles at rest keep their antialiasing. */
  private setGoo(strength: number): void {
    const value = strength > 0.001 ? strength.toFixed(3) : '';
    if (value === this.gooValue) return;
    this.gooValue = value;
    this.root.style.filter = value ? `url(#${GOO_ID})` : '';
    if (!value) return;
    const a = lerp(1, GOO_SLOPE, strength);
    const b = lerp(0, 0.5 - GOO_SLOPE * GOO_CUT, strength);
    this.goo.setAttribute('values', `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${a.toFixed(3)} ${b.toFixed(3)}`);
  }

  /**
   * In the stacked layout Assets pass behind the centered title; fade it while one does.
   * 0 when nothing is near, 1 when an Asset covers the title's band.
   */
  private covered(layout: HomeLayout, s: number, vh: number): number {
    const box = layout.sections[this.shown]?.title;
    if (!box) return 0;
    const x0 = (layout.width - box.width) / 2;
    const x1 = x0 + box.width;
    const margin = vh * 0.08;
    let dim = 0;
    for (const p of this.visible) {
      if (p.x + p.w <= x0 || p.x >= x1) continue;
      const cy = vh / 2 + (p.anchor - s) * p.speed;
      const gap = Math.abs(cy - vh / 2) - (p.h + box.height) / 2;
      dim = Math.max(dim, 1 - smoothstep(0, margin, gap));
    }
    return dim;
  }

  /**
   * Rest position of each manifesto word, once its title is lifted onto the viewport center. Clears
   * the line rise first; the lines rebuilt next put it back.
   */
  private measureSpots(): void {
    this.layouts++;
    this.spots.clear();
    const first = this.words[0];
    const landing = this.titles[0];
    if (!first || !landing) return;
    for (const word of this.words.slice(1)) {
      word.style.transform = '';
      word.style.opacity = '';
    }
    const probe = document.createElement('span');
    probe.style.cssText = 'display:inline-block;width:0;height:0';
    first.append(probe);
    const baseline = probe.getBoundingClientRect().top - first.getBoundingClientRect().top;
    probe.remove();
    for (const word of this.words) {
      const rect = word.getBoundingClientRect();
      this.spots.set(word, { x: rect.left, y: rect.top + baseline - landing.anchor });
    }
    const style = getComputedStyle(first);
    this.spotFont = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
    this.spotSpacing = style.letterSpacing;
  }

  /** Groups the manifesto words (minus the first, which the Loader Wordmark lands on) into visual lines. */
  private measureLines(): void {
    const lines: Line[] = [];
    let last: Line | null = null;
    let lastTop = this.words[0]?.offsetTop ?? Number.NaN;
    for (const word of this.words.slice(1)) {
      const top = word.offsetTop;
      if (!last || Math.abs(top - lastTop) > 2) {
        const rest = this.armed && this.introClock < LINE_START + lines.length * LINE_STAGGER;
        last = { words: [], spring: new Spring(rest ? RISE : 0, 60, 15.5), style: '' };
        lines.push(last);
        lastTop = top;
      }
      last.words.push(word);
    }
    this.lines = lines;
  }

  private updateLines(dt: number, reduced: boolean): boolean {
    let moving = false;
    const running = Number.isFinite(this.introClock);
    if (running) this.introClock += dt;
    this.lines.forEach((line, k) => {
      if (this.introClock >= LINE_START + k * LINE_STAGGER) line.spring.target = 0;
      if (reduced) line.spring.set(line.spring.target);
      let live = line.spring.update(dt);
      // Below a hundredth of the rise the tail is invisible; settle rather than inch on for seconds.
      if (live && line.spring.target === 0 && Math.abs(line.spring.value) < RISE * 0.01 && Math.abs(line.spring.velocity) < 1) {
        line.spring.set(0);
        live = false;
      }
      if (live) moving = true;
      const rise = line.spring.value;
      const style = rise ? `${rise.toFixed(2)}|${saturate(1 - rise / RISE).toFixed(3)}` : '';
      if (style !== line.style) {
        line.style = style;
        for (const word of line.words) {
          word.style.transform = rise ? `translate3d(0, ${rise.toFixed(2)}px, 0)` : '';
          word.style.opacity = rise ? saturate(1 - rise / RISE).toFixed(3) : '';
        }
      }
    });
    if (running && this.introClock > LINE_START + this.lines.length * LINE_STAGGER && !moving) {
      this.introClock = Infinity;
      this.armed = false;
    }

    const landed = this.landed >= 1 ? '' : this.landed.toFixed(3);
    if (landed !== this.landedStyle && this.words[0]) {
      this.landedStyle = landed;
      this.words[0].style.opacity = landed;
    }
    return moving || Number.isFinite(this.introClock);
  }

}

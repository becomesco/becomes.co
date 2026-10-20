import { Spring } from '../../core/motion';
import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { createSprite, NO_FADE, type EdgeFade, type Sprite } from '../../graphics/scene/types';
import { clamp, smoothstep } from '../../utils/math';
import { assetsOf, works, type Asset, type Work } from '../data/works';
import type { AppContext, DrawList, View } from '../view';
import { computeLayout, type HomeLayout, type Placement, type SectionInput } from './layout';

const COPIES = 4;
const CUT_FADE = 0.2;
const HOVER_SCALE = 0.035;

interface Title {
  el: HTMLElement;
  work: Work | null;
  transform: string;
  opacity: string;
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
  const link = document.createElement('a');
  link.href = `/${work.slug}`;
  link.dataset.link = '';
  link.textContent = work.headline.toLowerCase();
  heading.append(link);
  el.append(logo, heading);
  if (work.url) {
    const visit = document.createElement('a');
    visit.className = 'visit-link';
    visit.href = work.url;
    visit.target = '_blank';
    visit.rel = 'noopener';
    visit.textContent = 'visit site →';
    el.append(visit);
  }
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
  private hovered = -1;
  private visible: Placement[] = [];
  private lastPrefetch = Number.NaN;
  private cursor = '';
  private intro = 1;

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="home"]')!;
    const landing = this.root.querySelector<HTMLElement>('.home-title--landing')!;
    this.titles.push({ el: landing, work: null, transform: '', opacity: '' });
    for (const work of works) {
      const el = titleElement(work);
      this.root.append(el);
      this.titles.push({ el, work, transform: '', opacity: '' });
      this.assets.set(work, assetsOf(work));
    }
    this.root.addEventListener('focusin', this.onFocus);
  }

  /** Landing reveal after the loader, 0 → 1. */
  setIntro(value: number): void {
    this.intro = value;
  }

  layout(): void {
    const { width, height, reducedMotion } = this.ctx.viewport.state;
    const previous = this.layoutState;
    const ratio = previous && previous.max > 0 ? this.scroll.current / previous.max : 0;

    this.sections = this.titles.map((title) => {
      title.el.style.transform = 'none';
      const rect = title.el.getBoundingClientRect();
      const headline = title.el.querySelector('.home-title__headline, .home-title__manifesto');
      const textWidth = headline ? headline.getBoundingClientRect().width : rect.width;
      title.transform = '';
      return {
        key: title.work?.slug ?? 'landing',
        title: { width: textWidth, height: rect.height },
        assets: title.work ? (this.assets.get(title.work) ?? []) : [],
      };
    });

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
    this.sprites.clear();
    this.hover.clear();
    this.lastPrefetch = Number.NaN;
  }

  update(frame: FrameTime): boolean {
    const layout = this.layoutState;
    if (!layout) return false;
    let active = this.scroll.update(frame.dt);
    const s = this.scroll.current;
    const { height: vh, reducedMotion } = this.ctx.viewport.state;

    this.updateTitles(layout, s, vh);
    this.visible = this.query(layout, s, s);

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
    const cursor = hovered >= 0 ? 'pointer' : '';
    if (cursor !== this.cursor) {
      this.cursor = cursor;
      document.documentElement.style.cursor = cursor;
    }

    const bend = reducedMotion ? 0 : clamp(this.scroll.velocity * 0.008, -26, 26);
    for (const p of this.visible) {
      let spring = this.hover.get(p.index);
      if (!spring) {
        spring = new Spring(0, 260, 26);
        this.hover.set(p.index, spring);
      }
      spring.target = p.index === hovered ? 1 : 0;
      if (spring.update(frame.dt)) active = true;
      const sprite = this.place(p, s, vh, spring.value, bend, reducedMotion);
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
      morph: { sprite: { ...sprite, opacity: 1, bend: 0 }, assetId: placement.asset.id, placement: index },
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
      title.opacity = '';
      title.transform = '';
    }
    if (this.cursor) {
      this.cursor = '';
      document.documentElement.style.cursor = '';
    }
  }

  private place(p: Placement, s: number, vh: number, hover: number, bend: number, reduced: boolean): Sprite {
    let sprite = this.sprites.get(p.index);
    if (!sprite) {
      sprite = createSprite(`home:${p.index}`, p.asset.texture);
      sprite.fade = fadeFor(p.asset);
      this.sprites.set(p.index, sprite);
    }
    const cy = vh / 2 + (p.anchor - s) * p.speed;
    const edge = reduced ? 0 : smoothstep(vh * 0.28, vh * 0.62, Math.abs(cy - vh / 2));
    const scale = (1 - 0.07 * edge) * (1 + HOVER_SCALE * hover);
    const w = p.w * scale;
    const h = p.h * scale;
    sprite.x = p.x + (p.w - w) / 2;
    sprite.y = cy - h / 2;
    sprite.w = sprite.iw = w;
    sprite.h = sprite.ih = h;
    sprite.ix = sprite.x;
    sprite.iy = sprite.y;
    sprite.bend = bend * p.speed;
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

  private updateTitles(layout: HomeLayout, s: number, vh: number): void {
    const presence = this.presence;
    for (let i = 0; i < this.titles.length; i++) {
      const title = this.titles[i];
      const section = layout.sections[i];
      if (!section) continue;
      let off = s < section.p0 ? section.p0 - s : s > section.p1 ? section.p1 - s : 0;
      const reach = vh / 2 + section.title.height / 2;
      const onScreen = Math.abs(off) < reach && presence > 0.001;
      let opacity = (1 - smoothstep(vh * 0.16, vh * 0.5, Math.abs(off))) * presence;
      if (i === 0) {
        opacity *= this.intro;
        off += (1 - this.intro) * 40;
      }
      // Off-screen titles park below the fold but stay focusable for keyboard users.
      const y = onScreen ? off - section.title.height / 2 : vh * 2;
      const transform = `translate3d(0, ${y.toFixed(2)}px, 0)`;
      const opacityValue = onScreen ? opacity.toFixed(3) : '0';
      if (transform !== title.transform) {
        title.transform = transform;
        title.el.style.transform = transform;
      }
      if (opacityValue !== title.opacity) {
        title.opacity = opacityValue;
        title.el.style.opacity = opacityValue;
        title.el.style.visibility = presence > 0.001 ? 'visible' : 'hidden';
        title.el.style.pointerEvents = opacity > 0.4 ? '' : 'none';
      }
    }
  }

  private onFocus = (event: FocusEvent): void => {
    const layout = this.layoutState;
    const el = (event.target as HTMLElement).closest<HTMLElement>('.home-title');
    if (!layout || !el) return;
    const index = this.titles.findIndex((t) => t.el === el);
    const section = layout.sections[index];
    if (section) {
      this.scroll.to(section.p0);
      this.ctx.wake();
    }
  };
}

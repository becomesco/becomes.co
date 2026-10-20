import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { createSprite, NO_FADE, type EdgeFade, type Sprite } from '../../graphics/scene/types';
import { clamp, easeOutCubic, saturate } from '../../utils/math';
import { assetsOf, type Asset, type Work } from '../data/works';
import { createGrid } from '../home/grid';
import type { AppContext, DrawList, View } from '../view';

interface Card {
  asset: Asset;
  sprite: Sprite;
  x: number;
  y: number;
  w: number;
  h: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
}

const CARD_RADIUS = 12;
const CUT_FADE = 0.14;
/** Largest display size relative to the design size; beyond this the 2x export goes soft. */
const MAX_UPSCALE = 1.3;

function cardFade(asset: Asset): EdgeFade {
  if (!asset.cut.size) return NO_FADE;
  const f = (edge: 'top' | 'right' | 'bottom' | 'left') => (asset.cut.has(edge) ? CUT_FADE : 0);
  return [f('top'), f('right'), f('bottom'), f('left')];
}

export class WorkView implements View {
  readonly name = 'work';
  readonly scroll = new VirtualScroll();
  readonly root: HTMLElement;
  presence = 0;
  hidden: string | null = null;
  work: Work | null = null;

  private header: HTMLElement;
  private cards: Card[] = [];
  private openedAt = 0;
  private now = 0;
  private headerStyle = '';
  private contentTransform = '';
  private content: HTMLElement;

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="work"]')!;
    this.content = this.root.querySelector<HTMLElement>('.work__content')!;
    this.header = this.root.querySelector<HTMLElement>('.work-header')!;
  }

  /** Show a Work. `heroAssetId` goes first so the clicked Asset can morph into it. */
  open(work: Work, heroAssetId?: string): void {
    this.work = work;
    const assets = assetsOf(work);
    const heroIndex = Math.max(0, assets.findIndex((a) => a.id === heroAssetId));
    const ordered = [assets[heroIndex], ...assets.filter((_, i) => i !== heroIndex)];
    this.cards = ordered.map((asset, i) => {
      const sprite = createSprite(`work:${i}`, asset.texture);
      sprite.card = 1;
      sprite.radius = CARD_RADIUS;
      sprite.fade = cardFade(asset);
      return { asset, sprite, x: 0, y: 0, w: 0, h: 0, ix: 0, iy: 0, iw: 0, ih: 0 };
    });
    this.renderHeader(work);
    this.openedAt = this.now;
    this.headerStyle = '';
    this.scroll.to(0, true);
    this.layout();
  }

  layout(): void {
    if (!this.work) return;
    const { width: vw, height: vh, reducedMotion } = this.ctx.viewport.state;
    const grid = createGrid(vw);
    const W = vw - grid.margin * 2;
    const gap = grid.gutter;
    const desktop = vw >= 900;

    this.content.style.transform = 'none';
    this.contentTransform = '';
    const top = this.header.offsetTop + this.header.offsetHeight + clamp(vw * 0.088, 48, 140);
    const fullHeight = desktop ? Math.min(W * 0.585, vh * 0.86) : 0;

    let y = top;
    let i = 0;
    while (i < this.cards.length) {
      const card = this.cards[i];
      const next = this.cards[i + 1];
      const tall = (a: Asset) => a.width / a.height < 1.2;
      if (desktop && i > 0 && next && tall(card.asset) && tall(next.asset)) {
        const half = (W - gap) / 2;
        this.fit(card, grid.margin, y, half, fullHeight, desktop);
        this.fit(next, grid.margin + half + gap, y, half, fullHeight, desktop);
        y += fullHeight + gap;
        i += 2;
      } else {
        const h = desktop ? fullHeight : clamp((W * card.asset.height) / card.asset.width + 48, W * 0.8, vh * 0.72);
        this.fit(card, grid.margin, y, W, h, desktop);
        y += h + gap;
        i += 1;
      }
    }
    this.scroll.setEase(reducedMotion ? 60 : 9);
    this.scroll.setMax(y - gap + clamp(vw * 0.08, 60, 140) - vh);
  }

  update(frame: FrameTime): boolean {
    this.now = frame.elapsed;
    if (!this.work) return false;
    let active = this.scroll.update(frame.dt);
    const s = this.scroll.current;
    const { height: vh, reducedMotion } = this.ctx.viewport.state;
    const t = this.now - this.openedAt;

    const contentTransform = `translate3d(0, ${(-s).toFixed(2)}px, 0)`;
    if (contentTransform !== this.contentTransform) {
      this.contentTransform = contentTransform;
      this.content.style.transform = contentTransform;
    }

    const headerIn = reducedMotion ? 1 : easeOutCubic(saturate((t - 0.3) / 0.7));
    if (headerIn < 1) active = true;
    const headerStyle = `${(headerIn * this.presence).toFixed(3)}|${((1 - headerIn) * 28).toFixed(2)}`;
    if (headerStyle !== this.headerStyle) {
      this.headerStyle = headerStyle;
      this.header.style.opacity = (headerIn * this.presence).toFixed(3);
      this.header.style.transform = `translate3d(0, ${((1 - headerIn) * 28).toFixed(2)}px, 0)`;
    }

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const screenTop = card.y - s;
      const scrollIn = saturate((vh - screenTop) / (vh * 0.2));
      const timeIn = reducedMotion ? 1 : saturate((t - 0.45 - i * 0.08) / 0.7);
      const reveal = easeOutCubic(Math.min(scrollIn, timeIn));
      if (timeIn < 1) active = true;
      const appear = this.ctx.engine.appear(card.asset.texture);
      if (appear < 1 && screenTop < vh && screenTop + card.h > 0) active = true;
      this.position(card, s, (1 - reveal) * 48);
      card.sprite.opacity = reveal * this.presence;
      card.sprite.image = appear;
    }
    return active;
  }

  draw(out: DrawList): void {
    if (!this.work || this.presence <= 0.001) return;
    const vh = this.ctx.viewport.state.height;
    for (const card of this.cards) {
      const sprite = card.sprite;
      if (sprite.id === this.hidden || sprite.y > vh || sprite.y + sprite.h < 0) continue;
      out.sprites.push(sprite);
    }
    const glow = this.work.glow;
    if (glow) {
      out.glows.push({
        x: this.ctx.viewport.state.width * 0.12,
        y: 160 - this.scroll.current * 0.4,
        radius: Math.max(this.ctx.viewport.state.width, vh) * 0.45,
        color: glow,
        strength: 0.22 * this.presence,
      });
    }
  }

  /** The hero card as it will rest, for a morph from Home. */
  heroSprite(): Sprite | null {
    const card = this.cards[0];
    if (!card) return null;
    const sprite = { ...card.sprite };
    this.positionInto(sprite, card, this.scroll.current, 0);
    sprite.opacity = 1;
    sprite.image = 1;
    return sprite;
  }

  get heroAssetId(): string | null {
    return this.cards[0]?.asset.id ?? null;
  }

  sleep(): void {
    this.header.style.opacity = '0';
    this.headerStyle = '';
  }

  private fit(card: Card, x: number, y: number, w: number, h: number, desktop: boolean): void {
    const pad = desktop ? Math.max(32, w * 0.07) : 20;
    const availW = w - pad * 2;
    const availH = h - pad * 2;
    const scale = Math.min(availW / card.asset.width, availH / card.asset.height, MAX_UPSCALE);
    card.x = x;
    card.y = y;
    card.w = w;
    card.h = h;
    card.iw = card.asset.width * scale;
    card.ih = card.asset.height * scale;
    card.ix = x + (w - card.iw) / 2;
    card.iy = y + (h - card.ih) / 2;
  }

  private position(card: Card, s: number, lift: number): void {
    this.positionInto(card.sprite, card, s, lift);
  }

  private positionInto(sprite: Sprite, card: Card, s: number, lift: number): void {
    const dy = -s + lift;
    sprite.x = card.x;
    sprite.y = card.y + dy;
    sprite.w = card.w;
    sprite.h = card.h;
    sprite.ix = card.ix;
    sprite.iy = card.iy + dy;
    sprite.iw = card.iw;
    sprite.ih = card.ih;
  }

  private renderHeader(work: Work): void {
    const logo = this.header.querySelector<HTMLImageElement>('.work-header__logo')!;
    logo.src = work.logo.src;
    logo.alt = work.name;
    logo.style.setProperty('--logo-w', String(work.logo.width));
    logo.style.setProperty('--logo-h', String(work.logo.height));
    this.header.querySelector('.work-header__headline')!.textContent = work.headline.toLowerCase();
    const visit = this.header.querySelector<HTMLAnchorElement>('.work-header__visit')!;
    visit.hidden = !work.url;
    if (work.url) visit.href = work.url;
  }
}

import type { FrameTime } from '../../core/scheduler';
import { VirtualScroll } from '../../core/scroll';
import { createSprite, NO_FADE, type EdgeFade, type Sprite, type TextureRef } from '../../graphics/scene/types';
import { clamp, easeOutCubic, saturate } from '../../utils/math';
import { hashString } from '../../utils/random';
import { LAND_TURN, layoutCollage, MAX_UPSCALE } from '../collage';
import { assetsOf, screensOf, type Asset, type Screen, type Work } from '../data/works';
import { createGrid } from '../home/grid';
import { OTHER_IMAGE_RADIUS, OTHER_INSET, OTHER_RADIUS } from '../home/other';
import { NotePress } from '../note';
import type { AppContext, DrawList, View } from '../view';

/**
 * A Work View reads top to bottom: the clicked Asset, then one section per Screen (the whole
 * page in a frame) with the Work's story copy between them, then every other Asset of the Work
 * together in one collage, tilted and scattered like magnets on a fridge, then the contact link.
 */
type Kind = 'hero' | 'screen' | 'magnet';

/** One strip of a Screen's page, drawn inside its frame. */
interface Tile {
  sprite: Sprite;
  texture: TextureRef;
  /** Page px of the strip's top and height, including its overlap into the next strip. */
  top: number;
  rows: number;
}

interface Card {
  kind: Kind;
  asset: Asset | null;
  screen: Screen | null;
  /** Null for a Screen's frame; its page is in `tiles`. */
  texture: TextureRef | null;
  sprite: Sprite;
  tiles: Tile[];
  x: number;
  y: number;
  w: number;
  h: number;
  ix: number;
  iy: number;
  iw: number;
  ih: number;
  /** Magnet: resting turn, radians, and scroll px past the viewport's bottom edge before it lands. */
  tilt: number;
  delay: number;
}

/** Story copy in the browser layer, placed between Screens. */
interface Story {
  el: HTMLElement;
  after: number;
  top: number;
  style: string;
}

const CUT_FADE = 0.14;
/** Widest a Screen's page is shown, CSS px. */
const SCREEN_WIDTH = 1180;

function cardFade(asset: Asset): EdgeFade {
  if (!asset.cut.size) return NO_FADE;
  const f = (edge: 'top' | 'right' | 'bottom' | 'left') => (asset.cut.has(edge) ? CUT_FADE : 0);
  return [f('top'), f('right'), f('bottom'), f('left')];
}

function createCard(kind: Kind, id: string, texture: TextureRef | null, asset: Asset | null, screen: Screen | null): Card {
  const sprite = createSprite(id, texture);
  // Strips run past the seams they share, so only the page's own top and bottom corners round.
  const tiles = (screen?.tiles ?? []).map((tile, k) => {
    const strip = createSprite(`${id}:${k}`, tile.texture);
    strip.radius = OTHER_IMAGE_RADIUS;
    return { sprite: strip, texture: tile.texture, top: tile.top, rows: tile.rows };
  });
  const frame = kind === 'screen' || Boolean(asset?.frame);
  sprite.card = frame ? 1 : 0;
  sprite.radius = frame ? OTHER_RADIUS : (asset?.radius ?? 0);
  sprite.innerRadius = frame ? OTHER_IMAGE_RADIUS : (asset?.radius ?? 0);
  sprite.fade = asset ? cardFade(asset) : NO_FADE;
  return {
    kind,
    asset,
    screen,
    texture,
    sprite,
    tiles,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    ix: 0,
    iy: 0,
    iw: 0,
    ih: 0,
    tilt: 0,
    delay: 0,
  };
}

export class WorkView implements View {
  readonly name = 'work';
  readonly scroll = new VirtualScroll();
  readonly root: HTMLElement;
  presence = 0;
  hidden: string | null = null;
  work: Work | null = null;

  private header: HTMLElement;
  private cta: HTMLElement;
  private cards: Card[] = [];
  private stories: Story[] = [];
  /** `cards` in draw order. */
  private drawn: Card[] = [];
  private press = new NotePress();
  private openedAt = 0;
  private now = 0;
  private headerStyle = '';
  private ctaStyle = '';
  private ctaTop = 0;
  private contentTransform = '';
  private content: HTMLElement;
  private seed = 0;

  constructor(private ctx: AppContext) {
    this.root = document.querySelector<HTMLElement>('[data-view="work"]')!;
    this.content = this.root.querySelector<HTMLElement>('.work__content')!;
    this.header = this.root.querySelector<HTMLElement>('.work-header')!;
    this.cta = this.root.querySelector<HTMLElement>('.work-cta')!;
  }

  /** Show a Work. `heroAssetId` goes first so the clicked Asset can morph into it. */
  open(work: Work, heroAssetId?: string): void {
    this.work = work;
    const assets = assetsOf(work);
    const heroIndex = Math.max(0, assets.findIndex((a) => a.id === heroAssetId));
    const hero = assets[heroIndex];
    let n = 0;
    const id = () => `work:${n++}`;
    this.cards = [
      createCard('hero', id(), hero.texture, hero, null),
      ...screensOf(work).map((screen) => createCard('screen', id(), null, null, screen)),
      ...assets.filter((a) => a !== hero).map((asset) => createCard('magnet', id(), asset.texture, asset, null)),
    ];
    this.seed = hashString(hero.id);
    this.renderHeader(work);
    this.renderStory(work);
    this.openedAt = this.now;
    this.headerStyle = '';
    this.ctaStyle = '';
    this.scroll.to(0, true);
    this.layout();
  }

  layout(): void {
    if (!this.work) return;
    const { width: vw, height: vh, reducedMotion } = this.ctx.viewport.state;
    const grid = createGrid(vw);
    const W = vw - grid.margin * 2;
    const gap = grid.gutter;
    const section = clamp(vw * 0.06, 32, 96);
    const desktop = vw >= 900;

    this.content.style.transform = 'none';
    this.contentTransform = '';
    let y = this.header.offsetTop + this.header.offsetHeight + clamp(vw * 0.088, 48, 140);

    const hero = this.cards[0];
    const heroHeight = desktop
      ? Math.min(W * 0.585, vh * 0.86)
      : clamp((W * hero.asset!.height) / hero.asset!.width + 48, W * 0.8, vh * 0.72);
    this.fit(hero, grid.margin, y, W, heroHeight, desktop);
    y += hero.h + gap;

    const screens = this.cards.filter((c) => c.kind === 'screen');
    // A Story set after a Screen that shares a row lands after the whole row.
    // Its text starts at the left edge of the Screen frame above it.
    let told = 0;
    let row: Card[] = [];
    const tell = (shown: number) => {
      for (; told < this.stories.length && this.stories[told].after <= shown; told++) {
        const story = this.stories[told];
        // Before any row, the first Screen is framed early just to read its edges; the loop frames it again.
        if (!row.length && screens[0]) this.frame(screens[0], grid.margin, y, W);
        const ref = row.length ? row : screens.slice(0, 1);
        const left = ref.length ? ref[0].x : grid.margin;
        const right = ref.length ? ref[ref.length - 1].x + ref[ref.length - 1].w : grid.margin + W;
        story.top = y;
        story.el.style.top = `${y}px`;
        story.el.style.left = `${left}px`;
        story.el.style.width = `${right - left}px`;
        y += story.el.offsetHeight + section;
      }
    };
    if (this.stories[0]?.after === 0) y += section - gap;
    tell(0);
    for (let i = 0; i < screens.length; ) {
      const a = screens[i];
      const b = screens[i + 1];
      row = desktop && b && a.screen!.tablet && b.screen!.tablet ? [a, b] : [a];
      const slot = (W - gap * (row.length - 1)) / row.length;
      row.forEach((card, k) => this.frame(card, grid.margin + k * (slot + gap), y, slot));
      y += Math.max(...row.map((c) => c.h)) + section;
      i += row.length;
      tell(i);
    }
    tell(Infinity);

    const magnets = this.cards.filter((c) => c.kind === 'magnet');
    this.drawn = this.cards;
    if (magnets.length) y += this.collage(magnets, grid.margin, y, W, vw, vh, gap) + section;

    this.ctaTop = y;
    this.cta.style.top = `${y}px`;
    this.scroll.setEase(reducedMotion ? 60 : 9);
    this.scroll.setMax(y + this.cta.offsetHeight + clamp(vw * 0.08, 60, 140) - vh);
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
    if (this.press.update(this.scroll.velocity, frame.dt, reducedMotion)) active = true;
    const headerStyle = `${(headerIn * this.presence).toFixed(3)}|${((1 - headerIn) * 28).toFixed(2)}`;
    if (headerStyle !== this.headerStyle) {
      this.headerStyle = headerStyle;
      this.header.style.opacity = (headerIn * this.presence).toFixed(3);
      this.header.style.transform = `translate3d(0, ${((1 - headerIn) * 28).toFixed(2)}px, 0)`;
    }

    const ctaTop = this.ctaTop - s;
    const ctaScroll = saturate((vh - ctaTop) / (vh * 0.2));
    const ctaReveal = easeOutCubic(ctaScroll);
    const ctaStyle = `${(ctaReveal * this.presence).toFixed(3)}|${((1 - ctaReveal) * 28).toFixed(2)}`;
    if (ctaStyle !== this.ctaStyle) {
      this.ctaStyle = ctaStyle;
      this.cta.style.opacity = (ctaReveal * this.presence).toFixed(3);
      this.cta.style.transform = `translate3d(0, ${((1 - ctaReveal) * 28).toFixed(2)}px, 0)`;
    }

    for (const story of this.stories) {
      const reveal = easeOutCubic(saturate((vh - (story.top - s)) / (vh * 0.25)));
      const style = `${(reveal * this.presence).toFixed(3)}|${((1 - reveal) * 28).toFixed(2)}`;
      if (style === story.style) continue;
      story.style = style;
      story.el.style.opacity = (reveal * this.presence).toFixed(3);
      story.el.style.transform = `translate3d(0, ${((1 - reveal) * 28).toFixed(2)}px, 0)`;
    }

    for (let i = 0; i < this.cards.length; i++) {
      const card = this.cards[i];
      const sprite = card.sprite;
      const screenTop = card.y - s;
      const scrollIn = saturate((vh - screenTop - card.delay) / (vh * 0.2));
      const timeIn = reducedMotion ? 1 : saturate((t - 0.45 - Math.min(i, 5) * 0.08) / 0.7);
      const reveal = easeOutCubic(Math.min(scrollIn, timeIn));
      if (timeIn < 1) active = true;
      const dy = (1 - reveal) * 48 - s;
      this.positionInto(sprite, card, dy);
      sprite.rotation = card.tilt * (1 + (1 - reveal) * LAND_TURN);
      sprite.opacity = reveal * this.presence;
      sprite.lift = this.press.lift;
      if (card.texture) {
        if (this.near(screenTop, card.h, vh)) this.ctx.engine.prefetch(card.texture, card.iw);
        sprite.image = this.ctx.engine.appear(card.texture);
        if (sprite.image < 1 && screenTop < vh && screenTop + card.h > 0) active = true;
      }
      for (const tile of card.tiles) {
        this.placeTile(tile, card, dy);
        const top = tile.sprite.iy;
        if (this.near(top, tile.sprite.ih, vh)) this.ctx.engine.prefetch(tile.texture, card.iw);
        tile.sprite.opacity = sprite.opacity;
        tile.sprite.image = this.ctx.engine.appear(tile.texture);
        if (tile.sprite.image < 1 && top < vh && top + tile.sprite.ih > 0) active = true;
      }
    }
    return active;
  }

  draw(out: DrawList): void {
    if (!this.work || this.presence <= 0.001) return;
    const vh = this.ctx.viewport.state.height;
    for (const card of this.drawn) {
      const sprite = card.sprite;
      const swing = (sprite.w + sprite.h) * 0.5 * Math.abs(Math.sin(sprite.rotation));
      if (sprite.id === this.hidden || sprite.y - swing > vh || sprite.y + sprite.h + swing < 0) continue;
      out.sprites.push(sprite);
      for (const tile of card.tiles) {
        const strip = tile.sprite;
        if (strip.iy <= vh && strip.iy + strip.ih >= 0) out.sprites.push(strip);
      }
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
    this.positionInto(sprite, card, -this.scroll.current);
    sprite.rotation = 0;
    sprite.opacity = 1;
    sprite.image = 1;
    return sprite;
  }

  get heroAssetId(): string | null {
    return this.cards[0]?.asset?.id ?? null;
  }

  sleep(): void {
    this.header.style.opacity = '0';
    this.headerStyle = '';
    this.cta.style.opacity = '0';
    this.ctaStyle = '';
    for (const story of this.stories) {
      story.el.style.opacity = '0';
      story.style = '';
    }
  }

  /** Within a viewport of the screen, where a texture is worth loading ahead. */
  private near(top: number, h: number, vh: number): boolean {
    return top < vh * 2 && top + h > -vh;
  }

  /**
   * First Asset of the View: sized into `h` at most, then sitting at the top of that slot.
   * Centering a short Asset in the full section puts it under the header and often off-screen.
   */
  private fit(card: Card, x: number, y: number, w: number, h: number, desktop: boolean): void {
    const asset = card.asset!;
    const pad = desktop ? Math.max(32, w * 0.07) : 20;
    const framePad = asset.frame ? OTHER_INSET : 0;
    const availW = w - pad * 2 - framePad * 2;
    const availH = h - pad * 2 - framePad * 2;
    const scale = Math.min(availW / asset.width, availH / asset.height, MAX_UPSCALE);
    card.x = x;
    card.y = y;
    card.w = w;
    card.iw = asset.width * scale;
    card.ih = asset.height * scale;
    card.ix = x + pad + framePad + (availW - card.iw) / 2;
    card.iy = y + pad + framePad;
    card.h = card.ih + pad * 2 + framePad * 2;
  }

  /** A Screen's frame, centered in a `w` wide slot at `y`, with the whole page in it. */
  private frame(card: Card, x: number, y: number, w: number): void {
    const [pw, ph] = card.screen!.px;
    const iw = Math.min(w - OTHER_INSET * 2, SCREEN_WIDTH, (pw / 2) * MAX_UPSCALE);
    const ih = (iw * ph) / pw;
    card.w = iw + OTHER_INSET * 2;
    card.h = ih + OTHER_INSET * 2;
    card.x = x + (w - card.w) / 2;
    card.y = y;
    card.iw = iw;
    card.ih = ih;
    card.ix = card.x + OTHER_INSET;
    card.iy = y + OTHER_INSET;
  }

  /** A strip at its place in the page; its outer rect reaches past inner seams so their corners stay square. */
  private placeTile(tile: Tile, card: Card, dy: number): void {
    const scale = card.iw / card.screen!.px[0];
    const strip = tile.sprite;
    const top = card.iy + dy + tile.top * scale;
    const bottom = top + tile.rows * scale;
    const reach = OTHER_IMAGE_RADIUS * 2;
    strip.x = strip.ix = card.ix;
    strip.w = strip.iw = card.iw;
    strip.iy = top;
    strip.ih = bottom - top;
    strip.y = tile.top > 0 ? top - reach : top;
    strip.h = Math.min(bottom + reach, card.iy + dy + card.ih) - strip.y;
  }

  /** Places magnets in a `W` wide band at `top`, and returns its height. */
  private collage(cards: Card[], left: number, top: number, W: number, vw: number, vh: number, gap: number): number {
    const magnets = cards.map(({ asset }) => ({ width: asset!.width, height: asset!.height, px: asset!.texture.px, frame: asset!.frame, note: asset!.note }));
    const { placements, order, height } = layoutCollage(magnets, left, top, W, vw, vh, gap, this.seed);
    cards.forEach((card, i) => Object.assign(card, placements[i]));
    this.drawn = [...this.cards.filter((c) => c.kind !== 'magnet'), ...order.map((i) => cards[i])];
    return height;
  }

  private positionInto(sprite: Sprite, card: Card, dy: number): void {
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
    this.header.querySelector('.work-header__intro')!.replaceChildren(
      ...work.intro.map((text) => {
        const p = document.createElement('p');
        p.className = 'work-header__text';
        p.textContent = text;
        return p;
      }),
    );
    this.header.querySelector('.work-header__services > span:last-child')!.textContent = `${work.services.join(', ')}.`;
    const visit = this.header.querySelector<HTMLAnchorElement>('.work-header__visit')!;
    visit.hidden = !work.url;
    if (work.url) visit.href = work.url;
  }

  private renderStory(work: Work): void {
    for (const story of this.stories) story.el.remove();
    const defs = [...(work.story ?? [])].sort((a, b) => a.after - b.after);
    this.stories = defs.map((def) => {
      const el = document.createElement('div');
      el.className = 'work-story';
      el.append(
        ...def.text.map((text) => {
          const p = document.createElement('p');
          p.className = 'work-story__text';
          p.textContent = text;
          return p;
        }),
      );
      this.cta.before(el);
      return { el, after: def.after, top: 0, style: '' };
    });
  }
}

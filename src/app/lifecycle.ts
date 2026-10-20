import { ScrollInput } from '../core/input';
import { Pointer } from '../core/pointer';
import { Scheduler, type FrameTime } from '../core/scheduler';
import { Viewport } from '../core/viewport';
import { Engine } from '../graphics/engine';
import { Chrome } from '../ui/chrome';
import { Loader } from '../ui/overlays/loader';
import { saturate } from '../utils/math';
import { AboutView } from './about/about-view';
import { ContactView } from './contact/contact-view';
import { assetsOf, works } from './data/works';
import { HomeView } from './home/home-view';
import { Morph } from './morph';
import { Router, type Route } from './router';
import type { AppContext, DrawList, NavigationIntent, View, ViewName } from './view';
import { WorkView } from './work/work-view';

const BACKGROUND: readonly [number, number, number] = [228 / 255, 226 / 255, 220 / 255];

interface Fade {
  view: View;
  from: number;
  to: number;
  delay: number;
  duration: number;
  t: number;
}

const TITLES: Record<Exclude<ViewName, 'work'>, string> = {
  home: 'Becomes — the digital systems brilliant companies are built on',
  about: 'About — Becomes',
  contact: 'Contact — Becomes',
};

export class App {
  private scheduler = new Scheduler();
  private viewport = new Viewport();
  private pointer: Pointer;
  private engine!: Engine;
  private router!: Router;
  private chrome = new Chrome();
  private loader: Loader;
  private views!: Record<ViewName, View>;
  private home!: HomeView;
  private work!: WorkView;
  private about!: AboutView;
  private contact!: ContactView;
  private current!: View;
  private fades: Fade[] = [];
  private morph: Morph | null = null;
  /** Home placement that opened the current Work, for the morph back. */
  private openedFrom: { placement: number; assetId: string } | null = null;
  private layoutKeys = new Map<View, string>();
  private list: DrawList = { sprites: [], glows: [] };
  private ready = false;

  constructor() {
    const stage = document.querySelector<HTMLElement>('.stage')!;
    this.pointer = new Pointer(stage, this.wake);
    this.loader = new Loader(this.viewport.state.reducedMotion);
  }

  async start(): Promise<void> {
    this.scheduler.add('loader', (frame) => {
      const active = this.loader.update(frame);
      this.landing();
      return active;
    });
    this.scheduler.wake();

    const fonts = document.fonts.ready.then(() => this.loader.setProgress(0.45));
    const engine = Engine.create({
      canvas: document.querySelector<HTMLCanvasElement>('.stage__canvas')!,
      fallbackHost: document.querySelector<HTMLElement>('.stage__fallback')!,
      invalidate: this.wake,
      onBackendChange: (kind) => document.documentElement.classList.toggle('no-webgpu', kind === 'dom'),
    });
    const [created] = await Promise.all([engine, fonts]);
    this.engine = created;
    this.loader.setProgress(0.7);

    const ctx: AppContext = {
      engine: this.engine,
      viewport: this.viewport,
      pointer: this.pointer,
      navigate: (path, intent) => this.router.navigate(path, intent),
      wake: this.wake,
    };
    this.home = new HomeView(ctx);
    this.work = new WorkView(ctx);
    this.about = new AboutView(ctx);
    this.contact = new ContactView(ctx);
    this.views = { home: this.home, work: this.work, about: this.about, contact: this.contact };
    this.current = this.home;
    this.loader.landOn(() => (this.current === this.home ? this.home.landingWord() : null));

    const { width, height, dpr } = this.viewport.state;
    this.engine.resize(width, height, dpr);
    this.viewport.onChange(this.onResize);

    new ScrollInput(() => this.current.scroll, this.wake, () => this.viewport.state.height);
    this.pointer.onTap((x, y) => {
      if (this.fades.length || this.morph || this.loader.active) return;
      this.current.tap?.(x, y);
    });
    window.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && this.current === this.work) this.router.back();
    });
    document.querySelector('.chrome__logo')?.addEventListener('click', (event) => {
      if (this.current !== this.home) return;
      event.preventDefault();
      this.home.scroll.to(0);
      this.wake();
    });

    this.scheduler.add('views', this.updateViews);
    this.scheduler.onRender(this.render);

    // Warm the first Work's Assets behind the loader.
    for (const asset of assetsOf(works[0]).slice(0, 6)) this.engine.prefetch(asset.texture, asset.width);

    this.router = new Router(this.onRoute);
    this.router.start();
    this.ready = true;
    this.loader.setProgress(1);
    if (import.meta.env.DEV) (window as unknown as { __app: App }).__app = this;
    this.wake();
  }

  private wake = (): void => {
    this.scheduler.wake();
  };

  private chromeIn = false;

  /** The Loader Wordmark glides into the manifesto as its lines rise in; Chrome settles in once the Loader is gone. */
  private landing(): void {
    if (!this.ready || this.current !== this.home) return;
    if (this.loader.handoffTime >= 0) this.home.startIntro();
    this.home.setLanded(this.loader.landed);
    if (!this.loader.active && !this.chromeIn) {
      this.chromeIn = true;
      this.chrome.reveal();
    }
  }

  private onRoute = (route: Route, intent: NavigationIntent, kind: 'initial' | 'push' | 'pop'): void => {
    const next = this.views[route.view];
    document.title = route.view === 'work' ? `${route.work.name} — Becomes` : TITLES[route.view];
    this.chrome.setView(route.view);

    if (kind === 'initial') {
      this.show(next, route);
      next.presence = 1;
      if (next === this.home) {
        this.home.armIntro();
      } else {
        this.loader.dismiss();
        this.chrome.reveal();
        next.presence = 0;
        this.fade(next, 0, 1, 0, 0.6);
      }
      this.current = next;
      this.wake();
      return;
    }

    const prev = this.current;
    if (prev === next && route.view !== 'work') return;
    const reduced = this.viewport.state.reducedMotion;
    this.morph = null;
    for (const view of Object.values(this.views)) view.hidden = null;

    this.show(next, route, intent);
    this.current = next;
    prev.scroll.enabled = false;
    next.scroll.enabled = true;

    const fromHome = prev === this.home && next === this.work && intent.morph;
    const toHome = prev === this.work && next === this.home && this.work.heroAssetId;

    if (fromHome && intent.morph) {
      this.openedFrom = { placement: intent.morph.placement, assetId: intent.morph.assetId };
      this.home.hidden = intent.morph.sprite.id;
      this.work.hidden = 'work:0';
      this.morph = new Morph(intent.morph.sprite, () => this.work.heroSprite(), reduced ? 0.35 : 1.15, () => {
        this.work.hidden = null;
        this.morph = null;
      });
      this.fade(prev, prev.presence, 0, 0, reduced ? 0.2 : 0.5);
      this.fade(next, 0, 1, reduced ? 0 : 0.1, reduced ? 0.25 : 0.6);
    } else if (toHome) {
      const assetId = this.work.heroAssetId!;
      const placement =
        this.openedFrom?.assetId === assetId ? this.openedFrom.placement : this.home.placementOf(assetId);
      const hero = this.work.heroSprite();
      if (hero && placement >= 0) {
        const from = { ...hero, y: hero.y };
        this.work.hidden = 'work:0';
        this.home.hidden = `home:${placement}`;
        this.morph = new Morph(from, () => this.home.spriteFor(placement), reduced ? 0.35 : 1.05, () => {
          this.home.hidden = null;
          this.morph = null;
        });
      }
      this.fade(prev, prev.presence, 0, 0, reduced ? 0.2 : 0.45);
      this.fade(next, next.presence, 1, reduced ? 0 : 0.2, reduced ? 0.25 : 0.7);
    } else {
      this.fade(prev, prev.presence, 0, 0, reduced ? 0.2 : 0.4);
      this.fade(next, prev === next ? 0 : next.presence, 1, reduced ? 0 : 0.25, reduced ? 0.25 : 0.6);
    }
    this.wake();
  };

  private show(view: View, route: Route, intent: NavigationIntent = {}): void {
    view.root.hidden = false;
    view.root.removeAttribute('inert');
    if (route.view === 'work') this.work.open(route.work, intent.morph?.assetId);
    if (view === this.about) this.about.open();
    if (view === this.contact) this.contact.open();
    this.ensureLayout(view, route.view === 'work');
    const heading = view.root.querySelector<HTMLElement>('[data-focus]');
    if (heading && view !== this.home) requestAnimationFrame(() => heading.focus({ preventScroll: true }));
  }

  private ensureLayout(view: View, force = false): void {
    const { width, height, reducedMotion } = this.viewport.state;
    const key = `${width}x${height}:${reducedMotion}`;
    if (!force && this.layoutKeys.get(view) === key) return;
    this.layoutKeys.set(view, key);
    view.layout();
  }

  private fade(view: View, from: number, to: number, delay: number, duration: number): void {
    this.fades = this.fades.filter((f) => f.view !== view);
    view.presence = from;
    this.fades.push({ view, from, to, delay, duration, t: 0 });
  }

  private onResize = (): void => {
    const { width, height, dpr } = this.viewport.state;
    this.engine.resize(width, height, dpr);
    for (const view of Object.values(this.views)) {
      if (!view.root.hidden) this.ensureLayout(view);
    }
    this.wake();
  };

  private updateViews = (frame: FrameTime): boolean => {
    let active = false;
    for (const fade of this.fades) {
      fade.t += frame.dt;
      const p = saturate((fade.t - fade.delay) / fade.duration);
      fade.view.presence = fade.from + (fade.to - fade.from) * p;
      if (p >= 1 && fade.to === 0) {
        fade.view.sleep?.();
        fade.view.root.hidden = true;
        fade.view.root.setAttribute('inert', '');
        fade.view.scroll.enabled = true;
      }
    }
    this.fades = this.fades.filter((f) => f.t < f.delay + f.duration);
    if (this.fades.length) active = true;

    for (const view of Object.values(this.views)) {
      if (view.root.hidden) continue;
      if (view.update(frame)) active = true;
    }
    if (this.morph?.update(frame.dt)) active = true;
    if (this.morph && !this.morph.active) this.morph = null;
    return active;
  };

  private render = (frame: FrameTime): void => {
    if (!this.engine || !this.views) return;
    const list = this.list;
    list.sprites.length = 0;
    list.glows.length = 0;
    for (const view of Object.values(this.views)) {
      if (view !== this.current && !view.root.hidden) view.draw(list);
    }
    this.current.draw(list);
    if (this.morph) list.sprites.push(this.morph.sprite);
    this.engine.render({ sprites: list.sprites, background: BACKGROUND, glows: list.glows }, frame);
  };
}

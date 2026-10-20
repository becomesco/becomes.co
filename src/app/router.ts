import { findWork, type Work } from './data/works';
import type { NavigationIntent } from './view';

export type Route =
  | { view: 'home' }
  | { view: 'work'; work: Work }
  | { view: 'about' }
  | { view: 'contact' };

export type RouteListener = (route: Route, intent: NavigationIntent, kind: 'initial' | 'push' | 'pop') => void;

export function parseRoute(pathname: string): Route | null {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return { view: 'home' };
  if (path === '/about') return { view: 'about' };
  if (path === '/contact') return { view: 'contact' };
  const slug = path.slice(1);
  if (slug.includes('/')) return null;
  const work = findWork(decodeURIComponent(slug));
  return work ? { view: 'work', work } : null;
}

export const pathOf = (route: Route): string => (route.view === 'work' ? `/${route.work.slug}` : route.view === 'home' ? '/' : `/${route.view}`);

/** History API routing. One canvas and one device for the session; no reloads. */
export class Router {
  current: Route = { view: 'home' };
  /** Position in this session's history; > 0 means a back step stays on the site. */
  private index = 0;

  constructor(private listener: RouteListener) {
    document.addEventListener('click', this.onClick);
    window.addEventListener('popstate', this.onPop);
  }

  start(): void {
    const route = parseRoute(location.pathname);
    history.replaceState({ index: 0 }, '', route ? location.pathname : '/');
    this.current = route ?? { view: 'home' };
    this.listener(this.current, {}, 'initial');
  }

  navigate(path: string, intent: NavigationIntent = {}): void {
    const route = parseRoute(path);
    if (!route) return;
    if (pathOf(route) === pathOf(this.current)) return;
    this.index++;
    history.pushState({ index: this.index }, '', pathOf(route));
    this.current = route;
    this.listener(route, intent, 'push');
  }

  private onPop = (event: PopStateEvent): void => {
    this.index = (event.state as { index?: number } | null)?.index ?? 0;
    const route = parseRoute(location.pathname) ?? { view: 'home' };
    this.current = route;
    this.listener(route, {}, 'pop');
  };

  private onClick = (event: MouseEvent): void => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as Element | null)?.closest?.('a');
    if (!anchor || anchor.target || anchor.hasAttribute('download')) return;
    const url = new URL(anchor.href, location.href);
    if (url.origin !== location.origin) return;
    if (anchor.dataset.back !== undefined) {
      event.preventDefault();
      this.back();
      return;
    }
    if (!parseRoute(url.pathname)) return;
    event.preventDefault();
    this.navigate(url.pathname);
  };

  /** A real history step when the previous entry is ours, otherwise a push to Home. */
  back(): void {
    if (this.index > 0) history.back();
    else this.navigate('/');
  }
}

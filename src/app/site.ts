import type { Route } from './router';

export const ORIGIN = 'https://becomes.co';

export const HOME_TITLE = 'Becomes · a design and technology studio for a more interesting internet.';
export const HOME_DESCRIPTION =
  'Becomes is a design and technology studio for a more interesting internet. Brands, products and experiences, from one team.';

const TITLES = {
  home: HOME_TITLE,
  about: 'About · Becomes',
  contact: 'Contact · Becomes',
} as const;

const DESCRIPTIONS = {
  home: HOME_DESCRIPTION,
  about:
    'Becomes is an independent design and technology studio. We make brands, products and experiences that get people involved.',
  contact: 'Start a project with Becomes. Strategy, brand, web and product, from one team.',
} as const;

function setMeta(selector: string, attr: string, value: string): void {
  const el = document.querySelector(selector);
  if (el) el.setAttribute(attr, value);
}

export function applyRouteMeta(route: Route): void {
  const title = route.view === 'work' ? `${route.work.name} · Becomes` : TITLES[route.view];
  const description =
    route.view === 'work' ? route.work.headline.replace(/\.$/, '') + '.' : DESCRIPTIONS[route.view];
  const url = `${ORIGIN}${route.view === 'home' ? '/' : route.view === 'work' ? `/${route.work.slug}` : `/${route.view}`}`;

  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', url);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);
  setMeta('link[rel="canonical"]', 'href', url);
}

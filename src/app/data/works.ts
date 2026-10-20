import media from './media.json';
import type { TextureRef } from '../../graphics/scene/types';

/**
 * Edges where the exported media is cut by its source frame. Left/right cuts are
 * pinned off the viewport edge on Home; top/bottom cuts fade out.
 */
export type CutEdge = 'top' | 'right' | 'bottom' | 'left';

export interface AssetDef {
  media: keyof typeof media;
  /** CSS width at the 1440 design size. Defaults to half the source px (2x export). */
  width?: number;
  cut?: readonly CutEdge[];
}

export interface Work {
  slug: string;
  name: string;
  headline: string;
  url?: string;
  logo: { src: string; width: number; height: number };
  /** Background glow while the Work is in view, sRGB 0-1. */
  glow?: readonly [number, number, number];
  assets: readonly AssetDef[];
}

export interface Asset {
  id: string;
  work: Work;
  texture: TextureRef;
  /** Size at the 1440 design width, CSS px. */
  width: number;
  height: number;
  cut: ReadonlySet<CutEdge>;
}

export const RESERVED_SLUGS = new Set(['about', 'contact']);

// Figma uses one placeholder headline for every Work.
const PLACEHOLDER_HEADLINE = 'Headless CMS built for developers, loved by their clients';

export const works: readonly Work[] = [
  {
    slug: 'bcms',
    name: 'BCMS',
    headline: PLACEHOLDER_HEADLINE,
    url: 'https://thebcms.com',
    logo: { src: '/logos/bcms.png', width: 111, height: 35.67 },
    assets: [
      { media: 'bcms/command-bar' },
      { media: 'bcms/code-snippet', cut: ['top'] },
      { media: 'bcms/turn-into-menu', cut: ['bottom', 'right'] },
      { media: 'bcms/properties', cut: ['left'] },
      { media: 'bcms/note' },
      { media: 'bcms/edit-template', cut: ['bottom'] },
      { media: 'bcms/frame-12446' },
      { media: 'bcms/group-1220', cut: ['right'] },
    ],
  },
  {
    slug: 'pyure',
    name: 'Pyure',
    headline: PLACEHOLDER_HEADLINE,
    logo: { src: '/logos/pyure.svg', width: 103, height: 26 },
    glow: [0.596, 1, 0],
    assets: [
      { media: 'pyure/glass-box' },
      { media: 'pyure/leaf-card' },
      { media: 'pyure/header' },
      { media: 'pyure/note' },
      { media: 'pyure/frame-12446' },
      { media: 'pyure/frame-12463' },
      { media: 'pyure/group' },
      { media: 'pyure/icon' },
      { media: 'pyure/demo', cut: ['right'] },
    ],
  },
  {
    slug: 'pov',
    name: 'POV',
    headline: PLACEHOLDER_HEADLINE,
    url: 'https://pov.camera',
    logo: { src: '/logos/pov.png', width: 73.67, height: 24 },
    assets: [
      { media: 'pov/tap-block', width: 300 },
      { media: 'pov/phone-grid', cut: ['bottom'] },
      { media: 'pov/get-started', cut: ['right'] },
      { media: 'pov/prints', width: 520 },
      { media: 'pov/qr-code' },
      { media: 'pov/group-730', cut: ['left'] },
      { media: 'pov/app-clip', cut: ['top'] },
      { media: 'pov/group-670' },
      { media: 'pov/note' },
      { media: 'pov/artwork' },
    ],
  },
  {
    slug: 'milmedic',
    name: 'Milmedic',
    headline: PLACEHOLDER_HEADLINE,
    logo: { src: '/logos/milmedic.svg', width: 170, height: 76 },
    assets: [
      { media: 'milmedic/group-1222' },
      { media: 'milmedic/photo' },
      { media: 'milmedic/frame-37' },
      { media: 'milmedic/frame-15' },
      { media: 'milmedic/note' },
    ],
  },
  {
    slug: 'heroic-rankings',
    name: 'Heroic Rankings',
    headline: PLACEHOLDER_HEADLINE,
    url: 'https://heroicrankings.com',
    logo: { src: '/logos/heroic-rankings.svg', width: 140, height: 40 },
    assets: [
      { media: 'heroic-rankings/statue-card' },
      { media: 'heroic-rankings/laptop', cut: ['left'] },
      { media: 'heroic-rankings/growth' },
      { media: 'heroic-rankings/hand', width: 148, cut: ['top'] },
      { media: 'heroic-rankings/statue', cut: ['right'] },
      { media: 'heroic-rankings/note' },
      { media: 'heroic-rankings/group-hand' },
      { media: 'heroic-rankings/group-statue' },
      { media: 'heroic-rankings/stats' },
      { media: 'heroic-rankings/frame-150', cut: ['bottom'] },
      { media: 'heroic-rankings/badge' },
    ],
  },
  {
    slug: 'videotoflip',
    name: 'Video to Flip',
    headline: PLACEHOLDER_HEADLINE,
    url: 'https://videotoflip.com',
    logo: { src: '/logos/videotoflip.svg', width: 50, height: 37 },
    assets: [
      { media: 'videotoflip/frame-150' },
      { media: 'videotoflip/confetti' },
      { media: 'videotoflip/final' },
      { media: 'videotoflip/note' },
      { media: 'videotoflip/group-3' },
      { media: 'videotoflip/four' },
    ],
  },
  {
    slug: 'basket',
    name: 'Basket',
    headline: PLACEHOLDER_HEADLINE,
    logo: { src: '/logos/basket.svg', width: 127, height: 40 },
    assets: [
      { media: 'basket/about-photo' },
      { media: 'basket/frame-12446', cut: ['bottom'] },
      { media: 'basket/frame-12447' },
      { media: 'basket/note' },
      { media: 'basket/screen', cut: ['bottom'] },
    ],
  },
  {
    slug: 'kooper',
    name: 'Kooper',
    headline: PLACEHOLDER_HEADLINE,
    logo: { src: '/logos/kooper.svg', width: 99, height: 25 },
    assets: [
      { media: 'kooper/note' },
      { media: 'kooper/book-cards', cut: ['right'] },
      { media: 'kooper/daily-challenges' },
      { media: 'kooper/joystick' },
      { media: 'kooper/level-up' },
    ],
  },
  {
    slug: 'getcv',
    name: 'GetCV',
    headline: PLACEHOLDER_HEADLINE,
    logo: { src: '/logos/getcv.svg', width: 128, height: 30 },
    assets: [
      { media: 'getcv/phone' },
      { media: 'getcv/basic-info' },
      { media: 'getcv/note' },
      { media: 'getcv/stats' },
      { media: 'getcv/illustration', cut: ['right'] },
    ],
  },
];

for (const work of works) {
  if (RESERVED_SLUGS.has(work.slug)) throw new Error(`"${work.slug}" is reserved and cannot name a Work`);
}

export function textureFor(key: keyof typeof media): TextureRef {
  const entry = media[key];
  return { key, src: entry.src, half: entry.half, px: entry.px as [number, number] };
}

export function assetsOf(work: Work): Asset[] {
  return work.assets.map((def, i) => {
    const texture = textureFor(def.media);
    const [pw, ph] = texture.px;
    const width = def.width ?? pw / 2;
    return {
      id: `${work.slug}:${i}`,
      work,
      texture,
      width,
      height: (width * ph) / pw,
      cut: new Set(def.cut ?? []),
    };
  });
}

export const findWork = (slug: string): Work | undefined => works.find((w) => w.slug === slug);

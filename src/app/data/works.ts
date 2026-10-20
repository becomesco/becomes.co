import media from './media.json';
import type { FileTexture, TextureRef } from '../../graphics/scene/types';
import { noteTexture } from '../note';

/**
 * Edges where the exported media is cut by its source frame. Left/right cuts are
 * pinned off the viewport edge on Home; top/bottom cuts fade out.
 */
export type CutEdge = 'top' | 'right' | 'bottom' | 'left';

export interface MediaAssetDef {
  media: keyof typeof media;
  /** CSS width at the 1440 design size. Defaults to half the source px (2x export). */
  width?: number;
  cut?: readonly CutEdge[];
}

/** A Note: paper and shadow drawn in code, with this copy typed on it. One string per paragraph. */
export interface NoteAssetDef {
  note: readonly string[];
}

export type AssetDef = MediaAssetDef | NoteAssetDef;

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
  /** A Note rather than exported media. */
  note: boolean;
}

export const RESERVED_SLUGS = new Set(['about', 'contact']);

export const works: readonly Work[] = [
  {
    slug: 'bcms',
    name: 'BCMS',
    headline: 'Branded, designed and built a headless CMS thousands of companies run on.',
    url: 'https://thebcms.com',
    logo: { src: '/logos/bcms.svg', width: 32, height: 32 },
    assets: [
      { media: 'bcms/command-bar' },
      { media: 'bcms/code-snippet', cut: ['top'] },
      { media: 'bcms/turn-into-menu', cut: ['bottom', 'right'] },
      { media: 'bcms/properties', cut: ['left'] },
      {
        note: [
          'Strategy, brand, web and product, carried by one team from direction to build, so everything we do supports and informs the otherrr.',
        ],
      },
      { media: 'bcms/edit-template', cut: ['bottom'] },
      { media: 'bcms/frame-12446' },
      { media: 'bcms/group-1220', cut: ['right'] },
    ],
  },
  {
    slug: 'pyure',
    name: 'Pyure',
    headline: 'An eclectic brand, turned into a live, modern website built to keep scaling.',
    logo: { src: '/logos/pyure.svg', width: 103, height: 26 },
    glow: [0.596, 1, 0],
    assets: [
      { media: 'pyure/glass-box' },
      { media: 'pyure/leaf-card' },
      { media: 'pyure/header' },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
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
    headline: 'A mobile app, brought fully to the web. Fast, with every interaction obsessed over.',
    url: 'https://pov.camera',
    logo: { src: '/logos/pov.svg', width: 74.67, height: 24 },
    assets: [
      { media: 'pov/tap-block', width: 300 },
      { media: 'pov/phone-grid', cut: ['bottom'] },
      { media: 'pov/get-started', cut: ['right'] },
      { media: 'pov/prints', width: 520 },
      { media: 'pov/qr-code' },
      { media: 'pov/group-730', cut: ['left'] },
      { media: 'pov/app-clip', cut: ['top'] },
      { media: 'pov/group-670' },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
      { media: 'pov/artwork' },
    ],
  },
  {
    slug: 'milmedic',
    name: 'Milmedic',
    headline: 'A leading ophthalmology clinic, modernised. Bookings went through the roof.',
    logo: { src: '/logos/milmedic.svg', width: 170, height: 76 },
    assets: [
      { media: 'milmedic/group-1222' },
      { media: 'milmedic/photo' },
      { media: 'milmedic/frame-37' },
      { media: 'milmedic/frame-15' },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
    ],
  },
  {
    slug: 'heroic-rankings',
    name: 'Heroic Rankings',
    headline: 'A brand scaled for the web, and a website turned into a truly heroic experience.',
    url: 'https://heroicrankings.com',
    logo: { src: '/logos/heroic-rankings.svg', width: 140, height: 40 },
    assets: [
      { media: 'heroic-rankings/statue-card' },
      { media: 'heroic-rankings/laptop', cut: ['left'] },
      { media: 'heroic-rankings/growth' },
      { media: 'heroic-rankings/hand', width: 148, cut: ['top'] },
      { media: 'heroic-rankings/statue', cut: ['right'] },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
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
    headline: 'Playful on the surface, a beast underneath. Branded and built from the ground up.',
    url: 'https://videotoflip.com',
    logo: { src: '/logos/videotoflip.svg', width: 50, height: 37 },
    assets: [
      { media: 'videotoflip/frame-150' },
      { media: 'videotoflip/confetti' },
      { media: 'videotoflip/final' },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
      { media: 'videotoflip/group-3' },
      { media: 'videotoflip/four' },
    ],
  },
  {
    slug: 'basket',
    name: 'Basket',
    headline: 'Ordering healthy snacks, made fun and sophisticated on top of an already fine brand.',
    logo: { src: '/logos/basket.svg', width: 127, height: 40 },
    assets: [
      { media: 'basket/about-photo' },
      { media: 'basket/frame-12446', cut: ['bottom'] },
      { media: 'basket/frame-12447' },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
      { media: 'basket/screen', cut: ['bottom'] },
    ],
  },
  {
    slug: 'kooper',
    name: 'Kooper',
    headline: 'Kids reading more, with carefully crafted AI experiences around books they love.',
    logo: { src: '/logos/kooper.svg', width: 99, height: 25 },
    assets: [
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
      { media: 'kooper/book-cards', cut: ['right'] },
      { media: 'kooper/daily-challenges' },
      { media: 'kooper/joystick' },
      { media: 'kooper/level-up' },
    ],
  },
  {
    slug: 'getcv',
    name: 'GetCV',
    headline: 'A truly human job application tracker, for studios that still care about people.',
    logo: { src: '/logos/getcv.svg', width: 128, height: 30 },
    assets: [
      { media: 'getcv/phone' },
      { media: 'getcv/basic-info' },
      {
        note: [
          'We worked on a system to help clients unify their team photos, at scale.',
          'We did 2 vision tests, that now make 30% of the traffic.',
        ],
      },
      { media: 'getcv/stats' },
      { media: 'getcv/illustration', cut: ['right'] },
    ],
  },
];

for (const work of works) {
  if (RESERVED_SLUGS.has(work.slug)) throw new Error(`"${work.slug}" is reserved and cannot name a Work`);
}

export function textureFor(key: keyof typeof media): FileTexture {
  const entry = media[key];
  return { key, src: entry.src, half: entry.half, px: entry.px as [number, number] };
}

export function assetsOf(work: Work): Asset[] {
  return work.assets.map((def, i) => {
    const file = 'media' in def ? def : null;
    const texture = 'media' in def ? textureFor(def.media) : noteTexture(`${work.slug}/note:${i}`, def.note);
    const [pw, ph] = texture.px;
    const width = file?.width ?? pw / 2;
    return {
      id: `${work.slug}:${i}`,
      work,
      texture,
      width,
      height: (width * ph) / pw,
      cut: new Set(file?.cut ?? []),
      note: !file,
    };
  });
}

export const findWork = (slug: string): Work | undefined => works.find((w) => w.slug === slug);

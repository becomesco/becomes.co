import media from './media.json';
import type { FileTexture, TextureRef } from '../../graphics/scene/types';
import { OTHER_INSET } from '../home/other';
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
  /** Glass frame with inset image, like the Other grid on Home. */
  frame?: boolean;
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
  frame: boolean;
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
      { media: 'bcms/code-editor', width: 420 },
      { media: 'bcms/dashboard', width: 560, frame: true },
      { media: 'bcms/properties-panel', width: 320 },
      { media: 'bcms/upload-dropzone', width: 520 },
      { media: 'bcms/invite-row', width: 480 },
      {
        note: [
          'We branded, designed and built BCMS, a headless CMS.',
          'Web app, docs and thebcms.com all came from one design system. Thousands of companies run content through it.',
        ],
      },
      { media: 'bcms/upload-queue', width: 440 },
      { media: 'bcms/entry-nested', width: 520 },
      { media: 'bcms/code-snippet', width: 560 },
      { media: 'bcms/login', width: 280, frame: true },
      { media: 'bcms/confirm-modal', width: 480 },
      { media: 'bcms/media-grid', width: 520 },
      {
        note: [
          'Editors model templates in the browser. There is no schema file in a repo.',
          'You get 10+ field types, reusable groups, and widgets you can drop into rich text.',
        ],
      },
      { media: 'bcms/shot-marketing', width: 600, frame: true },
      { media: 'bcms/kanban', width: 560, frame: true },
      { media: 'bcms/shot-comments', width: 300, frame: true },
      { media: 'bcms/docs-properties', width: 520 },
      { media: 'bcms/shot-editor', width: 480, frame: true },
      { media: 'bcms/editor-field', width: 480 },
      { media: 'bcms/editor-field-alt', width: 480 },
      { media: 'bcms/shot-docs', width: 560, frame: true },
      { media: 'bcms/brand-glow', width: 420 },
      { media: 'bcms/shot-toolbar', width: 400, frame: true },
      { media: 'bcms/shot-chrome', width: 440, frame: true },
      {
        note: [
          'Clients publish with a media library, nested folders, entry statuses and kanban.',
          'Developers query the API and import TypeScript types that BCMS generates from those templates.',
        ],
      },
      { media: 'bcms/widget-entry', width: 360 },
      { media: 'bcms/inputs-card', width: 360 },
      { media: 'bcms/groups-list', width: 360 },
      { media: 'bcms/media-manager', width: 360 },
      { media: 'bcms/next-integration', width: 360 },
      { media: 'bcms/starter-portfolio', width: 340 },
      { media: 'bcms/starter-jobs', width: 340 },
      { media: 'bcms/starter-recipes', width: 340 },
      { media: 'bcms/starter-shop', width: 340 },
      { media: 'bcms/starter-restaurant', width: 340 },
      { media: 'bcms/starter-podcast', width: 340 },
      {
        note: [
          'We shipped open-source starters for  Next, Nuxt, Astro, Gatsby or Svelte, with the API already wired.',
          'There are finished sites for blogs, shops, job boards, recipes, podcasts...',
        ],
      },
      { media: 'bcms/starter-stack', width: 400 },
      { media: 'bcms/lock', width: 280 },
      { media: 'bcms/history', width: 360 },
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
    logo: { src: '/logos/milmedic.svg', width: 47, height: 76 },
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
    logo: { src: '/logos/heroic-rankings.svg', width: 108.416, height: 30 },
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
      { media: 'videotoflip/sticker-retro', width: 380 },
      { media: 'videotoflip/player', width: 440, cut: ['left'] },
      { media: 'videotoflip/quantity', width: 440 },
      { media: 'videotoflip/wordmark-rainbow', width: 560 },
      { media: 'videotoflip/occasion', width: 360 },
      { media: 'videotoflip/cover-modal', width: 400 },
      { media: 'videotoflip/about', width: 520, cut: ['right'] },
      { media: 'videotoflip/palette', width: 520 },
      { media: 'videotoflip/filmstrip', width: 480 },
      { media: 'videotoflip/v-rainbow', width: 240 },
      { media: 'videotoflip/details', width: 540, cut: ['bottom'] },
      { media: 'videotoflip/corners', width: 400 },
      { media: 'videotoflip/tiktok', width: 460, cut: ['right'] },
      { media: 'videotoflip/hero', width: 520 },
      { media: 'videotoflip/price', width: 340, cut: ['right'] },
      { media: 'videotoflip/qr-card', width: 300 },
      { media: 'videotoflip/order-info', width: 420 },
      { media: 'videotoflip/sticker-yellow', width: 300 },
      { media: 'videotoflip/ready-to-order', width: 560 },
      { media: 'videotoflip/cover-options', width: 440 },
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

/** Media in the Other grid that closes Home. Not Assets: no Work, no View, not clickable. */
export const others: readonly (keyof typeof media)[] = Array.from({ length: 80 }, () => 'other/placeholder');

export function textureFor(key: keyof typeof media): FileTexture {
  const entry = media[key];
  return { key, src: entry.src, half: entry.half, px: entry.px as [number, number] };
}

function assetHeight(width: number, pw: number, ph: number, frame: boolean): number {
  if (!frame) return (width * ph) / pw;
  const inner = width - OTHER_INSET * 2;
  return inner * (ph / pw) + OTHER_INSET * 2;
}

export function assetsOf(work: Work): Asset[] {
  return work.assets.map((def, i) => {
    const file = 'media' in def ? def : null;
    const texture = 'media' in def ? textureFor(def.media) : noteTexture(`${work.slug}/note:${i}`, def.note);
    const [pw, ph] = texture.px;
    const width = file?.width ?? pw / 2;
    const frame = file?.frame ?? false;
    return {
      id: `${work.slug}:${i}`,
      work,
      texture,
      width,
      height: assetHeight(width, pw, ph, frame),
      cut: new Set(file?.cut ?? []),
      frame,
      note: !file,
    };
  });
}

export const findWork = (slug: string): Work | undefined => works.find((w) => w.slug === slug);

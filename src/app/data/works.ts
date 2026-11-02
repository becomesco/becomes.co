import media from './media.json';
import screenMedia from './screens.json';
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

/** A full page from `media/source/<work>/screens/`, shown whole in its own section of the Work View. Not an Asset. */
export interface ScreenDef {
  media: keyof typeof screenMedia;
  /** A tablet screen: sits two to a row on desktop. */
  tablet?: boolean;
}

export interface Work {
  slug: string;
  name: string;
  headline: string;
  /** Plain summary under the headline in the Work View. One string per paragraph. */
  intro: readonly string[];
  /** The "What we did" line under the intro, in order. */
  services: readonly string[];
  url?: string;
  logo: { src: string; width: number; height: number };
  /** Background glow while the Work is in view, sRGB 0-1. */
  glow?: readonly [number, number, number];
  assets: readonly AssetDef[];
  /** In View order, after the clicked Asset. */
  screens: readonly ScreenDef[];
}

/** One strip of a Screen: `top` and `rows` in px of the full page, running into the next strip by its overlap. */
export interface ScreenTile {
  texture: FileTexture;
  top: number;
  rows: number;
}

export interface Screen {
  id: string;
  /** Pixel size of the whole page at 2x. */
  px: readonly [number, number];
  tiles: ScreenTile[];
  tablet: boolean;
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
    intro: [
      'BCMS is a headless CMS. We built the brand, the web app, the docs and thebcms.com on one design system.',
      'Editors model content in the browser, developers query an API with generated TypeScript types, and open-source starters cover the common frameworks.',
    ],
    services: ['Product strategy', 'branding', 'UX/UI design', 'development', 'launch'],
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
          'We shipped open-source starters for Next, Nuxt, Astro, Gatsby or Svelte, with the API already wired.',
          'There are finished sites for blogs, shops, job boards, recipes, podcasts...',
        ],
      },
      { media: 'bcms/starter-stack', width: 400 },
      { media: 'bcms/lock', width: 280 },
      { media: 'bcms/history', width: 360 },
    ],
    screens: [
      { media: 'bcms/screens/dashboard' },
      { media: 'bcms/screens/editor' },
      { media: 'bcms/screens/editor-light' },
      { media: 'bcms/screens/editor-2' },
      { media: 'bcms/screens/media' },
      { media: 'bcms/screens/kanban' },
      { media: 'bcms/screens/comments' },
      { media: 'bcms/screens/reorder' },
      { media: 'bcms/screens/color-picker' },
    ],
  },
  {
    slug: 'pyure',
    name: 'Pyure',
    headline: 'An eclectic brand, turned into a live, modern website built to keep scaling.',
    intro: [
      'Pyure measures the carbon footprint of digital advertising. They had a brand, but not a website that could carry it.',
      'We extended the brand for the web and designed and built a site that explains Measure, the eBadge and the demo, and can grow with the product.',
    ],
    services: ['Creative direction', 'brand extension', 'UX/UI design', 'development', 'launch'],
    url: 'https://pyure.ai',
    logo: { src: '/logos/pyure.svg', width: 103, height: 26 },
    assets: [
      { media: 'pyure/hero-copy', width: 560, frame: true },
      { media: 'pyure/nav-bar', width: 480 },
      { media: 'pyure/headline', width: 400 },
      { media: 'pyure/laptop', width: 480, frame: true },
      {
        note: [
          'We expanded their existing branding for the web, and made the site bold and organic.',
          'That was to help them on their mission to cut carbon from digital advertising, without asking campaigns to perform worse.',
        ],
      },
      { media: 'pyure/glass-loop', width: 520 },
      { media: 'pyure/forest-ring', width: 360, frame: true },
      { media: 'pyure/nav-menu', width: 280 },
      { media: 'pyure/book-demo', width: 520, cut: ['right'] },
      { media: 'pyure/glass-maze', width: 360, frame: true },
      { media: 'pyure/copy-measure', width: 360 },
      { media: 'pyure/glass-terrariums', width: 560, frame: true },
      { media: 'pyure/moss-path', width: 360, frame: true },
      { media: 'pyure/copy-esg', width: 360 },
      {
        note: [
          'Pyure sits between ad performance and CO₂. Brands bring ESG targets into media buying.',
          'Publishers use it to see the footprint of their inventory, then sell greener placements.',
        ],
      },
      { media: 'pyure/glass-ribbon', width: 400 },
      { media: 'pyure/contact-form', width: 400 },
      { media: 'pyure/ribbon-card', width: 320, frame: true },
      { media: 'pyure/mark-glow', width: 600 },
      { media: 'pyure/copy-owners', width: 360 },
      {
        note: [
          'The site has to hold Measure, the eBadge and a demo, without looking like another dashboard.',
          'Glass, moss and type from their brand stay. Just bigger, and built to keep scaling.',
        ],
      },
      { media: 'pyure/nav-glow', width: 480 },
      { media: 'pyure/glass-cylinder', width: 600 },
      { media: 'pyure/moss-rock', width: 400 },
      { media: 'pyure/leaf-icon', width: 160, frame: true },
    ],
    screens: [
      { media: 'pyure/screens/landing' },
      { media: 'pyure/screens/why' },
      { media: 'pyure/screens/why-2' },
      { media: 'pyure/screens/clients' },
      { media: 'pyure/screens/nav' },
      { media: 'pyure/screens/contact' },
    ],
  },
  {
    slug: 'milmedic',
    name: 'Milmedic',
    headline: 'A leading ophthalmology clinic, modernised. Bookings went through the roof.',
    intro: [
      'Milmedic is an ophthalmology clinic. We moved them off an old WordPress site to a new multilingual one, and tidied up their digital branding on the way.',
      'Every service and condition has its own page in each language, with online vision tests and a direct path to booking.',
    ],
    services: ['Digital branding', 'UX/UI design', 'development', 'migration', 'launch'],
    url: 'https://www.milmedic.co.rs/en',
    logo: { src: '/logos/milmedic.svg', width: 47, height: 76 },
    assets: [
      { media: 'milmedic/hero-desktop' },
      { media: 'milmedic/hero-mobile', width: 320, frame: true },
      { media: 'milmedic/menu-mobile', width: 300 },
      { media: 'milmedic/why-choose', width: 600 },
      { media: 'milmedic/icon-eye', width: 120, frame: true },
      {
        note: [
          'We designed and built a multilingual website for Milmedic, an ophthalmology clinic.',
          'It walks patients to the right exam, or to a vision test they can take online. Scheduled appointments went up.',
        ],
      },
      { media: 'milmedic/photo-autorefractor', width: 400 },
      { media: 'milmedic/card-eye-exam', width: 280 },
      { media: 'milmedic/card-laser', width: 280 },
      { media: 'milmedic/test-color', width: 300 },
      { media: 'milmedic/icon-trial-frame', width: 120, frame: true },
      { media: 'milmedic/card-keratoconus' },
      { media: 'milmedic/test-astigmatism', width: 200 },
      {
        note: [
          'Every service and eye condition has its own page, in each language.',
          'Search traffic spiked after launch, and the new site converts several times better than the old one!',
        ],
      },
      { media: 'milmedic/menu-conditions', width: 640 },
      { media: 'milmedic/photo-exam', width: 480, frame: true },
      { media: 'milmedic/card-diagnosed', width: 280 },
      { media: 'milmedic/icon-screen', width: 120, frame: true },
      { media: 'milmedic/test-acuity-result', width: 300 },
      { media: 'milmedic/icon-child', width: 120, frame: true },
      { media: 'milmedic/brand-palette' },
      {
        note: [
          'We helped them migrate off an old WordPress system.',
          'Along the way we shaped up their digital branding.',
        ],
      },
      { media: 'milmedic/menu-services', width: 620 },
      { media: 'milmedic/card-second-opinion', width: 280 },
      { media: 'milmedic/test-astigmatism-pass', width: 200 },
      { media: 'milmedic/icon-report', width: 120, frame: true },
      { media: 'milmedic/icon-tumor', width: 120, frame: true },
    ],
    screens: [
      { media: 'milmedic/screens/home' },
      { media: 'milmedic/screens/exams' },
      { media: 'milmedic/screens/prices' },
      { media: 'milmedic/screens/rle' },
      { media: 'milmedic/screens/about' },
      { media: 'milmedic/screens/team' },
      { media: 'milmedic/screens/contact' },
      { media: 'milmedic/screens/privacy' },
    ],
  },
  {
    slug: 'heroic-rankings',
    name: 'Heroic Rankings',
    headline: 'A brand scaled for the web, and a website turned into a truly heroic experience.',
    intro: [
      'Heroic Rankings is an SEO agency. We unified their brand across pages, cards and campaigns, then designed and built a fast website.',
      'The site is also their test bed: URL structures and pages can move freely for SEO experiments without costing speed.',
    ],
    services: ['Branding', 'UX/UI design', 'development', 'launch'],
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
          'We unified the Heroic Rankings brand, so every page, card and campaign reads as one.',
          'Then we built a fast website, ready to scale in many different directions.',
        ],
      },
      { media: 'heroic-rankings/statue-pair' },
      { media: 'heroic-rankings/hands-growth' },
      { media: 'heroic-rankings/card-support' },
      { media: 'heroic-rankings/chart-rankings', cut: ['bottom'] },
      { media: 'heroic-rankings/badge-nps' },
      { media: 'heroic-rankings/brands', width: 600, frame: true },
      { media: 'heroic-rankings/bust', width: 400 },
      { media: 'heroic-rankings/badge-google', width: 300 },
      {
        note: [
          'For an SEO agency, the site doubles as a lab.',
          'We helped them run a lot of SEO experiments, trying different URL structures and moving pages around freely.',
        ],
      },
      { media: 'heroic-rankings/services-grid', width: 600, frame: true },
      { media: 'heroic-rankings/partner-cloudways', width: 180 },
      { media: 'heroic-rankings/hands-reach', width: 420 },
      { media: 'heroic-rankings/form-partnership', width: 320 },
      { media: 'heroic-rankings/partner-entrepreneur', width: 180 },
      { media: 'heroic-rankings/statue-stats' },
      {
        note: [
          'None of the experiments cost speed or scalability.',
          'The site stays fast, and keeps growing whichever structure wins.',
        ],
      },
      { media: 'heroic-rankings/badge-hubspot', width: 300 },
      { media: 'heroic-rankings/certifications', width: 600, frame: true },
      { media: 'heroic-rankings/partner-envato', width: 180 },
      { media: 'heroic-rankings/hands-raised', width: 420 },
      { media: 'heroic-rankings/partner-serpstat', width: 180 },
    ],
    screens: [
      { media: 'heroic-rankings/screens/home' },
      { media: 'heroic-rankings/screens/seo-tech' },
      { media: 'heroic-rankings/screens/seo-local' },
      { media: 'heroic-rankings/screens/case-affinda' },
      { media: 'heroic-rankings/screens/partnership' },
      { media: 'heroic-rankings/screens/team' },
      { media: 'heroic-rankings/screens/contact' },
    ],
  },
  {
    slug: 'videotoflip',
    name: 'Video to Flip',
    headline: 'Playful on the surface, a beast underneath. Branded and built from the ground up.',
    intro: [
      'Video to Flip turns a short video into a printed flipbook. We took it from idea to launch.',
      'The front is a simple ordering flow. Behind it are video processing tuned for print, order management and email workflows.',
    ],
    services: ['Concept', 'product strategy', 'branding', 'UX/UI design', 'development', 'launch'],
    url: 'https://videotoflip.com',
    logo: { src: '/logos/videotoflip.svg', width: 50, height: 37 },
    assets: [
      { media: 'videotoflip/feature-occasion' },
      { media: 'videotoflip/confetti' },
      { media: 'videotoflip/mark-v' },
      {
        note: [
          'Video to Flip turns a short video into a printed flipbook you can hold.',
          'We branded it playful and warm. Every order is a memory someone wants to keep offline.',
        ],
      },
      { media: 'videotoflip/flipbook-hands', width: 520 },
      { media: 'videotoflip/sticker-blue' },
      { media: 'videotoflip/sticker-retro', width: 380 },
      { media: 'videotoflip/player', width: 440, cut: ['left'] },
      { media: 'videotoflip/quantity', width: 440 },
      { media: 'videotoflip/wordmark-rainbow', width: 560 },
      { media: 'videotoflip/occasion', width: 360 },
      { media: 'videotoflip/cover-modal', width: 400 },
      {
        note: [
          'It looks like a simple, small online tool. Behind the scenes it is a B2C beast.',
          'Email workflows, an order management system and powerful video processing, all built to scale.',
        ],
      },
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
      { media: 'videotoflip/step-upload', width: 360 },
      { media: 'videotoflip/feature-flipbook-maker', width: 420 },
      { media: 'videotoflip/flipbook-fan', width: 480 },
      {
        note: [
          'We optimised every frame for print, so the flipbook in your hands feels as alive as the video.',
          'And from upload to checkout, the site stays fast.',
        ],
      },
      { media: 'videotoflip/use-corporate', width: 300 },
      { media: 'videotoflip/wordmark-stacked', width: 400 },
      { media: 'videotoflip/step-customize', width: 360 },
      { media: 'videotoflip/feature-custom-options', width: 420 },
      { media: 'videotoflip/cover-colors', width: 440 },
      { media: 'videotoflip/flipbook-open', width: 480 },
      { media: 'videotoflip/use-weddings', width: 300 },
      { media: 'videotoflip/step-preview', width: 360 },
      { media: 'videotoflip/feature-digital-mockup', width: 420 },
      { media: 'videotoflip/wordmark-inline', width: 440 },
      { media: 'videotoflip/flipbook-couple', width: 480 },
      { media: 'videotoflip/use-events', width: 300 },
      { media: 'videotoflip/step-order', width: 360 },
      { media: 'videotoflip/feature-print', width: 420 },
    ],
    screens: [
      { media: 'videotoflip/screens/landing' },
      { media: 'videotoflip/screens/create' },
      { media: 'videotoflip/screens/trim' },
      { media: 'videotoflip/screens/cover' },
      { media: 'videotoflip/screens/payment' },
      { media: 'videotoflip/screens/error' },
    ],
  },
  {
    slug: 'basket',
    name: 'Basket',
    headline: 'Ordering healthy snacks, made fun and sophisticated on top of an already fine brand.',
    intro: [
      'Basket sells healthy snacks online. We designed and built their shop on top of the existing brand.',
      'Underneath is a custom order system and a local payment integration, so checkout works the way their customers already pay.',
    ],
    services: ['UX/UI design', 'development', 'payment integration'],
    logo: { src: '/logos/basket.svg', width: 127, height: 40 },
    assets: [
      { media: 'basket/illustration-backpack' },
      { media: 'basket/illustration-mountain', cut: ['bottom'] },
      { media: 'basket/product-card' },
      {
        note: [
          'We gave Basket a modern, powerful website for their healthy snacks.',
          'Playful and familiar, a little nostalgic, and healthy.',
        ],
      },
      { media: 'basket/mobile-product', cut: ['bottom'] },
      { media: 'basket/hero-landscape', width: 640 },
      { media: 'basket/product-pumpkin-bars', width: 360 },
      { media: 'basket/illustration-baking' },
      { media: 'basket/cart-desktop', width: 600, frame: true },
      { media: 'basket/product-hazelnut', width: 360 },
      { media: 'basket/illustration-village', width: 360 },
      { media: 'basket/cart-mobile', width: 300 },
      {
        note: [
          'Underneath is a custom solution.',
          'Basket manages every order in one place, and stays in touch with its customers.',
        ],
      },
      { media: 'basket/illustration-ingredients', width: 480 },
      { media: 'basket/product-crackers', width: 360 },
      { media: 'basket/shop-grid', width: 440, frame: true },
      { media: 'basket/illustration-boat', width: 400 },
      { media: 'basket/illustration-winter', width: 360 },
      { media: 'basket/product-apple-flour', width: 360 },
      {
        note: [
          'We integrated a local payment system, so checkout works the way customers already pay.',
          'Snacks in the basket, a few taps, done.',
        ],
      },
      { media: 'basket/illustration-picnic' },
      { media: 'basket/product-page', width: 600, frame: true },
      { media: 'basket/illustration-slope', width: 600 },
    ],
    screens: [
      { media: 'basket/screens/home' },
      { media: 'basket/screens/product' },
      { media: 'basket/screens/cart' },
      { media: 'basket/screens/checkout' },
      { media: 'basket/screens/about' },
    ],
  },
  {
    slug: 'kooper',
    name: 'Kooper',
    headline: 'Kids reading more, with carefully crafted AI experiences around books they love.',
    intro: [
      'Kooper is a reading app for kids, on web and tablet. It started as our own question: what if books played like a game?',
      'AI is built around each story and stays inside the book. Daily challenges, levels and badges turn chapters into progress.',
    ],
    services: ['Concept', 'product strategy', 'UX/UI design', 'development'],
    logo: { src: '/logos/kooper.svg', width: 99, height: 25 },
    assets: [
      { media: 'kooper/book-cards', cut: ['right'] },
      { media: 'kooper/daily-challenges' },
      { media: 'kooper/joystick' },
      {
        note: [
          'We started with a question: what if books were an immersive, gamified experience?',
          'Kooper is our answer, on web and tablet.',
        ],
      },
      { media: 'kooper/level-up', width: 400 },
      { media: 'kooper/tablet-reader', width: 360, frame: true },
      { media: 'kooper/book-girl-who-said-no', width: 280 },
      { media: 'kooper/badge-chapters', width: 400 },
      { media: 'kooper/illustration-sack', width: 200 },
      { media: 'kooper/book-shelf', width: 600 },
      {
        note: [
          'Kids read and explore the books they love, with AI built around each story.',
          'It stays inside the book, in an environment that is safe for kids and parents.',
        ],
      },
      { media: 'kooper/tablet-quiz-start', width: 360, frame: true },
      { media: 'kooper/continue-reading', width: 320 },
      { media: 'kooper/badge-reader', width: 400 },
      { media: 'kooper/book-wild-child', width: 220 },
      { media: 'kooper/top-bar', width: 480 },
      { media: 'kooper/tablet-reader-dark', width: 360, frame: true },
      { media: 'kooper/menu-profile' },
      { media: 'kooper/badge-speed-reader', width: 400 },
      {
        note: [
          'Daily challenges, levels and badges turn chapters into progress.',
          'So kids come back for the next page, as it\'s a next game ;)',
        ],
      },
      { media: 'kooper/book-big-bed', width: 220 },
      { media: 'kooper/browse-books', width: 240 },
      { media: 'kooper/tablet-quiz-question', width: 360, frame: true },
      { media: 'kooper/book-grid', width: 440 },
      { media: 'kooper/badge-linguist', width: 400 },
      { media: 'kooper/tab-bar' },
      { media: 'kooper/book-to-the-sea', width: 220 },
      { media: 'kooper/tablet-review', width: 360, frame: true },
      { media: 'kooper/tablet-end-dark', width: 360, frame: true },
    ],
    screens: [
      { media: 'kooper/screens/join' },
      { media: 'kooper/screens/loading' },
      { media: 'kooper/screens/books' },
      { media: 'kooper/screens/dashboard', tablet: true },
      { media: 'kooper/screens/browse', tablet: true },
      { media: 'kooper/screens/reader', tablet: true },
      { media: 'kooper/screens/tooltip', tablet: true },
      { media: 'kooper/screens/type-size', tablet: true },
      { media: 'kooper/screens/dictionary', tablet: true },
      { media: 'kooper/screens/bookmark', tablet: true },
      { media: 'kooper/screens/quiz', tablet: true },
      { media: 'kooper/screens/reader-end', tablet: true },
      { media: 'kooper/screens/reader-end-2', tablet: true },
      { media: 'kooper/screens/confirm' },
    ],
  },
  {
    slug: 'getcv',
    name: 'GetCV',
    headline: 'A truly human job application tracker, for studios that still care about people.',
    intro: [
      'GetCV is a hiring app for agencies and studios. We designed and built it, from job posts to candidate review.',
      'Teams write their own questions, candidates answer as themselves, and both sides can see where things stand.',
    ],
    services: ['Product strategy', 'branding', 'UX/UI design', 'development'],
    url: 'https://getcv.io',
    logo: { src: '/logos/getcv.svg', width: 128, height: 30 },
    assets: [
      { media: 'getcv/phone' },
      { media: 'getcv/basic-info' },
      {
        note: [
          'GetCV is a warm, familiar hiring app for agencies and studios.',
          'They hire in a way that fits what they believe in, not through some cold corporate form.',
        ],
      },
      { media: 'getcv/stats' },
      { media: 'getcv/illustration', cut: ['right'] },
      { media: 'getcv/dashboard', width: 560, frame: true },
      { media: 'getcv/mobile-login', width: 280 },
      { media: 'getcv/stat-jobs' },
      { media: 'getcv/illustration-couple', width: 320 },
      { media: 'getcv/job-description', width: 520, frame: true },
      { media: 'getcv/greeting', width: 280 },
      { media: 'getcv/team-grid', width: 400 },
      { media: 'getcv/mobile-verification', width: 280 },
      { media: 'getcv/application-preview', width: 520, frame: true },
      { media: 'getcv/stat-candidates' },
      { media: 'getcv/illustration-hand', width: 320 },
      { media: 'getcv/job-questions', width: 520, frame: true },
      {
        note: [
          'The goal is to really meet the candidate, not just read a CV.',
          'Studios ask their own questions, and candidates get to answer as themselves.',
        ],
      },
      { media: 'getcv/summary-copy', width: 420 },
      { media: 'getcv/mobile-dashboard', width: 280 },
      { media: 'getcv/job-list', width: 440 },
      { media: 'getcv/invite-modal', width: 520, frame: true },
      { media: 'getcv/stat-filled' },
      { media: 'getcv/illustration-card', width: 320 },
      { media: 'getcv/job-candidate-prompt', width: 520, frame: true },
      { media: 'getcv/mobile-forgot-password', width: 280 },
      {
        note: [
          'Safe, playful and honest, on both sides of the table.',
          'Candidates know where they stand, and teams know who they are talking to.',
        ],
      },
      { media: 'getcv/sign-off', width: 360 },
      { media: 'getcv/job-preview', width: 560, frame: true },
      { media: 'getcv/mobile-menu', width: 280 },
      { media: 'getcv/job-created', width: 520, frame: true },
    ],
    screens: [
      { media: 'getcv/screens/dashboard' },
      { media: 'getcv/screens/team' },
      { media: 'getcv/screens/profile' },
      { media: 'getcv/screens/invite' },
      { media: 'getcv/screens/job-start' },
      { media: 'getcv/screens/job-dept' },
      { media: 'getcv/screens/job-format' },
      { media: 'getcv/screens/job-sidebar' },
      { media: 'getcv/screens/job-sidebar-2' },
      { media: 'getcv/screens/job-questions' },
      { media: 'getcv/screens/job-prompt' },
      { media: 'getcv/screens/job-preview' },
      { media: 'getcv/screens/job-preview-light' },
      { media: 'getcv/screens/job-created' },
      { media: 'getcv/screens/thanks' },
    ],
  },
];

for (const work of works) {
  if (RESERVED_SLUGS.has(work.slug)) throw new Error(`"${work.slug}" is reserved and cannot name a Work`);
}

/** Media in the Other grid that closes Home. Not Assets: no Work, no View, not clickable. */
export const others: readonly (keyof typeof media)[] = [
  'other/happening-hero',
  'other/natuera-hero',
  'other/axilis-hero',
  'other/workgeist-paradox',
  'other/closet-home',
  'other/saturized-hero',
  'other/natuera-card-oil',
  'other/happening-stereotypes',
  'other/axilis-big-leagues',
  'other/workgeist-reports',
  'other/closet-swipe',
  'other/portfolio-grid',
  'other/natuera-shop',
  'other/happening-scale',
  'other/workgeist-time',
  'other/axilis-office',
  'other/closet-pair-card',
  'other/natuera-harmony',
  'other/happening-search',
  'other/workgeist-report-card',
  'other/axilis-team',
  'other/portfolio-cards',
  'other/closet-catalog',
  'other/natuera-plant-based',
  'other/happening-job',
  'other/workgeist-portraits',
  'other/axilis-locations',
  'other/natuera-card-rub',
  'other/closet-brands',
  'other/happening-stories',
  'other/saturized-404',
  'other/workgeist-killing-time',
  'other/natuera-product',
  'other/axilis-team-spirit',
  'other/closet-swipe-pair',
  'other/happening-dna',
  'other/workgeist-subscribe',
  'other/portfolio-case',
  'other/natuera-newsletter',
  'other/axilis-blog',
  'other/workgeist-buttons',
  'other/happening-team',
  'other/closet-item-details',
  'other/natuera-cart',
  'other/workgeist-pattern',
  'other/happening-remote',
  'other/natuera-cart-modal',
  'other/workgeist-shapes',
];

/** A client logo: listed on About and scattered through the Other grid. */
export interface Client {
  name: string;
  src: string;
  /** SVG viewBox size. */
  width: number;
  height: number;
  /**
   * Height on About at the 1440 design size, CSS px, set from each logo's aspect and ink
   * coverage so they all carry about the same weight. About paints this list; index.html keeps
   * the same order for the first paint and for no-JS.
   */
  size: number;
  /** Fixed place among the logos in Home's Other grid, 0 first. The rest fill the gaps in a new order each visit. */
  slot?: number;
}

export const clients: readonly Client[] = [
  { name: 'Coca-Cola', src: '/clients/coca-cola.svg', width: 2443, height: 800, size: 23, slot: 1 },
  { name: 'HBO', src: '/clients/hbo.svg', width: 1874, height: 800, size: 22 },
  { name: 'Kobil', src: '/clients/kobil.svg', width: 2560, height: 800, size: 25 },
  { name: 'NASA', src: '/clients/nasa.svg', width: 2871, height: 800, size: 19 },
  { name: 'National Geographic', src: '/clients/national-geographic.svg', width: 2723, height: 800, size: 23 },
  { name: 'Pornhub', src: '/clients/pornhub.svg', width: 2499, height: 700, size: 20, slot: 5 },
  { name: 'Red Bull', src: '/clients/redbull.svg', width: 1315, height: 800, size: 30 },
  { name: 'Warner Bros.', src: '/clients/warner-bros.svg', width: 658, height: 800, size: 36 },
  { name: 'Netflix', src: '/clients/netflix.svg', width: 2961, height: 800, size: 20, slot: 0 },
  { name: 'The Collective', src: '/clients/the-collective.svg', width: 2734, height: 800, size: 23 },
];

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

export function screensOf(work: Work): Screen[] {
  return work.screens.map((def) => {
    const entry = screenMedia[def.media];
    const tiles = entry.tiles.map((tile, k) => ({
      texture: { key: `${def.media}:${k}`, src: tile.src, half: tile.half, px: tile.px as [number, number] },
      top: tile.top,
      rows: tile.px[1],
    }));
    return { id: def.media, px: entry.px as [number, number], tiles, tablet: def.tablet ?? false };
  });
}

export const findWork = (slug: string): Work | undefined => works.find((w) => w.slug === slug);

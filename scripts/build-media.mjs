// Builds delivery media from media/source/<group>/<name>.(png|jpg).
// Output: public/media/<group>/<name>.webp (source resolution up to MAX_EDGE, treated as 2x)
//         public/media/<group>/<name>.half.webp (1x)
//         src/app/data/media.json (pixel sizes and URLs keyed "<group>/<name>")
// Screens in media/source/<group>/screens/ go to public/media/<group>/screens/<name>.<tile>(.half).webp,
// listed in src/app/data/screens.json keyed "<group>/screens/<name>".
import { readdir, mkdir, rm, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const sourceDir = join(root, 'media/source');
const outDir = join(root, 'public/media');
const manifestPath = join(root, 'src/app/data/media.json');

/** Longest edge of the 2x file, px. Larger sources are downscaled; nothing on screen needs more. */
const MAX_EDGE = 2048;

// Early Figma exports were flattened onto the frame background. For those, recover alpha
// for the background region: flood from the border through near-background colors, then
// un-composite those pixels against the background.
// Pixels the flood cannot reach stay opaque, so photo interiors keep their color.
// Only the files listed here are matted; newer exports carry their own alpha, and opaque
// screenshots and photos must stay whole.
const BACKGROUND = [228, 226, 220];
const FLOOD_DISTANCE = 26;
const MATTE = new Set([
  'basket/illustration-backpack',
  'basket/illustration-mountain',
  'basket/mobile-product',
  'basket/product-card',
  'getcv/basic-info',
  'getcv/illustration',
  'getcv/phone',
  'getcv/stats',
  'heroic-rankings/badge-nps',
  'heroic-rankings/card-support',
  'heroic-rankings/chart-rankings',
  'heroic-rankings/growth',
  'heroic-rankings/hands-growth',
  'heroic-rankings/laptop',
  'heroic-rankings/statue-card',
  'heroic-rankings/statue-pair',
  'kooper/book-cards',
  'kooper/daily-challenges',
  'kooper/joystick',
  'milmedic/card-keratoconus',
  'milmedic/hero-desktop',
  'videotoflip/confetti',
  'videotoflip/feature-occasion',
  'videotoflip/sticker-blue',
]);
// Matted at their own flood distance. Infinity un-composites every pixel (pure glass on beige);
// a smaller value keeps light photo edges from being treated as background.
const MATTE_OVERRIDES = {
  'brand/glass-mark': Infinity,
  'heroic-rankings/statue': 10,
};

async function matte(input, floodDistance) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height } = info;
  const count = width * height;
  for (let i = 0; i < count; i++) if (data[i * 4 + 3] < 255) return null;

  const distance = (i) => {
    const o = i * 4;
    const dr = data[o] - BACKGROUND[0];
    const dg = data[o + 1] - BACKGROUND[1];
    const db = data[o + 2] - BACKGROUND[2];
    return Math.sqrt(dr * dr + dg * dg + db * db);
  };

  const reached = new Uint8Array(count);
  const queue = new Int32Array(count);
  let head = 0;
  let tail = 0;
  const push = (i) => {
    if (reached[i] || distance(i) > floodDistance) return;
    reached[i] = 1;
    queue[tail++] = i;
  };
  for (let x = 0; x < width; x++) {
    push(x);
    push((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    push(y * width);
    push(y * width + width - 1);
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % width;
    if (x > 0) push(i - 1);
    if (x < width - 1) push(i + 1);
    if (i >= width) push(i - width);
    if (i < count - width) push(i + width);
  }

  for (let i = 0; i < count; i++) {
    if (!reached[i]) continue;
    const o = i * 4;
    let alpha = 0;
    for (let c = 0; c < 3; c++) {
      const p = data[o + c];
      const b = BACKGROUND[c];
      const a = p > b ? (p - b) / (255 - b) : (b - p) / b;
      if (a > alpha) alpha = a;
    }
    if (alpha <= 1 / 255) {
      data[o] = BACKGROUND[0];
      data[o + 1] = BACKGROUND[1];
      data[o + 2] = BACKGROUND[2];
      data[o + 3] = 0;
      continue;
    }
    for (let c = 0; c < 3; c++) {
      const b = BACKGROUND[c];
      data[o + c] = Math.max(0, Math.min(255, Math.round(b + (data[o + c] - b) / alpha)));
    }
    data[o + 3] = Math.round(alpha * 255);
  }
  return sharp(data, { raw: { width, height, channels: 4 } });
}

// Full-page screens from media/source/<group>/screens/, shown whole in a Work View. Wider than
// MAX_EDGE so they stay sharp at full width. Pages run far taller than a GPU texture can be,
// so each one is cut into strips of TILE_ROWS, each running TILE_OVERLAP rows into the next
// so the strips meet without a seam.
const SCREENS = 'screens';
const SCREEN_WIDTH = 2304;
const TILE_ROWS = 4096;
const TILE_OVERLAP = 8;
const screensPath = join(root, 'src/app/data/screens.json');

const manifest = {};
const screens = {};
const SKIP_GROUPS = new Set(['pov']);
const groups = (await readdir(sourceDir, { withFileTypes: true })).filter((d) => d.isDirectory() && !SKIP_GROUPS.has(d.name));
const webp = { quality: 84, alphaQuality: 92, effort: 5, smartSubsample: true };

async function build(dir) {
  const entries = await readdir(join(sourceDir, dir), { withFileTypes: true });
  const files = entries.filter((f) => f.isFile() && /\.(png|jpe?g)$/i.test(f.name)).map((f) => f.name).sort();
  await mkdir(join(outDir, dir), { recursive: true });

  for (const file of files) {
    const name = basename(file, extname(file));
    const input = join(sourceDir, dir, file);
    const meta = await sharp(input).metadata();
    const scale = Math.min(1, MAX_EDGE / Math.max(meta.width, meta.height));
    const width = Math.round(meta.width * scale);
    const height = Math.round(meta.height * scale);
    const matteKey = `${dir}/${name}`;
    const flood = MATTE_OVERRIDES[matteKey] ?? (MATTE.has(matteKey) ? FLOOD_DISTANCE : null);
    const matted = /\.png$/i.test(file) && flood !== null ? await matte(input, flood) : null;
    const source = matted ? await matted.png().toBuffer() : input;
    const hasAlpha = Boolean(matted) || meta.hasAlpha;

    const fullName = `${name}.webp`;
    const halfName = `${name}.half.webp`;
    const full = sharp(source);
    if (scale < 1) full.resize(width, height, { kernel: 'lanczos3' });
    await full.webp(webp).toFile(join(outDir, dir, fullName));
    await sharp(source)
      .resize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)), { kernel: 'lanczos3' })
      .webp(webp)
      .toFile(join(outDir, dir, halfName));

    manifest[`${dir}/${name}`] = {
      px: [width, height],
      alpha: hasAlpha,
      src: `/media/${dir}/${fullName}`,
      half: `/media/${dir}/${halfName}`,
    };
    console.log(`${dir}/${name} ${width}x${height}`);
  }
  if (entries.some((e) => e.isDirectory() && e.name === SCREENS)) await buildScreens(`${dir}/${SCREENS}`);
}

/** `input` at `width` px wide, decoded to raw pixels. */
async function decodeAt(input, width) {
  const { data, info } = await sharp(input).resize(width, null, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true });
  return { data, raw: { width: info.width, height: info.height, channels: info.channels } };
}

async function buildScreens(dir) {
  const files = (await readdir(join(sourceDir, dir))).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  await rm(join(outDir, dir), { recursive: true, force: true });
  await mkdir(join(outDir, dir), { recursive: true });

  for (const file of files) {
    const name = basename(file, extname(file));
    const input = join(sourceDir, dir, file);
    const meta = await sharp(input).metadata();
    const full = await decodeAt(input, Math.min(SCREEN_WIDTH, meta.width));
    const half = await decodeAt(input, Math.round(full.raw.width / 2));
    const { width, height } = full.raw;

    const tiles = [];
    for (let top = 0; top < height; top += TILE_ROWS) {
      const rows = Math.min(TILE_ROWS + TILE_OVERLAP, height - top);
      const halfTop = Math.round(top / 2);
      const halfRows = Math.min(Math.round(rows / 2), half.raw.height - halfTop);
      const k = tiles.length;
      await sharp(full.data, { raw: full.raw })
        .extract({ left: 0, top, width, height: rows })
        .webp(webp)
        .toFile(join(outDir, dir, `${name}.${k}.webp`));
      await sharp(half.data, { raw: half.raw })
        .extract({ left: 0, top: halfTop, width: half.raw.width, height: halfRows })
        .webp(webp)
        .toFile(join(outDir, dir, `${name}.${k}.half.webp`));
      tiles.push({ top, px: [width, rows], src: `/media/${dir}/${name}.${k}.webp`, half: `/media/${dir}/${name}.${k}.half.webp` });
    }
    screens[`${dir}/${name}`] = { px: [width, height], tiles };
    console.log(`${dir}/${name} ${width}x${height}, ${tiles.length} tiles`);
  }
}

for (const group of groups) await build(group.name);

await mkdir(join(root, 'src/app/data'), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
await writeFile(screensPath, `${JSON.stringify(screens, null, 2)}\n`);
console.log(`\n${Object.keys(manifest).length} entries -> ${manifestPath}`);
console.log(`${Object.keys(screens).length} screens -> ${screensPath}`);

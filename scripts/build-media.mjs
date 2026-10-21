// Builds delivery media from media/source/<group>/<name>.(png|jpg).
// Output: public/media/<group>/<name>.webp (source resolution, treated as 2x)
//         public/media/<group>/<name>.half.webp (1x)
//         src/app/data/media.json (pixel sizes and URLs keyed "<group>/<name>")
import { readdir, mkdir, writeFile } from 'node:fs/promises';
import { join, extname, basename } from 'node:path';
import sharp from 'sharp';

const root = new URL('..', import.meta.url).pathname;
const sourceDir = join(root, 'media/source');
const outDir = join(root, 'public/media');
const manifestPath = join(root, 'src/app/data/media.json');

// Figma exports are flattened onto the frame background. Recover alpha for the
// background region: flood from the border through near-background colors, then
// un-composite those pixels against the background.
// Pixels the flood cannot reach stay opaque, so photo interiors keep their color.
const BACKGROUND = [228, 226, 220];
const FLOOD_DISTANCE = 26;
// Per-file flood distance. Infinity un-composites every pixel (pure glass on beige);
// a smaller value keeps light photo edges from being treated as background.
const MATTE_OVERRIDES = {
  'brand/glass-mark': Infinity,
  'milmedic/photo': 10,
  'heroic-rankings/statue': 10,
};

/** Skip beige rematte for whole groups (exports keep their own alpha). */
const SKIP_MATTE_GROUPS = new Set(['bcms', 'pyure']);

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

const manifest = {};
const groups = (await readdir(sourceDir, { withFileTypes: true })).filter((d) => d.isDirectory());

for (const group of groups) {
  const files = (await readdir(join(sourceDir, group.name))).filter((f) => /\.(png|jpe?g)$/i.test(f)).sort();
  await mkdir(join(outDir, group.name), { recursive: true });

  for (const file of files) {
    const name = basename(file, extname(file));
    const input = join(sourceDir, group.name, file);
    const { width, height } = await sharp(input).metadata();
    const matteKey = `${group.name}/${name}`;
    const skipMatte = SKIP_MATTE_GROUPS.has(group.name);
    const matted =
      /\.png$/i.test(file) && !skipMatte ? await matte(input, MATTE_OVERRIDES[matteKey] ?? FLOOD_DISTANCE) : null;
    const source = matted ? await matted.png().toBuffer() : input;
    const hasAlpha = Boolean(matted) || (await sharp(input).metadata()).hasAlpha;
    const webp = { quality: 84, alphaQuality: 92, effort: 5, smartSubsample: true };

    const fullName = `${name}.webp`;
    const halfName = `${name}.half.webp`;
    await sharp(source).webp(webp).toFile(join(outDir, group.name, fullName));
    await sharp(source)
      .resize(Math.max(1, Math.round(width / 2)), Math.max(1, Math.round(height / 2)), { kernel: 'lanczos3' })
      .webp(webp)
      .toFile(join(outDir, group.name, halfName));

    manifest[`${group.name}/${name}`] = {
      px: [width, height],
      alpha: hasAlpha,
      src: `/media/${group.name}/${fullName}`,
      half: `/media/${group.name}/${halfName}`,
    };
    console.log(`${group.name}/${name} ${width}x${height}`);
  }
}

await mkdir(join(root, 'src/app/data'), { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`\n${Object.keys(manifest).length} entries -> ${manifestPath}`);

// Records the landing manifesto with the Glass mark turning once, into public/og.mp4 and public/og.jpg.
// Needs Chrome (WebGPU), ffmpeg, and a running `vite` or it starts one.
import { execFile, spawn } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { chromium } from 'playwright';
import sharp from 'sharp';

if (!process.env.PLAYWRIGHT_BROWSERS_PATH) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = join(tmpdir(), 'pw-browsers');
}

const run = promisify(execFile);
const root = new URL('..', import.meta.url).pathname;
const WIDTH = 1200;
const HEIGHT = 630;
const FPS = 30;
const TURN = 8;
const FRAMES = TURN * FPS;
const ORIGIN = process.env.OG_ORIGIN ?? 'http://127.0.0.1:5173';

async function waitFor(url, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function ensureDev() {
  try {
    const res = await fetch(ORIGIN);
    if (res.ok) return null;
  } catch {
    /* start vite */
  }
  const child = spawn('pnpm', ['dev', '--host', '127.0.0.1', '--port', '5173'], {
    cwd: root,
    stdio: 'inherit',
  });
  await waitFor(ORIGIN);
  return child;
}

const vite = await ensureDev();
const framesDir = join(tmpdir(), `becomes-og-${Date.now()}`);
await mkdir(framesDir, { recursive: true });

const browser = await chromium.launch({
  channel: 'chrome',
  headless: false,
  args: ['--use-angle=metal'],
});

try {
  const page = await browser.newPage({
    viewport: { width: WIDTH, height: HEIGHT },
    deviceScaleFactor: 2,
  });
  await page.goto(`${ORIGIN}/?og`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__og?.ready, null, { timeout: 30000 });
  // One more turn of the loop so the manifesto mask is on the Glass mark.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));

  for (let i = 0; i < FRAMES; i++) {
    const time = i / FPS;
    await page.evaluate(async (t) => {
      window.__og.seek(t);
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }, time);
    await page.screenshot({
      path: join(framesDir, `${String(i).padStart(4, '0')}.png`),
      type: 'png',
      animations: 'disabled',
    });
    if (i % 30 === 0) console.log(`og ${i}/${FRAMES}`);
  }

  const mp4 = join(root, 'public/og.mp4');
  const jpg = join(root, 'public/og.jpg');
  await run('ffmpeg', [
    '-y',
    '-framerate',
    String(FPS),
    '-i',
    join(framesDir, '%04d.png'),
    '-vf',
    `scale=${WIDTH}:${HEIGHT}`,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-crf',
    '16',
    '-tune',
    'animation',
    '-movflags',
    '+faststart',
    mp4,
  ]);
  await sharp(join(framesDir, '0000.png')).resize(WIDTH, HEIGHT).jpeg({ quality: 88 }).toFile(jpg);
  console.log(`wrote ${mp4} and ${jpg}`);
} finally {
  await browser.close();
  await rm(framesDir, { recursive: true, force: true });
  vite?.kill();
}

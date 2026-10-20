// Converts the licensed Grillmaster TTF cuts the design uses into woff2.
// Usage: pnpm fonts [path/to/Grillmaster/TTF]
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import wawoff2 from 'wawoff2';

const source = process.argv[2] ?? join(homedir(), 'Downloads/Grillmaster/TTF');
const out = new URL('../public/fonts/', import.meta.url);

const cuts = [
  ['Grillmaster ExtWide 004 Regular.ttf', 'grillmaster-extwide-regular.woff2'],
  ['Grillmaster ExtWide 005 Medium.ttf', 'grillmaster-extwide-medium.woff2'],
  ['Grillmaster Wide 004 Regular.ttf', 'grillmaster-wide-regular.woff2'],
];

await mkdir(out, { recursive: true });
for (const [ttf, woff2] of cuts) {
  const bytes = await readFile(join(source, ttf));
  const compressed = await wawoff2.compress(bytes);
  await writeFile(new URL(woff2, out), compressed);
  console.log(`${woff2}  ${(compressed.length / 1024).toFixed(1)} KB`);
}

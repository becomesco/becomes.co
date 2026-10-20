import type { Grid } from './grid';

/**
 * The Other grid closing Home, in scroll space.
 *
 * Its title pins at the viewport center like a Work title while the grid rises from the
 * bottom of the screen. Once the grid reaches the title, at scroll `follow`, the two
 * scroll on together; at `max` the grid's last row sits a margin above the bottom.
 */

/** Frame around each image, CSS px at every size: corner radius, image inset (border and padding), image radius. */
export const OTHER_RADIUS = 17;
export const OTHER_INSET = 7;
export const OTHER_IMAGE_RADIUS = 9;

/** Space between the title and the grid, in gutters. */
const TITLE_GAP = 3;

export interface OtherCell {
  /** Frame rect; `y` from the grid's top. */
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface OtherLayout {
  follow: number;
  /** Screen y of the grid's top at `follow`. */
  top: number;
  cells: OtherCell[];
  max: number;
}

function columnsFor(grid: Grid): number {
  if (grid.columns >= 12) return 5;
  if (grid.columns >= 10) return 4;
  if (grid.columns >= 8) return 3;
  return 2;
}

/**
 * `p0` is where the title pins, `titleHeight` its height about the viewport center, and
 * `aspects` each piece's height over width. Frames share a width; rows take their tallest.
 */
export function computeOther(
  grid: Grid,
  vh: number,
  p0: number,
  titleHeight: number,
  aspects: readonly number[],
): OtherLayout {
  const columns = columnsFor(grid);
  const w = (grid.width - grid.margin * 2 - grid.gutter * (columns - 1)) / columns;
  const cells: OtherCell[] = [];
  let y = 0;
  for (let row = 0; row * columns < aspects.length; row++) {
    const slice = aspects.slice(row * columns, (row + 1) * columns);
    const heights = slice.map((a) => (w - OTHER_INSET * 2) * a + OTHER_INSET * 2);
    slice.forEach((_, i) => cells.push({ x: grid.margin + i * (w + grid.gutter), y, w, h: heights[i] }));
    y += Math.max(...heights) + grid.gutter;
  }
  const height = Math.max(0, y - grid.gutter);

  const top = vh / 2 + titleHeight / 2 + grid.gutter * TITLE_GAP;
  // The grid's top crosses the bottom of the screen as the title pins.
  const follow = p0 + Math.max(0, vh - top);
  return { follow, top, cells, max: follow + Math.max(0, top + height + grid.margin - vh) };
}

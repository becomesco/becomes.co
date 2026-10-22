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
/** A client logo's slot, as height over width like a piece's image. */
const LOGO_SLOT = 0.5;
/** Pieces a column takes between two of its logos, so they never read as one hole. */
const LOGO_COLUMN_GAP = 3;
/** Least distance between the centers of logos in neighbouring columns, in column widths, so none sit side by side. */
const LOGO_NEIGHBOUR_GAP = 1.25;
/** Rows at the end of the grid left out when spacing logos along it. */
const LOGO_TAIL = 2;

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
  /** Client logo slots, in the order of `logos`. */
  logos: OtherCell[];
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
 * `aspects` each piece's height over width. Masonry: frames share a width and each one
 * goes under the shortest column, leftmost on a tie, so pieces keep their own heights.
 *
 * `logos` holds one value in [0, 1) per client logo: where in its equal share of the
 * pieces it drops in. A logo that would land too close to another, by LOGO_COLUMN_GAP in
 * its column or LOGO_NEIGHBOUR_GAP beside it, waits for the next piece.
 */
export function computeOther(
  grid: Grid,
  vh: number,
  p0: number,
  titleHeight: number,
  aspects: readonly number[],
  logos: readonly number[] = [],
): OtherLayout {
  const columns = columnsFor(grid);
  const w = (grid.width - grid.margin * 2 - grid.gutter * (columns - 1)) / columns;
  const bottoms = new Array<number>(columns).fill(0);
  const shortest = (): number => bottoms.indexOf(Math.min(...bottoms));
  const heightOf = (a: number): number => (w - OTHER_INSET * 2) * a + OTHER_INSET * 2;
  /** Pieces placed in each column since its last logo. */
  const sinceLogo = new Array<number>(columns).fill(Infinity);
  const place = (a: number): OtherCell => {
    const column = shortest();
    const h = heightOf(a);
    const cell = { x: grid.margin + column * (w + grid.gutter), y: bottoms[column], w, h };
    bottoms[column] += h + grid.gutter;
    sinceLogo[column]++;
    return cell;
  };

  // Short of the end by a few rows, so a logo that has to wait still finds room.
  const share = Math.max(0, aspects.length - columns * LOGO_TAIL) / Math.max(1, logos.length);
  const logoCells: { cell: OtherCell; column: number }[] = [];
  const logoFits = (): boolean => {
    const column = shortest();
    if (sinceLogo[column] < LOGO_COLUMN_GAP) return false;
    const center = bottoms[column] + heightOf(LOGO_SLOT) / 2;
    return logoCells.every(
      (l) => Math.abs(l.column - column) !== 1 || Math.abs(l.cell.y + l.cell.h / 2 - center) >= w * LOGO_NEIGHBOUR_GAP,
    );
  };
  const placeLogos = (index: number, last: boolean): void => {
    while (logoCells.length < logos.length) {
      const k = logoCells.length;
      if (!last && (index < Math.max(1, Math.floor((k + logos[k]) * share)) || !logoFits())) return;
      const column = shortest();
      logoCells.push({ cell: place(LOGO_SLOT), column });
      sinceLogo[column] = 0;
    }
  };
  const cells: OtherCell[] = aspects.map((a, i) => {
    placeLogos(i, false);
    return place(a);
  });
  placeLogos(aspects.length, true);
  const height = Math.max(0, Math.max(...bottoms) - grid.gutter);

  const top = vh / 2 + titleHeight / 2 + grid.gutter * TITLE_GAP;
  // The grid's top crosses the bottom of the screen as the title pins.
  const follow = p0 + Math.max(0, vh - top);
  return { follow, top, cells, logos: logoCells.map((l) => l.cell), max: follow + Math.max(0, top + height + grid.margin - vh) };
}

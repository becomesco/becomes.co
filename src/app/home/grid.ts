export interface Grid {
  width: number;
  columns: number;
  margin: number;
  gutter: number;
  column: number;
}

const BREAKPOINTS = [
  { min: 1200, columns: 12, margin: 40, gutter: 20 },
  { min: 900, columns: 10, margin: 32, gutter: 20 },
  { min: 600, columns: 8, margin: 24, gutter: 16 },
  { min: 0, columns: 4, margin: 16, gutter: 12 },
];

export function createGrid(width: number): Grid {
  const bp = BREAKPOINTS.find((b) => width >= b.min) ?? BREAKPOINTS[BREAKPOINTS.length - 1];
  const column = (width - bp.margin * 2 - bp.gutter * (bp.columns - 1)) / bp.columns;
  return { width, columns: bp.columns, margin: bp.margin, gutter: bp.gutter, column };
}

/** Left edge of column `i` (fractional i lands on half columns). */
export const columnX = (grid: Grid, i: number): number => grid.margin + i * (grid.column + grid.gutter);

/** Width of `span` columns including inner gutters. */
export const spanWidth = (grid: Grid, span: number): number => span * grid.column + (span - 1) * grid.gutter;

export const spanFor = (grid: Grid, width: number): number =>
  Math.max(1, Math.round((width + grid.gutter) / (grid.column + grid.gutter)));

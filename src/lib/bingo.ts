// Cards are generated (and validated) by the database: see create_room / join_room / swap_card.
export type Cell = { event: string; marked: boolean; free?: boolean };

export type LineResult = {
  rows: number; // completed rows
  cols: number; // completed columns
  diagonals: number; // completed diagonals (0..2)
  full: boolean;
  hasAnyLine: boolean;
};

export function evaluateLines(cells: Cell[]): LineResult {
  const m = (i: number) => !!cells[i]?.marked;
  let rows = 0,
    cols = 0,
    diagonals = 0;
  for (let r = 0; r < 5; r++) {
    if ([0, 1, 2, 3, 4].every((c) => m(r * 5 + c))) rows++;
  }
  for (let c = 0; c < 5; c++) {
    if ([0, 1, 2, 3, 4].every((r) => m(r * 5 + c))) cols++;
  }
  if ([0, 6, 12, 18, 24].every(m)) diagonals++;
  if ([4, 8, 12, 16, 20].every(m)) diagonals++;
  const full = cells.every((c) => c.marked);
  return { rows, cols, diagonals, full, hasAnyLine: rows + cols + diagonals > 0 };
}

// Client-side preview only (confetti). The authoritative score is computed by the database
// (compute_bingo_score) and cannot be written by clients.
// Score: marks*10 + 50 per line + 200 per bingo (any line) + 500 if full.
export function computeScore(cells: Cell[]) {
  const marks = cells.filter((c) => c.marked && !c.free).length;
  const { rows, cols, diagonals, full } = evaluateLines(cells);
  const lines = rows + cols + diagonals;
  const score = marks * 10 + lines * 50 + (lines > 0 ? 200 : 0) + (full ? 500 : 0);
  return { score, marks, lines, full };
}

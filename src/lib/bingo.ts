import { THEMES, type ThemeKey } from "./bingo-events";

export type Cell = { event: string; marked: boolean; free?: boolean };

export function generateCard(theme: ThemeKey): Cell[] {
  const pool = [...THEMES[theme].events];
  // shuffle
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const cells: Cell[] = Array.from({ length: 25 }, (_, i) => {
    if (i === 12) return { event: "FREE", marked: true, free: true };
    return { event: pool[i % pool.length], marked: false };
  });
  return cells;
}

export type LineResult = {
  rows: number;       // completed rows
  cols: number;       // completed columns
  diagonals: number;  // completed diagonals (0..2)
  full: boolean;
  hasAnyLine: boolean;
};

export function evaluateLines(cells: Cell[]): LineResult {
  const m = (i: number) => !!cells[i]?.marked;
  let rows = 0, cols = 0, diagonals = 0;
  for (let r = 0; r < 5; r++) {
    if ([0,1,2,3,4].every(c => m(r*5+c))) rows++;
  }
  for (let c = 0; c < 5; c++) {
    if ([0,1,2,3,4].every(r => m(r*5+c))) cols++;
  }
  if ([0,6,12,18,24].every(m)) diagonals++;
  if ([4,8,12,16,20].every(m)) diagonals++;
  const full = cells.every(c => c.marked);
  return { rows, cols, diagonals, full, hasAnyLine: rows+cols+diagonals > 0 };
}

// Score: marks*10 + 50 per line + 200 per bingo (any line) + 500 if full.
export function computeScore(cells: Cell[]) {
  const marks = cells.filter(c => c.marked && !c.free).length;
  const { rows, cols, diagonals, full } = evaluateLines(cells);
  const lines = rows + cols + diagonals;
  const score = marks * 10 + lines * 50 + (lines > 0 ? 200 : 0) + (full ? 500 : 0);
  return { score, marks, lines, full };
}

export function genRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

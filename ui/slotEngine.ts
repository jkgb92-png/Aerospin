/**
 * Aerospin – Industrial Slot Engine (TypeScript)
 * ================================================
 * In-browser port of the WORLD_INDUSTRIAL configuration from
 * casino_logic/multiverse_slot.py.  Runs entirely client-side; no server
 * required for demo play.
 *
 * Symbol indices map 1-to-1 to INDUSTRIAL_SYMBOLS in
 * IndustrialCasinoDashboard.tsx:
 *   0 📄 Manifest    1 🛢 Oil Barrel   2 📍 GPS Coord
 *   3 🔩 Anchor Bolt  4 🏗 Crane Hook   5 📦 Container
 *   6 🗝 Brass Key   7 📡 Scatter      8 🛸 Wild
 */

export const WILD_INDEX = 8;
export const SCATTER_INDEX = 7;

const COLS = 5;
const ROWS = 3;
const SCATTER_MIN = 3;

// ---------------------------------------------------------------------------
// Pay table: { symbolIndex: { matchCount: multiplier } }
// ---------------------------------------------------------------------------

const PAY_TABLE: Readonly<Record<number, Record<number, number>>> = {
  8: { 3: 60,  4: 250, 5: 1200 }, // Wild
  // 7 = Scatter – no line pay
  6: { 3: 30,  4: 120, 5: 600  }, // Brass Key
  5: { 3: 15,  4: 60,  5: 280  }, // Container
  4: { 3: 8,   4: 35,  5: 140  }, // Crane Hook
  3: { 3: 5,   4: 20,  5: 80   }, // Anchor Bolt
  2: { 3: 3,   4: 12,  5: 50   }, // GPS Coord
  1: { 3: 2,   4: 7,   5: 25   }, // Oil Barrel
  0: { 3: 1,   4: 3,   5: 10   }, // Manifest
};

// ---------------------------------------------------------------------------
// 20 paylines (row index per reel, 0=top, 1=middle, 2=bottom)
// ---------------------------------------------------------------------------

const PAYLINES: ReadonlyArray<readonly number[]> = [
  [1, 1, 1, 1, 1], // middle row
  [0, 0, 0, 0, 0], // top row
  [2, 2, 2, 2, 2], // bottom row
  [0, 1, 2, 1, 0], // V shape
  [2, 1, 0, 1, 2], // inverted V
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [1, 0, 2, 0, 1],
];

// ---------------------------------------------------------------------------
// Weighted symbol selection
// Symbol weights from WORLD_INDUSTRIAL (index 0 = Manifest, ... 8 = Wild)
// ---------------------------------------------------------------------------

const SYMBOL_WEIGHTS = [9, 8, 7, 6, 5, 4, 2, 1, 1];
const TOTAL_WEIGHT = SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);

// Pre-compute cumulative weight thresholds
const CUM_WEIGHTS: number[] = [];
{
  let sum = 0;
  for (const w of SYMBOL_WEIGHTS) {
    sum += w;
    CUM_WEIGHTS.push(sum);
  }
}

function randomSymbol(): number {
  const r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < CUM_WEIGHTS.length; i++) {
    if (r < CUM_WEIGHTS[i]) return i;
  }
  return SYMBOL_WEIGHTS.length - 1;
}

// ---------------------------------------------------------------------------
// Payline evaluation
// ---------------------------------------------------------------------------

interface LineWin {
  symbolIndex: number;
  count: number;
  multiplier: number;
  payout: number;
}

function evaluateLine(lineSymbols: number[], betSize: number): LineWin | null {
  // Find anchor: first non-wild, non-scatter symbol from the left
  let anchor: number | null = null;
  for (const sym of lineSymbols) {
    if (sym !== WILD_INDEX && sym !== SCATTER_INDEX) {
      anchor = sym;
      break;
    }
  }
  // All-wild line: pay as Brass Key (index 6), the highest non-wild, non-scatter
  // symbol in WORLD_INDUSTRIAL – mirrors the Python implementation which picks
  // the top non-scatter, non-wild symbol from the pay table.
  if (anchor === null) anchor = 6;

  let count = 0;
  for (const sym of lineSymbols) {
    if (sym === anchor || sym === WILD_INDEX) {
      count++;
    } else {
      break; // consecutive match broken
    }
  }

  if (count < 3) return null;

  const multiplier = PAY_TABLE[anchor]?.[count] ?? 0;
  if (multiplier === 0) return null;

  return { symbolIndex: anchor, count, multiplier, payout: multiplier * betSize };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SpinResult {
  /** 5-column × 3-row symbol index grid (grid[col][row]). */
  grid: number[][];
  /** Total payout in credits (0 if no win). */
  payout: number;
  /** Number of winning paylines. */
  winLines: number;
  /** Set of reel (column) indices that contributed to at least one win. */
  winningReels: Set<number>;
  /** Symbol index of the highest-paying win, or null if no win. */
  topWinSymbolIndex: number | null;
  /** Total scatter symbols across the full grid. */
  scatterCount: number;
  /** Whether a free-spins bonus was triggered. */
  freeSpinsTriggered: boolean;
}

/**
 * Perform one spin of the Industrial slot in the browser.
 *
 * @param betSize Wager amount (credits).  Payouts are `betSize × multiplier`.
 * @returns SpinResult containing the visible grid and outcome data.
 */
export function spinIndustrial(betSize = 1.0): SpinResult {
  // Build 5×3 random grid
  const grid: number[][] = [];
  for (let col = 0; col < COLS; col++) {
    const reel: number[] = [];
    for (let row = 0; row < ROWS; row++) {
      reel.push(randomSymbol());
    }
    grid.push(reel);
  }

  // Evaluate all paylines
  let totalPayout = 0;
  let winLines = 0;
  const winningReels = new Set<number>();
  let topWin: LineWin | null = null;

  for (const payline of PAYLINES) {
    const lineSymbols = payline.map((row, col) => grid[col][row]);
    const win = evaluateLine(lineSymbols, betSize);
    if (win) {
      totalPayout += win.payout;
      winLines++;
      for (let col = 0; col < win.count; col++) {
        winningReels.add(col);
      }
      if (!topWin || win.payout > topWin.payout) {
        topWin = win;
      }
    }
  }

  // Count scatters across the full grid
  let scatterCount = 0;
  for (const reel of grid) {
    scatterCount += reel.filter(s => s === SCATTER_INDEX).length;
  }

  return {
    grid,
    payout: totalPayout,
    winLines,
    winningReels,
    topWinSymbolIndex: topWin ? topWin.symbolIndex : null,
    scatterCount,
    freeSpinsTriggered: scatterCount >= SCATTER_MIN,
  };
}

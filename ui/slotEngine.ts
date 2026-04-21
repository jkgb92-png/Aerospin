/**
 * AeroSpin Royale – Slot Engine
 * Classic casino symbols. Returns jackpot contribution alongside spin result.
 *
 * Symbol indices:
 *   0 🍒 Cherry   1 🍋 Lemon   2 🍊 Orange   3 🔔 Bell
 *   4 ⭐ Star     5 💎 Diamond  6 7️⃣ Lucky 7  7 🎯 Scatter  8 🌟 Wild
 */

export const WILD_INDEX = 8;
export const SCATTER_INDEX = 7;

const COLS = 5;
const ROWS = 3;
const SCATTER_MIN = 3;
const FREE_SPIN_COUNT = 10;
const FREE_SPIN_MULTIPLIER = 2;
const JACKPOT_INITIAL_VALUE = 500;

const PAY_TABLE: Readonly<Record<number, Record<number, number>>> = {
  8: { 3: 100, 4: 500, 5: 2000 }, // Wild
  6: { 3: 50,  4: 200, 5: 1000 }, // Lucky 7
  5: { 3: 25,  4: 100, 5: 500  }, // Diamond
  4: { 3: 12,  4: 40,  5: 150  }, // Star
  3: { 3: 6,   4: 20,  5: 75   }, // Bell
  2: { 3: 4,   4: 12,  5: 40   }, // Orange
  1: { 3: 2,   4: 8,   5: 25   }, // Lemon
  0: { 3: 1,   4: 4,   5: 15   }, // Cherry
};

const PAYLINES: ReadonlyArray<readonly number[]> = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
  [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1], [0, 1, 1, 1, 0], [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1], [1, 1, 2, 1, 1], [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2], [1, 0, 2, 0, 1],
];

const SYMBOL_WEIGHTS = [10, 9, 8, 7, 6, 4, 2, 1, 1];
const TOTAL_WEIGHT = SYMBOL_WEIGHTS.reduce((a, b) => a + b, 0);
const CUM_WEIGHTS: number[] = [];
{
  let sum = 0;
  for (const w of SYMBOL_WEIGHTS) { sum += w; CUM_WEIGHTS.push(sum); }
}

function randomSymbol(): number {
  const r = Math.random() * TOTAL_WEIGHT;
  for (let i = 0; i < CUM_WEIGHTS.length; i++) {
    if (r < CUM_WEIGHTS[i]) return i;
  }
  return SYMBOL_WEIGHTS.length - 1;
}

interface LineWin {
  symbolIndex: number; count: number; multiplier: number; payout: number;
}

function evaluateLine(lineSymbols: number[], betSize: number, multiplier = 1): LineWin | null {
  let anchor: number | null = null;
  for (const sym of lineSymbols) {
    if (sym !== WILD_INDEX && sym !== SCATTER_INDEX) { anchor = sym; break; }
  }
  if (anchor === null) anchor = 6; // all-wild → Lucky 7
  let count = 0;
  for (const sym of lineSymbols) {
    if (sym === anchor || sym === WILD_INDEX) count++; else break;
  }
  if (count < 3) return null;
  const mul = PAY_TABLE[anchor]?.[count] ?? 0;
  if (mul === 0) return null;
  return { symbolIndex: anchor, count, multiplier: mul * multiplier, payout: mul * multiplier * betSize };
}

export interface SpinResult {
  grid: number[][];
  payout: number;
  winLines: number;
  winningReels: Set<number>;
  topWinSymbolIndex: number | null;
  scatterCount: number;
  freeSpinsTriggered: boolean;
  freeSpinCount: number;
  jackpotContribution: number;
}

/** Jackpot seed (accumulates across spins in this session) */
let _jackpotPool = JACKPOT_INITIAL_VALUE;
export function getJackpotPool(): number { return _jackpotPool; }
export function resetJackpot(): void { _jackpotPool = JACKPOT_INITIAL_VALUE; }
export function addToJackpot(amount: number): void { _jackpotPool += amount; }

export function spinIndustrial(betSize = 1.0, freeSpinMultiplier = 1): SpinResult {
  const grid: number[][] = [];
  for (let col = 0; col < COLS; col++) {
    const reel: number[] = [];
    for (let row = 0; row < ROWS; row++) reel.push(randomSymbol());
    grid.push(reel);
  }

  let totalPayout = 0;
  let winLines = 0;
  const winningReels = new Set<number>();
  let topWin: LineWin | null = null;

  for (const payline of PAYLINES) {
    const lineSymbols = payline.map((row, col) => grid[col][row]);
    const win = evaluateLine(lineSymbols, betSize, freeSpinMultiplier);
    if (win) {
      totalPayout += win.payout;
      winLines++;
      for (let col = 0; col < win.count; col++) winningReels.add(col);
      if (!topWin || win.payout > topWin.payout) topWin = win;
    }
  }

  let scatterCount = 0;
  for (const reel of grid) scatterCount += reel.filter(s => s === SCATTER_INDEX).length;

  // Jackpot contribution: 1% of bet each spin
  const jackpotContribution = betSize * 0.01;
  _jackpotPool += jackpotContribution;

  return {
    grid, payout: totalPayout, winLines, winningReels,
    topWinSymbolIndex: topWin ? topWin.symbolIndex : null,
    scatterCount,
    freeSpinsTriggered: scatterCount >= SCATTER_MIN,
    freeSpinCount: FREE_SPIN_COUNT,
    jackpotContribution,
  };
}

export { FREE_SPIN_COUNT, FREE_SPIN_MULTIPLIER };


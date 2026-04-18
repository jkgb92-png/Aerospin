export const TOKENS = {
  color: {
    charcoal: '#1C1C1C',
    steel: '#2E3338',
    slate: '#3A4550',
    olive: '#3D4A2E',
    signalGreen: '#4E9A60',
    amber: '#D4860A',
    offWhite: '#D8D4CC',
    dimText: '#6B7A85',
    danger: '#F87171',
    success: '#4ADE80',
  },
  zIndex: {
    backdrop: 0,
    dashboard: 10,
    hud: 20,
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
  },
  borderRadius: {
    hard: 2,
    soft: 4,
  },
} as const;

// Chromebook-first visual performance budget.
export const PERFORMANCE_BUDGET = {
  maxActiveTiles: 36,
  maxTileLoadFailuresBeforeFallback: 6,
  maxHudTiltDegrees: 12,
} as const;

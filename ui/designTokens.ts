export const TOKENS = {
  color: {
    bg: '#050508',
    panel: '#0E0E16',
    panelBorder: 'rgba(255,215,0,0.25)',
    gold: '#FFD700',
    goldDim: '#A0780A',
    neonPink: '#FF2D55',
    neonCyan: '#00E5FF',
    neonPurple: '#8B5CF6',
    white: '#F0EEE8',
    dimText: '#7A7A9A',
    danger: '#FF453A',
    success: '#30D158',
    charcoal: '#050508',
    steel: '#0E0E16',
    slate: '#1A1A2E',
    olive: '#1A2E1A',
    signalGreen: '#30D158',
    amber: '#FFD700',
    offWhite: '#F0EEE8',
  },
  zIndex: {
    backdrop: 0,
    particles: 1,
    threeCanvas: 2,
    dashboard: 10,
    hud: 20,
    overlay: 30,
  },
  spacing: { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 28 },
  borderRadius: { hard: 4, soft: 10, round: 20 },
  backdrop: {
    baseDimOpacity: 0.65,
    failureDimStep: 0.01,
    maxDimOpacity: 0.78,
  },
} as const;

export const PERFORMANCE_BUDGET = {
  maxActiveTiles: 36,
  maxTileLoadFailuresBeforeFallback: 6,
  maxHudTiltDegrees: 12,
} as const;

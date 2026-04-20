/**
 * Aerospin – Industrial Casino Dashboard
 * ========================================
 * "Industrial Surveillance" aesthetic — raw, gritty, technically precise.
 *
 * Layout (left-to-right)
 * ----------------------
 *  [SatelliteHUDTile]  |  [AeroPaneSidebar]
 *
 * SatelliteHUDTile
 * ----------------
 *  • Simulated top-down dockyard map at 30 cm/px fidelity (dark charcoal tile
 *    with vector dock outlines, no photos — keeps the bundle clean).
 *  • Tactical HUD overlay: green vector lines along the grid, GPS coordinate
 *    readouts in all four corners, and an animated radar-sweep line that
 *    rotates at a constant angular velocity.
 *  • Color palette: charcoal background, tactical olive (#3D4A2E) for dock
 *    geometry, signal green (#4E9A60) for HUD vectors and sweep.
 *
 * AeroPaneSidebar
 * ---------------
 *  • Wireframe perspective view of a 3-D terrain block that rotates
 *    continuously about the Y-axis using Animated.timing + interpolation.
 *  • Rendered with React Native's raw path/line SVG-style via absolute-
 *    positioned Views — no third-party 3-D library required.
 *  • Muted slate tones, no fills.
 *
 * IndustrialSlotReels
 * -------------------
 *  • Five industrial symbol reels rendered as a scrolling strip.  Symbols
 *    come from WORLD_INDUSTRIAL: Manifest, Oil Barrel, GPS Coord, Anchor Bolt,
 *    Crane Hook, Container, Brass Key, Scatter, Wild.
 *  • Visual: brushed-steel panel with sharp inset shadows; symbol glyphs are
 *    emoji stand-ins (replace with bitmaps in production).
 *
 * Color palette (no neon, no glow, no gradients)
 * -----------------------------------------------
 *  CHARCOAL  #1C1C1C   base background
 *  STEEL     #2E3338   reel panel, sidebar
 *  SLATE     #3A4550   borders, outlines
 *  OLIVE     #3D4A2E   tactical geometry
 *  SIGNAL_G  #4E9A60   HUD vectors, sweep line
 *  AMBER     #D4860A   win / alert accent
 *  OFF_WHITE #D8D4CC   primary text
 *  DIM_TEXT  #6B7A85   secondary labels
 */

import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TOKENS } from './designTokens';

// ---------------------------------------------------------------------------
// Palette constants
// ---------------------------------------------------------------------------

const C = {
  CHARCOAL: TOKENS.color.charcoal,
  STEEL: TOKENS.color.steel,
  SLATE: TOKENS.color.slate,
  OLIVE: TOKENS.color.olive,
  SIGNAL_G: TOKENS.color.signalGreen,
  AMBER: TOKENS.color.amber,
  OFF_WHITE: TOKENS.color.offWhite,
  DIM_TEXT: TOKENS.color.dimText,
} as const;

// ---------------------------------------------------------------------------
// Screen dimensions
// ---------------------------------------------------------------------------

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const TILE_W = SCREEN_W * 0.60;
const SIDEBAR_W = SCREEN_W - TILE_W - 16; // 8 px gap each side

// Reserve vertical space for: paddingTop(12) + statusBar(~55) + mainRow
// marginBottom(8) + 3-row reels(156) + reels marginBottom(8) +
// SPIN button(~54) + FloatingHUD overlay(~260). Cap at 40% of screen so the
// satellite map doesn't become too tall on large displays.
const STATUS_BAR_HEIGHT   = 55; // content + paddingBottom + marginBottom
const REELS_HEIGHT        = 3 * 52 + 8; // 3 rows × 52 px + marginBottom
const SPIN_BUTTON_HEIGHT  = 54; // marginTop + paddingVertical + text + marginBottom
const HUD_OVERLAY_HEIGHT  = 260; // FloatingHUD + bottom offset clearance
const PADDING_TOP         = 12;
const MAIN_ROW_MARGIN     = 8;  // mainRow marginBottom
const FIXED_LAYOUT_HEIGHT =
  PADDING_TOP + STATUS_BAR_HEIGHT + MAIN_ROW_MARGIN +
  REELS_HEIGHT + SPIN_BUTTON_HEIGHT + HUD_OVERLAY_HEIGHT;

const TILE_H = Math.max(
  120,
  Math.min(SCREEN_H * 0.40, SCREEN_H - FIXED_LAYOUT_HEIGHT),
);

// Wireframe canvas side length: fit inside the sidebar without overflowing
// the tile height. Capped at sidebar width minus padding.
const WIRE_SIZE = Math.min(SIDEBAR_W - 24, Math.max(80, TILE_H - 50));

// ---------------------------------------------------------------------------
// Radar sweep animation
// ---------------------------------------------------------------------------

/** One full revolution in milliseconds. */
const SWEEP_PERIOD_MS = 3200;

// ---------------------------------------------------------------------------
// Wireframe terrain constants
// ---------------------------------------------------------------------------

/** Number of terrain grid divisions per axis. */
const GRID_DIV = 5;

// ---------------------------------------------------------------------------
// Industrial world symbol glyphs (emoji proxies; replace with sprites in prod)
// ---------------------------------------------------------------------------

const INDUSTRIAL_SYMBOLS = [
  '📄', // Manifest
  '🛢', // Oil Barrel
  '📍', // GPS Coord
  '🔩', // Anchor Bolt
  '🏗', // Crane Hook
  '📦', // Container
  '🗝', // Brass Key
  '📡', // Scatter – satellite dish
  '🛸', // Wild – drone silhouette
];

// ---------------------------------------------------------------------------
// SatelliteHUDTile
// ---------------------------------------------------------------------------

interface SatelliteHUDTileProps {
  /** GPS coordinate displayed in the top-left corner label. */
  topLeftCoord: string;
  /** GPS coordinate displayed in the bottom-right corner label. */
  bottomRightCoord: string;
}

/**
 * Top-down dockyard satellite tile with tactical HUD overlay.
 * The "satellite image" is synthesised from charcoal/olive rectangles so the
 * app carries no external assets.  Swap the dock geometry Views for a real
 * MapView / Image in production.
 */
function SatelliteHUDTile({ topLeftCoord, bottomRightCoord }: SatelliteHUDTileProps) {
  // Sweep angle 0 → 2π
  const sweepAngle = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.timing(sweepAngle, {
        toValue: 1,
        duration: SWEEP_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    ).start();
  }, [sweepAngle]);

  const sweepRotate = sweepAngle.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <View style={styles.tile}>

      {/* ── Synthesised dockyard geometry ── */}
      {/* Pier 1 */}
      <View style={[styles.dockBlock, { top: '15%', left: '5%', width: '30%', height: '10%' }]} />
      {/* Pier 2 */}
      <View style={[styles.dockBlock, { top: '28%', left: '5%', width: '45%', height: '10%' }]} />
      {/* Storage yard */}
      <View style={[styles.dockBlock, { top: '55%', left: '10%', width: '55%', height: '18%' }]} />
      {/* Vessel berth outline */}
      <View style={[styles.dockOutline, { top: '10%', left: '55%', width: '35%', height: '25%' }]} />
      {/* Road grid lines (horizontal) */}
      <View style={[styles.gridLineH, { top: '45%' }]} />
      <View style={[styles.gridLineH, { top: '75%' }]} />
      {/* Road grid lines (vertical) */}
      <View style={[styles.gridLineV, { left: '50%' }]} />
      <View style={[styles.gridLineV, { left: '70%' }]} />

      {/* ── Radar sweep ── */}
      <View style={styles.sweepContainer} pointerEvents="none">
        {/* Crosshair */}
        <View style={styles.crosshairH} />
        <View style={styles.crosshairV} />

        {/* Animated sweep line originating from centre */}
        <Animated.View
          style={[
            styles.sweepLine,
            { transform: [{ rotate: sweepRotate }] },
          ]}
        />

        {/* Target reticle at map centre */}
        <View style={styles.reticle} />
      </View>

      {/* ── Corner GPS readouts ── */}
      <Text style={[styles.coordLabel, styles.coordTL]}>{topLeftCoord}</Text>
      <Text style={[styles.coordLabel, styles.coordBR]}>{bottomRightCoord}</Text>

      {/* ── Resolution watermark ── */}
      <Text style={styles.resLabel}>30cm/px · LIVE</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// AeroPaneSidebar – wireframe terrain
// ---------------------------------------------------------------------------

/** Rotating period in ms. */
const ROTATE_PERIOD_MS = 6000;
const WIRE_SEGMENT_VERTICAL_OFFSET = -0.5;

/**
 * Produces a flat list of {x1,y1,x2,y2} line segments that describe a simple
 * perspective grid (terrain block viewed from a slight elevation angle).
 * The rotation angle (0–1) maps to a yaw around the Y-axis.
 */
function buildWireframeLines(
  t: number,  // normalised angle 0–1
  size: number,
): Array<{ x1: number; y1: number; x2: number; y2: number }> {
  const TWO_PI = Math.PI * 2;
  const yaw = t * TWO_PI;
  const cosY = Math.cos(yaw);
  const sinY = Math.sin(yaw);
  const pitch = 0.5; // fixed elevation angle in radians

  const half = size / 2;

  // Project a 3-D grid point onto 2-D screen space
  function project(gx: number, gy: number, gz: number): { x: number; y: number } {
    // Y-axis rotation
    const rx = gx * cosY - gz * sinY;
    const rz = gx * sinY + gz * cosY;
    // X-axis (pitch) rotation
    const ry2 = gy * Math.cos(pitch) - rz * Math.sin(pitch);
    const rz2 = gy * Math.sin(pitch) + rz * Math.cos(pitch);
    // Perspective divide (focal length = 2.5 × half)
    const fl = half * 2.5;
    const scale = fl / (fl + rz2 + half * 0.5);
    return {
      x: half + rx * scale * half,
      y: half + ry2 * scale * half,
    };
  }

  const lines: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
  const step = 1 / GRID_DIV;

  for (let i = 0; i <= GRID_DIV; i++) {
    const u = i * step - 0.5; // normalised [-0.5, 0.5]

    // Horizontal lines (constant Z)
    const h0 = project(u, -0.25, -0.5);
    const h1 = project(u, -0.25,  0.5);
    lines.push({ x1: h0.x, y1: h0.y, x2: h1.x, y2: h1.y });

    // Vertical lines (constant X)
    const v0 = project(-0.5, -0.25, u);
    const v1 = project( 0.5, -0.25, u);
    lines.push({ x1: v0.x, y1: v0.y, x2: v1.x, y2: v1.y });
  }

  // Top face
  for (let i = 0; i <= GRID_DIV; i++) {
    const u = i * step - 0.5;
    const th0 = project(u,  0.25, -0.5);
    const th1 = project(u,  0.25,  0.5);
    lines.push({ x1: th0.x, y1: th0.y, x2: th1.x, y2: th1.y });

    const tv0 = project(-0.5, 0.25, u);
    const tv1 = project( 0.5, 0.25, u);
    lines.push({ x1: tv0.x, y1: tv0.y, x2: tv1.x, y2: tv1.y });
  }

  // Vertical pillars at the four corners
  const corners: Array<[number, number]> = [
    [-0.5, -0.5], [ 0.5, -0.5],
    [-0.5,  0.5], [ 0.5,  0.5],
  ];
  for (const [cx, cz] of corners) {
    const bot = project(cx, -0.25, cz);
    const top = project(cx,  0.25, cz);
    lines.push({ x1: bot.x, y1: bot.y, x2: top.x, y2: top.y });
  }

  return lines;
}

/**
 * AeroPaneSidebar
 *
 * Shows a continuously rotating wireframe terrain block – the "drone-view
 * rotation of the current map tile" requested in the design spec.
 *
 * The rotation angle is driven by a requestAnimationFrame loop so that it
 * stays in sync with the display refresh and does not pile up callbacks when
 * the JS thread is busy (unlike setInterval).
 */
function AeroPaneSidebar() {
  const [rotT, setRotT] = React.useState(0);
  const rafRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  const animate = useCallback((timestamp: number) => {
    if (!mountedRef.current) return;
    if (startTimeRef.current === null) {
      startTimeRef.current = timestamp;
    }
    const elapsed = (timestamp - startTimeRef.current) % ROTATE_PERIOD_MS;
    setRotT(elapsed / ROTATE_PERIOD_MS);
    rafRef.current = requestAnimationFrame(animate);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    rafRef.current = requestAnimationFrame(animate);
    return () => {
      mountedRef.current = false;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [animate]);

  const lines = buildWireframeLines(rotT, WIRE_SIZE);

  return (
    <View style={styles.sidebar}>
      <Text style={styles.sidebarTitle}>AEROPANE · TERRAIN</Text>

      {/* Wireframe canvas */}
      <View style={[styles.wireCanvas, { width: WIRE_SIZE, height: WIRE_SIZE }]}>
        {lines.map((seg, i) => {
          const dx = seg.x2 - seg.x1;
          const dy = seg.y2 - seg.y1;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx) * (180 / Math.PI);
          const centerX = (seg.x1 + seg.x2) / 2;
          const centerY = (seg.y1 + seg.y2) / 2;
          return (
            <View
              key={i}
              style={{
                position: 'absolute',
                left: centerX,
                top: centerY,
                width: length,
                height: 1,
                backgroundColor: C.SIGNAL_G,
                opacity: 0.55,
                transform: [{ translateX: -length / 2 }, { translateY: WIRE_SEGMENT_VERTICAL_OFFSET }, { rotate: `${angle}deg` }],
              }}
            />
          );
        })}
      </View>

      {/* Telemetry readout below the wireframe */}
      <View style={styles.telemetryRow}>
        <TelemetryCell label="ALT" value="83m" />
        <TelemetryCell label="HDG" value={`${Math.round(rotT * 360)}°`} />
        <TelemetryCell label="SPD" value="0kt" />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// TelemetryCell
// ---------------------------------------------------------------------------

function TelemetryCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.telemetryCell}>
      <Text style={styles.telemetryLabel}>{label}</Text>
      <Text style={styles.telemetryValue}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// IndustrialSlotReels
// ---------------------------------------------------------------------------

interface IndustrialSlotReelsProps {
  /** Five symbol indices (0-8 into INDUSTRIAL_SYMBOLS) per reel, top row. */
  visibleSymbols: number[][];
  /** Map of reel index → winning payline highlight. */
  winningReels?: Set<number>;
}

/**
 * Renders five reels of the Industrial Surveillance slot.
 * Each reel column shows three symbol rows in a brushed-steel panel.
 */
function IndustrialSlotReels({ visibleSymbols, winningReels = new Set() }: IndustrialSlotReelsProps) {
  return (
    <View style={styles.reelsWrapper}>
      <View style={styles.reelPanel}>
        {visibleSymbols.map((reel, reelIdx) => (
          <View
            key={reelIdx}
            style={[
              styles.reelColumn,
              winningReels.has(reelIdx) && styles.reelColumnWin,
            ]}
          >
            {reel.map((symIdx, rowIdx) => (
              <View key={rowIdx} style={styles.symbolCell}>
                <Text style={styles.symbolGlyph}>
                  {INDUSTRIAL_SYMBOLS[symIdx] ?? '?'}
                </Text>
              </View>
            ))}
          </View>
        ))}
      </View>

      {/* Payline centre indicator */}
      <View style={styles.paylineBar} pointerEvents="none" />
    </View>
  );
}

// ---------------------------------------------------------------------------
// IndustrialCasinoDashboard – main export
// ---------------------------------------------------------------------------

interface IndustrialCasinoDashboardProps {
  /** Current credit balance. */
  credits: number;
  /** Current session win total. */
  totalWin: number;
  /** GPS coordinate at top-left of the satellite tile. */
  topLeftCoord?: string;
  /** GPS coordinate at bottom-right of the satellite tile. */
  bottomRightCoord?: string;
  /**
   * 5-reel × 3-row symbol index grid.
   * Defaults to an all-zeros idle state if omitted.
   */
  visibleSymbols?: number[][];
  /** Set of reel indices to highlight as part of a win. */
  winningReels?: Set<number>;
  /**
   * Called when the player presses the SPIN button.
   * Wire this to sound playback and reel animation in the parent.
   */
  onSpin?: () => void;
}

const DEFAULT_GRID: number[][] = Array.from({ length: 5 }, () => [0, 1, 2]);

/**
 * IndustrialCasinoDashboard
 *
 * Root layout component for the Industrial Surveillance casino screen.
 * Compose with FloatingHUD (gyro-tilt overlay) for the full effect.
 */
export function IndustrialCasinoDashboard({
  credits,
  totalWin,
  topLeftCoord = '51.5074°N  0.1278°W',
  bottomRightCoord = '51.4974°N  0.1078°W',
  visibleSymbols = DEFAULT_GRID,
  winningReels = new Set(),
  onSpin,
}: IndustrialCasinoDashboardProps) {
  return (
    <View style={styles.root}>

      {/* ── Top status bar ── */}
      <View style={styles.statusBar}>
        <StatusChip label="CREDITS" value={credits.toLocaleString()} />
        <Text style={styles.statusTitle}>AEROSPIN · INDUSTRIAL</Text>
        <StatusChip label="WIN" value={totalWin.toLocaleString()} accent />
      </View>

      {/* ── Main content row ── */}
      <View style={styles.mainRow}>
        <SatelliteHUDTile
          topLeftCoord={topLeftCoord}
          bottomRightCoord={bottomRightCoord}
        />
        <AeroPaneSidebar />
      </View>

      {/* ── Slot reels ── */}
      <IndustrialSlotReels
        visibleSymbols={visibleSymbols}
        winningReels={winningReels}
      />

      {/* ── Spin button ── */}
      <Pressable
        style={({ pressed }) => [
          styles.spinButton,
          pressed && styles.spinButtonPressed,
          !onSpin && styles.spinButtonDisabled,
        ]}
        onPress={onSpin}
        disabled={!onSpin}
        accessibilityRole="button"
        accessibilityLabel="Spin the reels"
      >
        <Text style={styles.spinButtonText}>◈  SPIN</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------
// StatusChip
// ---------------------------------------------------------------------------

function StatusChip({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <View style={styles.statusChip}>
      <Text style={styles.statusChipLabel}>{label}</Text>
      <Text style={[styles.statusChipValue, accent && styles.statusChipAccent]}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // Root – transparent so EarthBackdrop satellite imagery shows through.
  // zIndex must exceed ThreeReelCanvas (zIndex 5) so the dashboard renders
  // on top of the canvas layer while remaining below the FloatingHUD (zIndex 20).
  root: {
    flex: 1,
    backgroundColor: 'transparent',
    paddingTop: 12,
    paddingHorizontal: 8,
    zIndex: TOKENS.zIndex.dashboard,
  },

  // Status bar – semi-transparent tint so text stays readable over the backdrop
  statusBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(28, 28, 28, 0.60)',
    borderBottomWidth: 1,
    borderBottomColor: C.SLATE,
    paddingBottom: 8,
    paddingHorizontal: 4,
    marginBottom: 8,
    borderRadius: 2,
  },
  statusTitle: {
    color: C.DIM_TEXT,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  statusChip: {
    alignItems: 'flex-start',
  },
  statusChipLabel: {
    color: C.DIM_TEXT,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  statusChipValue: {
    color: C.OFF_WHITE,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statusChipAccent: {
    color: C.AMBER,
  },

  // Main row
  mainRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },

  // Satellite tile
  tile: {
    width: TILE_W,
    height: TILE_H,
    backgroundColor: '#111510',               // very dark olive-black
    borderWidth: 1,
    borderColor: C.SLATE,
    overflow: 'hidden',
  },
  dockBlock: {
    position: 'absolute',
    backgroundColor: C.OLIVE,
    opacity: 0.75,
  },
  dockOutline: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: C.OLIVE,
    backgroundColor: 'transparent',
  },
  gridLineH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.SIGNAL_G,
    opacity: 0.18,
  },
  gridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: C.SIGNAL_G,
    opacity: 0.18,
  },
  sweepContainer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  crosshairH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: C.SIGNAL_G,
    opacity: 0.30,
  },
  crosshairV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: C.SIGNAL_G,
    opacity: 0.30,
  },
  sweepLine: {
    position: 'absolute',
    left: 0,
    top: '50%',
    width: TILE_W,
    height: 1,
    backgroundColor: C.SIGNAL_G,
    opacity: 0.65,
  },
  reticle: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: C.SIGNAL_G,
    backgroundColor: 'transparent',
  },
  coordLabel: {
    position: 'absolute',
    color: C.SIGNAL_G,
    fontSize: 9,
    fontWeight: '600',
    letterSpacing: 0.6,
    fontVariant: ['tabular-nums'],
    opacity: 0.85,
  },
  coordTL: {
    top: 4,
    left: 4,
  },
  coordBR: {
    bottom: 4,
    right: 4,
  },
  resLabel: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    color: C.DIM_TEXT,
    fontSize: 8,
    letterSpacing: 0.5,
    fontWeight: '600',
  },

  // AeroPane sidebar
  sidebar: {
    flex: 1,
    backgroundColor: C.STEEL,
    borderWidth: 1,
    borderColor: C.SLATE,
    padding: 8,
    alignItems: 'center',
    overflow: 'hidden',
  },
  sidebarTitle: {
    color: C.DIM_TEXT,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  wireCanvas: {
    position: 'relative',
  },
  telemetryRow: {
    flexDirection: 'row',
    marginTop: 8,
    gap: 8,
  },
  telemetryCell: {
    alignItems: 'center',
  },
  telemetryLabel: {
    color: C.DIM_TEXT,
    fontSize: 8,
    fontWeight: '600',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  telemetryValue: {
    color: C.SIGNAL_G,
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },

  // Slot reels
  reelsWrapper: {
    position: 'relative',
    marginBottom: 8,
  },
  reelPanel: {
    flexDirection: 'row',
    backgroundColor: C.STEEL,
    borderWidth: 1,
    borderColor: C.SLATE,
    borderRadius: 2,
    overflow: 'hidden',
    // Hard inset shadow effect via nested borders
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 6,
  },
  reelColumn: {
    flex: 1,
    borderRightWidth: 1,
    borderRightColor: C.SLATE,
  },
  reelColumnWin: {
    borderWidth: 1,
    borderColor: C.AMBER,
  },
  symbolCell: {
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 1,
    borderBottomColor: C.SLATE,
  },
  symbolGlyph: {
    fontSize: 26,
  },
  paylineBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 52,                    // centre row top
    height: 52,                 // centre row height
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: C.AMBER,
    borderBottomColor: C.AMBER,
    opacity: 0.30,
    backgroundColor: 'transparent',
  },

  // Spin button
  spinButton: {
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 40,
    backgroundColor: C.STEEL,
    borderWidth: 1,
    borderColor: C.AMBER,
    borderRadius: 2,
  },
  spinButtonPressed: {
    backgroundColor: C.OLIVE,
  },
  spinButtonDisabled: {
    opacity: 0.4,
  },
  spinButtonText: {
    color: C.AMBER,
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});

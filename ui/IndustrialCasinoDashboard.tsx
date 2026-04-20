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

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TOKENS } from './designTokens';
import { spinReel } from './ReelPhysics';
import type { SpinPhase } from './ThreeReelCanvas';

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
// Satellite tile utilities (Esri World Imagery + GPS → Slippy-map tile math)
// ---------------------------------------------------------------------------

/** Esri World Imagery tile URL (free, no API key). */
const ESRI_TILE_URL = (z: number, x: number, y: number): string =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/** Zoom level for the HUD mini-map (zoom 16 ≈ 1.5 m/px → fine street detail). */
const HUD_ZOOM = 16;

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * Math.pow(2, zoom));
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      Math.pow(2, zoom),
  );
}

/**
 * Parse a GPS coordinate string such as "51.5074°N  0.1278°W" or
 * "33.8688°S  151.2093°E" and return decimal lat/lon.
 * Returns null if the string does not match the expected format.
 */
function parseGpsCoord(s: string): { lat: number; lon: number } | null {
  const m = s.match(/(\d+\.?\d*)°([NS])\s+(\d+\.?\d*)°([EW])/i);
  if (!m) return null;
  const lat = parseFloat(m[1]) * (m[2].toUpperCase() === 'S' ? -1 : 1);
  const lon = parseFloat(m[3]) * (m[4].toUpperCase() === 'W' ? -1 : 1);
  return { lat, lon };
}

// ---------------------------------------------------------------------------
// Reel animation constants (used by AnimatedReelColumn)
// ---------------------------------------------------------------------------

/** Random symbols rendered before the final result symbols during spin. */
const REEL_PREFIX = 8;
/**
 * Extra symbols appended after the 3 result symbols to give the spring
 * overshoot in spinReel room to travel without exposing empty space.
 *
 * Overshoot estimate (worst case starting 2 symbols from stop):
 *   DECEL_SPRING (tension=80, friction=12): ζ ≈ 0.67, ω_d ≈ 6.63 rad/s.
 *   Starting displacement: 2 × REEL_SYMBOL_H = 104 px, v₀ = 1296 px/s.
 *   Amplitude ≈ 145 px; first zero-crossing damping ≈ 0.12 → ~17 px overshoot.
 *   1 suffix symbol (52 px) comfortably covers the ~17 px maximum overshoot.
 */
const REEL_SUFFIX = 1;
/** Height of one symbol cell (must match styles.symbolCell.height). */
const REEL_SYMBOL_H = 52;
/** Total visible rows per reel (3 rows always visible). */
const REEL_VISIBLE_ROWS = 3;
/** translateY that shows the first result symbol at the top of the viewport. */
const REEL_STOP_Y = -(REEL_PREFIX * REEL_SYMBOL_H);
/**
 * Point 2 symbols before the stop where the fast-timing phase ends and
 * spinReel takes over for the physics-based settle.  Starting spinReel from
 * this close distance keeps the spring overshoot within REEL_SUFFIX symbols.
 */
const REEL_RUSH_TARGET = REEL_STOP_Y + 2 * REEL_SYMBOL_H;
/** Whether the native driver can be used for reel scroll animations. */
const REEL_USE_NATIVE_DRIVER = Platform.OS !== 'web';

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
 * Top-down satellite HUD tile.
 *
 * When `topLeftCoord` is parseable the component renders a real Esri World
 * Imagery tile as the map background, then layers the tactical HUD overlay
 * (crosshair, radar sweep, corner labels, resolution watermark) on top.
 * Falls back to the synthesised charcoal/olive dock geometry when the coord
 * cannot be parsed (e.g. placeholder text before GPS resolves).
 */
function SatelliteHUDTile({ topLeftCoord, bottomRightCoord }: SatelliteHUDTileProps) {
  // Derive satellite tile URI from the passed GPS coordinate.
  const tileUri = useMemo<string | null>(() => {
    const parsed = parseGpsCoord(topLeftCoord);
    if (!parsed) return null;
    const tx = lon2tile(parsed.lon, HUD_ZOOM);
    const ty = lat2tile(parsed.lat, HUD_ZOOM);
    return ESRI_TILE_URL(HUD_ZOOM, tx, ty);
  }, [topLeftCoord]);

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

      {tileUri ? (
        /* ── Real satellite imagery ── */
        <>
          <Image
            source={{ uri: tileUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
          />
          {/* Tactical dark-green tint so HUD elements stay legible */}
          <View style={styles.tileDimOverlay} />
        </>
      ) : (
        /* ── Synthesised dockyard geometry (fallback when GPS unavailable) ── */
        <>
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
        </>
      )}

      {/* ── Radar sweep (always on top) ── */}
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
// AnimatedReelColumn
// ---------------------------------------------------------------------------

interface AnimatedReelColumnProps {
  /** The 3 final result symbols to land on (indices into INDUSTRIAL_SYMBOLS). */
  finalSymbols: number[];
  /** Column index 0–4; used to stagger the spin timing. */
  colIndex: number;
  /** Highlight the column border when it contributed to a win. */
  isWin: boolean;
  /** Current spin phase from the parent game loop. */
  spinPhase: SpinPhase;
}

/**
 * AnimatedReelColumn
 *
 * Renders one reel column with a physics-based spin animation.
 *
 * Animation sequence per spin:
 *   1. Fast timing scroll (accelerating, staggered per column) moves the
 *      strip from the top through REEL_PREFIX − 2 random symbols.
 *   2. `spinReel` (from ReelPhysics.ts) takes over for the last 2 symbols,
 *      overshooting slightly then springing back to the exact stop — the
 *      classic mechanical-drum settle feel.
 *
 * Strip layout (12 symbols total):
 *   [ ...REEL_PREFIX random... ] [ result[0] ] [ result[1] ] [ result[2] ] [ ...REEL_SUFFIX buffer... ]
 *                                 ^─ REEL_STOP_Y shows these 3 symbols in the viewport
 */
function AnimatedReelColumn({ finalSymbols, colIndex, isWin, spinPhase }: AnimatedReelColumnProps) {
  const scrollAnim = useRef(new Animated.Value(0)).current;
  // Strip is stored in state so re-renders happen when it changes.
  const [strip, setStrip] = useState<number[]>(() => [
    ...finalSymbols,
    ...Array.from({ length: REEL_SUFFIX }, () => 0),
  ]);
  // Track previous phase to detect the idle→spinning edge.
  const prevPhaseRef = useRef<SpinPhase>('idle');
  // Hold onto running animations so we can cancel on unmount.
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const prevPhase = prevPhaseRef.current;
    prevPhaseRef.current = spinPhase;

    // Only act on the idle→spinning transition.
    if (spinPhase !== 'spinning' || prevPhase === 'spinning') return;

    // ── Build the strip for this spin ──────────────────────────────────────
    const prefix: number[] = Array.from(
      { length: REEL_PREFIX },
      () => Math.floor(Math.random() * INDUSTRIAL_SYMBOLS.length),
    );
    const suffix: number[] = Array.from(
      { length: REEL_SUFFIX },
      () => Math.floor(Math.random() * INDUSTRIAL_SYMBOLS.length),
    );
    setStrip([...prefix, ...finalSymbols, ...suffix]);

    // Reset scroll to show the prefix symbols from the top.
    scrollAnim.setValue(0);

    // ── Phase 1: fast timing scroll to 2 symbols before the stop ──────────
    // Stagger: each subsequent reel starts 180 ms later, giving the
    // characteristic cascade of stopping reels from left to right.
    const staggerMs = colIndex * 180;
    const duration = 900 + staggerMs;

    const timingAnim = Animated.timing(scrollAnim, {
      toValue: REEL_RUSH_TARGET,
      duration,
      easing: Easing.in(Easing.poly(2)),
      useNativeDriver: REEL_USE_NATIVE_DRIVER,
    });

    animRef.current = timingAnim;

    timingAnim.start(({ finished }) => {
      if (!finished) return;
      // ── Phase 2: physics settle via ReelPhysics.spinReel ──────────────
      spinReel(scrollAnim, REEL_STOP_Y, { symbolHeight: REEL_SYMBOL_H });
    });

    return () => {
      animRef.current?.stop();
    };
  // Join finalSymbols values into a stable string dependency so the effect
  // correctly detects symbol changes while avoiding array-reference churn.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinPhase, colIndex, scrollAnim, finalSymbols.join(',')]);

  return (
    <View style={[styles.reelColumn, isWin && styles.reelColumnWin]}>
      {/* Clipping viewport: only REEL_VISIBLE_ROWS × REEL_SYMBOL_H pixels tall */}
      <View style={styles.reelViewport}>
        <Animated.View style={{ transform: [{ translateY: scrollAnim }] }}>
          {strip.map((symIdx, i) => (
            <View key={i} style={styles.symbolCell}>
              <Text style={styles.symbolGlyph}>
                {INDUSTRIAL_SYMBOLS[symIdx] ?? '?'}
              </Text>
            </View>
          ))}
        </Animated.View>
      </View>
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
  /** Current spin phase – drives the reel animation. */
  spinPhase?: SpinPhase;
}

/**
 * Renders five animated reels of the Industrial Surveillance slot.
 * Each reel column spins with physics-based settle animation and shows a
 * three-symbol visible window.  Win columns are highlighted in amber.
 */
function IndustrialSlotReels({
  visibleSymbols,
  winningReels = new Set(),
  spinPhase = 'idle',
}: IndustrialSlotReelsProps) {
  return (
    <View style={styles.reelsWrapper}>
      <View style={styles.reelPanel}>
        {visibleSymbols.map((reel, reelIdx) => (
          <AnimatedReelColumn
            key={reelIdx}
            finalSymbols={reel}
            colIndex={reelIdx}
            isWin={winningReels.has(reelIdx)}
            spinPhase={spinPhase}
          />
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
  /** Disables the SPIN button and shows a spinning state when true. */
  spinning?: boolean;
  /** Number of remaining free spins (>0 while bonus mode is active). */
  freeSpinsRemaining?: number;
  /**
   * Current spin phase from the game loop.
   * Passed to AnimatedReelColumn to drive the reel spin animation.
   */
  spinPhase?: SpinPhase;
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
  spinning = false,
  freeSpinsRemaining = 0,
  spinPhase = 'idle',
}: IndustrialCasinoDashboardProps) {
  const isDisabled = spinning || !onSpin;
  const buttonLabel = spinning
    ? 'SPINNING…'
    : freeSpinsRemaining > 0
      ? '◈  FREE SPIN'
      : '◈  SPIN';
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
        spinPhase={spinPhase}
      />

      {/* ── Free spins indicator ── */}
      {freeSpinsRemaining > 0 && (
        <View style={styles.freeSpinsBar}>
          <Text style={styles.freeSpinsText}>
            ◈  FREE SPINS REMAINING: {freeSpinsRemaining}
          </Text>
        </View>
      )}

      {/* ── Spin button ── */}
      <Pressable
        style={({ pressed }) => [
          styles.spinButton,
          pressed && !isDisabled && styles.spinButtonPressed,
          freeSpinsRemaining > 0 && styles.spinButtonFree,
          isDisabled && styles.spinButtonDisabled,
        ]}
        onPress={onSpin}
        disabled={isDisabled}
        accessibilityRole="button"
        accessibilityLabel="Spin the reels"
      >
        <Text style={[styles.spinButtonText, freeSpinsRemaining > 0 && styles.spinButtonTextFree]}>
          {buttonLabel}
        </Text>
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

  // Satellite tile dim overlay (keeps HUD text legible over real satellite imagery)
  tileDimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 20, 0, 0.45)',
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
  /** Clipping window: shows exactly REEL_VISIBLE_ROWS symbol cells. */
  reelViewport: {
    height: REEL_VISIBLE_ROWS * REEL_SYMBOL_H,
    overflow: 'hidden',
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
  spinButtonFree: {
    borderColor: C.SIGNAL_G,
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
  spinButtonTextFree: {
    color: C.SIGNAL_G,
  },

  // Free spins indicator bar
  freeSpinsBar: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 4,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: C.SIGNAL_G,
    borderRadius: 2,
    backgroundColor: 'rgba(62, 154, 96, 0.10)',
  },
  freeSpinsText: {
    color: C.SIGNAL_G,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
});

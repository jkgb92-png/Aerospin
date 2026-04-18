/**
 * Aerospin – Floating HUD with Gyroscope Tilt  (Industrial Surveillance theme)
 * =============================================================================
 * A React Native component that uses the device's gyroscope / accelerometer
 * to subtly tilt a 3-D HUD overlay as the player moves their phone.
 *
 * Visual language: "Industrial Surveillance"
 * ------------------------------------------
 *  • Palette: charcoal (#1C1C1C), slate (#4A5058), tactical olive (#3D4A2E),
 *    signal amber (#D4860A), off-white (#D8D4CC).
 *  • No neon, no glow, no gradients.  Every element has a hard shadow.
 *  • GPS coordinate readout replaces decorative world-badge.
 *  • Typeface styling: condensed, mono, all-caps — military HUD convention.
 *
 * Dependencies (add to package.json):
 *   expo-sensors  ^13.x   (or react-native-sensors for bare RN)
 *
 * Tilt mechanics
 * --------------
 *  • The accelerometer reports the orientation of gravity in the device frame.
 *  • We map the X-axis reading to rotateY (left–right lean) and the
 *    Y-axis reading to rotateX (forward–back tilt) through a low-pass filter
 *    to suppress high-frequency jitter.
 *  • Maximum visible tilt is capped at ±15° to remain subtle.
 *  • An Animated.spring drives the transform so transitions feel fluid.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Accelerometer } from 'expo-sensors';
import { PERFORMANCE_BUDGET, TOKENS } from './designTokens';

// ---------------------------------------------------------------------------
// Palette – flat matte, no gradients (Industrial Surveillance)
// ---------------------------------------------------------------------------

const DEEP_CHARCOAL = TOKENS.color.charcoal; // near-black background panels
const SLATE_GREY = TOKENS.color.dimText; // muted slate for secondary text
const INDUSTRIAL_WHITE = TOKENS.color.offWhite; // off-white for primary readouts
const CHARCOAL_BORDER = '#4A5058'; // slate border
const WIN_AMBER = TOKENS.color.amber; // signal amber – win readout

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum tilt angle in degrees. */
const MAX_TILT_DEG = PERFORMANCE_BUDGET.maxHudTiltDegrees;

/**
 * Low-pass filter coefficient α ∈ (0, 1].
 * Smaller value = smoother but more lag.
 * 0.15 feels natural on a 60 Hz poll interval.
 */
const LOW_PASS_ALPHA = 0.15;

/** Accelerometer update interval in milliseconds. */
const UPDATE_INTERVAL_MS = 16; // ~60 fps

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Spin history record (raw math for Stats Panel)
// ---------------------------------------------------------------------------

export interface SpinRecord {
  /** Spin serial number within the session (1-based). */
  spinNumber: number;
  /** Wager placed on this spin. */
  bet: number;
  /** Total payout returned (0 for a no-win spin). */
  payout: number;
  /** Net result: payout − bet. */
  net: number;
  /** Winning symbol name, or null if no win. */
  winSymbol: string | null;
  /** Number of winning paylines triggered, or 0. */
  winLines: number;
}

// ---------------------------------------------------------------------------
// FloatingHUD component
// ---------------------------------------------------------------------------

interface FloatingHUDProps {
  /** Player's current credit balance. */
  credits: number;
  /** GPS coordinate string displayed in the location badge (e.g. "51.5074°N 0.1278°W"). */
  gpsCoord: string;
  /** Total win amount for the current session. */
  totalWin: number;
  /**
   * History of the last N spins (up to 10 shown in the Stats Panel).
   * Oldest entry first; newest last.
   */
  spinHistory?: SpinRecord[];
}

/**
 * FloatingHUD
 *
 * Renders an industrial HUD card that tilts in response to device orientation
 * and optionally shows a raw-data Stats Panel for the last 10 spins.
 */
export function FloatingHUD({
  credits,
  gpsCoord,
  totalWin,
  spinHistory = [],
}: FloatingHUDProps) {
  // Animated values for perspective transform
  const tiltX = useRef(new Animated.Value(0)).current; // rotateX: forward/back
  const tiltY = useRef(new Animated.Value(0)).current; // rotateY: left/right

  // Low-pass filter state (mutable ref, not reactive)
  const filteredRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    let subscription: ReturnType<typeof Accelerometer.addListener> | null = null;

    try {
      Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);

      subscription = Accelerometer.addListener(({ x, y }) => {
        // Apply low-pass filter to smooth sensor noise
        const prev = filteredRef.current;
        const smoothX = prev.x + LOW_PASS_ALPHA * (x - prev.x);
        const smoothY = prev.y + LOW_PASS_ALPHA * (y - prev.y);
        filteredRef.current = { x: smoothX, y: smoothY };

        // Map sensor range [-1, 1] → tilt degrees [-MAX, MAX]
        const targetTiltX = clamp(-smoothY * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);
        const targetTiltY = clamp(smoothX * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);

        tiltX.setValue(targetTiltX);
        tiltY.setValue(targetTiltY);
      });
    } catch (err) {
      // Accelerometer unavailable on this platform/device – tilt stays at 0
      if (__DEV__) {
        console.warn('[FloatingHUD] Accelerometer unavailable:', err);
      }
    }

    return () => subscription?.remove();
  }, [tiltX, tiltY]);

  // Convert degree numbers to interpolated rotation strings
  const rotateXStr = tiltX.interpolate({
    inputRange: [-MAX_TILT_DEG, MAX_TILT_DEG],
    outputRange: [`-${MAX_TILT_DEG}deg`, `${MAX_TILT_DEG}deg`],
  });
  const rotateYStr = tiltY.interpolate({
    inputRange: [-MAX_TILT_DEG, MAX_TILT_DEG],
    outputRange: [`-${MAX_TILT_DEG}deg`, `${MAX_TILT_DEG}deg`],
  });

  const recentSpins = spinHistory.slice(-10);

  return (
    <Animated.View
      style={[
        styles.hud,
        {
          transform: [
            { perspective: 800 },
            { rotateX: rotateXStr },
            { rotateY: rotateYStr },
          ],
        },
      ]}
    >
      {/* GPS location badge */}
      <View style={styles.gpsBadge}>
        <Text style={styles.gpsLabel}>◈ GPS</Text>
        <Text style={styles.gpsCoord}>{gpsCoord}</Text>
      </View>

      {/* Primary stat row */}
      <View style={styles.statsRow}>
        <HUDStat label="CREDITS" value={credits.toLocaleString()} />
        <HUDStat label="SESSION WIN" value={totalWin.toLocaleString()} accent />
      </View>

      {/* Stats Panel – raw math for last 10 spins */}
      {recentSpins.length > 0 && (
        <StatsPanel spins={recentSpins} />
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// StatsPanel – last 10 spins, raw data only
// ---------------------------------------------------------------------------

interface StatsPanelProps {
  spins: SpinRecord[];
}

/**
 * StatsPanel
 *
 * Displays a compact table of the last N spins with columns:
 *   #  BET  PAYOUT  NET  SYMBOL  LINES
 *
 * No decorative elements — plain numbers on a flat charcoal surface.
 */
function StatsPanel({ spins }: StatsPanelProps) {
  return (
    <View style={styles.statsPanel}>
      <Text style={styles.statsPanelTitle}>LAST {spins.length} SPINS</Text>

      {/* Column headers */}
      <View style={styles.tableRow}>
        <Text style={[styles.tableHeader, styles.colNum]}>#</Text>
        <Text style={[styles.tableHeader, styles.colBet]}>BET</Text>
        <Text style={[styles.tableHeader, styles.colPayout]}>PAYOUT</Text>
        <Text style={[styles.tableHeader, styles.colNet]}>NET</Text>
        <Text style={[styles.tableHeader, styles.colSymbol]}>SYM</Text>
        <Text style={[styles.tableHeader, styles.colLines, styles.colLinesText]}>LINES</Text>
      </View>

      <View style={styles.divider} />

      <ScrollView
        style={styles.tableScroll}
        scrollEnabled={false}
        showsVerticalScrollIndicator={false}
      >
        {spins.map((spin) => (
          <SpinRow key={spin.spinNumber} spin={spin} />
        ))}
      </ScrollView>
    </View>
  );
}

interface SpinRowProps {
  spin: SpinRecord;
}

function SpinRow({ spin }: SpinRowProps) {
  const netPositive = spin.net > 0;
  const netNeutral  = spin.net === 0;
  const netStyle    = netPositive
    ? styles.netPositive
    : netNeutral
      ? styles.netNeutral
      : styles.netNegative;

  return (
    <View style={styles.tableRow}>
      <Text style={[styles.tableCell, styles.colNum]}>{spin.spinNumber}</Text>
      <Text style={[styles.tableCell, styles.colBet]}>{spin.bet.toFixed(2)}</Text>
      <Text style={[styles.tableCell, styles.colPayout]}>{spin.payout.toFixed(2)}</Text>
      <Text style={[styles.tableCell, styles.colNet, netStyle]}>
        {spin.net >= 0 ? '+' : ''}{spin.net.toFixed(2)}
      </Text>
      <Text
        style={[styles.tableCell, styles.colSymbol]}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {spin.winSymbol ?? '—'}
      </Text>
      <Text style={[styles.tableCell, styles.colLines, styles.colLinesText]}>{spin.winLines}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// HUDStat – individual stat cell
// ---------------------------------------------------------------------------

interface HUDStatProps {
  label: string;
  value: string;
  accent?: boolean;
}

function HUDStat({ label, value, accent = false }: HUDStatProps) {
  return (
    <View style={styles.statCell}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>
        {value}
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

// ---------------------------------------------------------------------------
// Styles – flat matte, zero gradients (Industrial Surveillance)
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // HUD card
  hud: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.9,
    backgroundColor: 'rgba(28, 28, 28, 0.92)',   // charcoal
    borderRadius: 4,                               // hard industrial corners
    borderWidth: 1,
    borderColor: CHARCOAL_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 20,
    // Hard shadow — no soft glow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 10,
    zIndex: TOKENS.zIndex.hud,
  },

  // GPS location badge
  gpsBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#3D4A2E',                    // tactical olive
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: 10,
  },
  gpsLabel: {
    color: '#A8B89A',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginRight: 6,
  },
  gpsCoord: {
    color: INDUSTRIAL_WHITE,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },

  // Primary stats row
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statCell: {
    alignItems: 'flex-start',
  },
  statLabel: {
    color: SLATE_GREY,
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: INDUSTRIAL_WHITE,
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statValueAccent: {
    color: WIN_AMBER,
  },

  // Stats Panel
  statsPanel: {
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: CHARCOAL_BORDER,
  },
  statsPanelTitle: {
    color: SLATE_GREY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.6,
    marginBottom: 6,
  },
  tableScroll: {
    maxHeight: 160,
  },
  divider: {
    height: 1,
    backgroundColor: CHARCOAL_BORDER,
    marginBottom: 4,
  },

  // Table rows
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  tableHeader: {
    color: SLATE_GREY,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  tableCell: {
    color: INDUSTRIAL_WHITE,
    fontSize: 11,
    fontWeight: '500',
    fontVariant: ['tabular-nums'],
  },

  // Column widths (fixed so numbers align)
  colNum:       { width: 24 },
  colBet:       { width: 44 },
  colPayout:    { width: 52 },
  colNet:       { width: 52 },
  colSymbol:    { flex: 1 },
  colLines:     { width: 36 },
  colLinesText: { textAlign: 'right' },

  // Net value colouring
  netPositive: { color: TOKENS.color.success }, // flat green
  netNeutral:  { color: SLATE_GREY },
  netNegative: { color: TOKENS.color.danger }, // flat red
});

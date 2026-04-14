/**
 * Aerospin – Floating HUD with Gyroscope Tilt
 * =============================================
 * A React Native component that uses the device's gyroscope / accelerometer
 * to subtly tilt a 3-D HUD overlay as the player moves their phone.
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
 *
 * UI palette – flat matte surfaces, no gradients
 * -----------------------------------------------
 *  SLATE_GREY      #6B7280  – mid-tone neutral for secondary elements
 *  INDUSTRIAL_WHITE #F0EFEB – off-white for primary text / surfaces
 *  DEEP_CHARCOAL   #1C1C1C  – near-black background panels
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

// ---------------------------------------------------------------------------
// Palette – flat matte, no gradients
// ---------------------------------------------------------------------------

const DEEP_CHARCOAL    = '#1C1C1C';
const SLATE_GREY       = '#6B7280';
const INDUSTRIAL_WHITE = '#F0EFEB';
const CHARCOAL_BORDER  = '#2E2E2E';
const WIN_AMBER        = '#D97706'; // muted amber, flat

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum tilt angle in degrees. */
const MAX_TILT_DEG = 15;

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
  /** Current active world name (e.g. "Neon Cyber"). */
  worldName: string;
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
 * Renders a flat-matte HUD card that tilts in response to device orientation
 * and optionally shows a raw-data Stats Panel for the last 10 spins.
 */
export function FloatingHUD({
  credits,
  worldName,
  totalWin,
  spinHistory = [],
}: FloatingHUDProps) {
  // Animated values for perspective transform
  const tiltX = useRef(new Animated.Value(0)).current; // rotateX: forward/back
  const tiltY = useRef(new Animated.Value(0)).current; // rotateY: left/right

  // Low-pass filter state (mutable ref, not reactive)
  const filteredRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    Accelerometer.setUpdateInterval(UPDATE_INTERVAL_MS);

    const subscription = Accelerometer.addListener(({ x, y }) => {
      // Apply low-pass filter to smooth sensor noise
      const prev = filteredRef.current;
      const smoothX = prev.x + LOW_PASS_ALPHA * (x - prev.x);
      const smoothY = prev.y + LOW_PASS_ALPHA * (y - prev.y);
      filteredRef.current = { x: smoothX, y: smoothY };

      // Map sensor range [-1, 1] → tilt degrees [-MAX, MAX]
      const targetTiltX = clamp(-smoothY * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);
      const targetTiltY = clamp(smoothX * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG);

      Animated.spring(tiltX, {
        toValue: targetTiltX,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }).start();

      Animated.spring(tiltY, {
        toValue: targetTiltY,
        useNativeDriver: true,
        friction: 8,
        tension: 60,
      }).start();
    });

    return () => subscription.remove();
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
      {/* World badge */}
      <View style={styles.worldBadge}>
        <Text style={styles.worldText}>{worldName.toUpperCase()}</Text>
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
// Styles – flat matte, zero gradients
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  // HUD card
  hud: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.9,
    backgroundColor: DEEP_CHARCOAL,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: CHARCOAL_BORDER,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },

  // World badge
  worldBadge: {
    alignSelf: 'flex-start',
    backgroundColor: SLATE_GREY,
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginBottom: 10,
  },
  worldText: {
    color: INDUSTRIAL_WHITE,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.8,
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
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: INDUSTRIAL_WHITE,
    fontSize: 22,
    fontWeight: '800',
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
  netPositive: { color: '#4ADE80' }, // flat green
  netNeutral:  { color: SLATE_GREY },
  netNegative: { color: '#F87171' }, // flat red
});

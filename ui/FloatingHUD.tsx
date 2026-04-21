/**
 * AeroSpin Royale – Floating HUD
 * Luxury dark glass panel with gyro tilt, XP bar, and spin history dots.
 */

import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { PERFORMANCE_BUDGET, TOKENS } from './designTokens';

const AccelerometerModule =
  Platform.OS !== 'web'
    ? (require('expo-sensors') as typeof import('expo-sensors')).Accelerometer
    : null;

const MAX_TILT_DEG = PERFORMANCE_BUDGET.maxHudTiltDegrees;
const LOW_PASS_ALPHA = 0.15;
const UPDATE_INTERVAL_MS = 16;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// SpinRecord type (exported so App.tsx can use it)
// ---------------------------------------------------------------------------

export interface SpinRecord {
  spinNumber: number;
  bet: number;
  payout: number;
  net: number;
  winSymbol: string | null;
  winLines: number;
}

const XP_PER_LEVEL = 100;

// ---------------------------------------------------------------------------
// FloatingHUD
// ---------------------------------------------------------------------------

interface FloatingHUDProps {
  credits: number;
  gpsCoord: string;
  totalWin: number;
  spinHistory?: SpinRecord[];
}

export function FloatingHUD({
  credits,
  gpsCoord,
  totalWin,
  spinHistory = [],
}: FloatingHUDProps) {
  const tiltX = useRef(new Animated.Value(0)).current;
  const tiltY = useRef(new Animated.Value(0)).current;
  const filteredRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    if (!AccelerometerModule) return;
    let subscription: ReturnType<typeof AccelerometerModule.addListener> | null = null;
    try {
      AccelerometerModule.setUpdateInterval(UPDATE_INTERVAL_MS);
      subscription = AccelerometerModule.addListener(({ x, y }) => {
        const prev = filteredRef.current;
        const smoothX = prev.x + LOW_PASS_ALPHA * (x - prev.x);
        const smoothY = prev.y + LOW_PASS_ALPHA * (y - prev.y);
        filteredRef.current = { x: smoothX, y: smoothY };
        tiltX.setValue(clamp(-smoothY * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG));
        tiltY.setValue(clamp(smoothX * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG));
      });
    } catch (err) {
      if (__DEV__) console.warn('[FloatingHUD] Accelerometer unavailable:', err);
    }
    return () => subscription?.remove();
  }, [tiltX, tiltY]);

  const rotateXStr = tiltX.interpolate({
    inputRange: [-MAX_TILT_DEG, MAX_TILT_DEG],
    outputRange: [`-${MAX_TILT_DEG}deg`, `${MAX_TILT_DEG}deg`],
  });
  const rotateYStr = tiltY.interpolate({
    inputRange: [-MAX_TILT_DEG, MAX_TILT_DEG],
    outputRange: [`-${MAX_TILT_DEG}deg`, `${MAX_TILT_DEG}deg`],
  });

  const level = Math.floor(totalWin / XP_PER_LEVEL) + 1;
  const xpProgress = (totalWin % XP_PER_LEVEL) / XP_PER_LEVEL;
  const recentSpins = spinHistory.slice(-5);

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
      {/* Top row: GPS + level */}
      <View style={styles.topRow}>
        <View style={styles.gpsBadge}>
          <Text style={styles.gpsLabel}>◈ GPS</Text>
          <Text style={styles.gpsCoord}>{gpsCoord}</Text>
        </View>
        <View style={styles.levelBadge}>
          <Text style={styles.levelText}>LVL {level}</Text>
        </View>
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <HUDStat label="CREDITS" value={credits.toFixed(2)} />
        <HUDStat label="SESSION WIN" value={totalWin.toFixed(2)} accent />
      </View>

      {/* XP bar */}
      <View style={styles.xpBarContainer}>
        <Text style={styles.xpLabel}>XP TO NEXT LEVEL</Text>
        <View style={styles.xpBarTrack}>
          <View style={[styles.xpBarFill, { width: `${Math.round(xpProgress * 100)}%` as any }]} />
        </View>
      </View>

      {/* Spin history dots */}
      {recentSpins.length > 0 && (
        <View style={styles.historyRow}>
          <Text style={styles.historyLabel}>LAST SPINS</Text>
          <View style={styles.historyDots}>
            {recentSpins.map((spin) => (
              <View
                key={spin.spinNumber}
                style={[
                  styles.dot,
                  spin.net > 0 ? styles.dotWin
                    : spin.net < 0 ? styles.dotLoss
                    : styles.dotNeutral,
                ]}
              />
            ))}
          </View>
        </View>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// HUDStat
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
      <Text style={[styles.statValue, accent && styles.statValueAccent]}>{value}</Text>
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
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    bottom: 28,
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.92,
    backgroundColor: 'rgba(14,14,22,0.88)',
    borderRadius: TOKENS.borderRadius.soft,
    borderWidth: 1,
    borderColor: TOKENS.color.panelBorder,
    paddingVertical: 14,
    paddingHorizontal: 18,
    shadowColor: TOKENS.color.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 10,
    zIndex: TOKENS.zIndex.hud,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  gpsBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(26,26,46,0.9)',
    borderRadius: TOKENS.borderRadius.hard,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  gpsLabel: {
    color: TOKENS.color.neonCyan,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginRight: 6,
  },
  gpsCoord: {
    color: TOKENS.color.white,
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  levelBadge: {
    backgroundColor: TOKENS.color.neonPurple,
    borderRadius: TOKENS.borderRadius.round,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  levelText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statCell: {
    alignItems: 'flex-start',
  },
  statLabel: {
    color: TOKENS.color.dimText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: TOKENS.color.white,
    fontSize: 20,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statValueAccent: {
    color: TOKENS.color.gold,
    textShadowColor: TOKENS.color.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 4,
  },
  // XP bar
  xpBarContainer: {
    marginBottom: 10,
  },
  xpLabel: {
    color: TOKENS.color.dimText,
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  xpBarTrack: {
    height: 4,
    backgroundColor: 'rgba(255,215,0,0.15)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  xpBarFill: {
    height: 4,
    backgroundColor: TOKENS.color.gold,
    borderRadius: 2,
  },
  // Spin history
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  historyLabel: {
    color: TOKENS.color.dimText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  historyDots: {
    flexDirection: 'row',
    gap: 6,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  dotWin: { backgroundColor: TOKENS.color.success },
  dotLoss: { backgroundColor: TOKENS.color.danger },
  dotNeutral: { backgroundColor: TOKENS.color.dimText },
});

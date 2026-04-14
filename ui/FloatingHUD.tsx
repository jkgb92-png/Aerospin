/**
 * Aerospin – Floating HUD with Gyroscope Tilt
 * =============================================
 * A React Native component that uses the device's gyroscope / accelerometer
 * to subtly tilt a 3-D HUD overlay as the player moves their phone.
 *
 * Dependencies (add to package.json):
 *   expo-sensors          ^13.x   (or react-native-sensors for bare RN)
 *   react-native-reanimated ^3.x
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
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Accelerometer } from 'expo-sensors'; // swap for react-native-sensors if needed

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
// FloatingHUD component
// ---------------------------------------------------------------------------

interface FloatingHUDProps {
  /** Player's current credit balance. */
  credits: number;
  /** Current active world name (e.g. "Neon Cyber"). */
  worldName: string;
  /** Total win amount for the current session. */
  totalWin: number;
}

/**
 * FloatingHUD
 *
 * Renders a semi-transparent HUD card that tilts in response to device
 * orientation. Safe to mount at the root of your game screen.
 */
export function FloatingHUD({ credits, worldName, totalWin }: FloatingHUDProps) {
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
        <Text style={styles.worldText}>{worldName}</Text>
      </View>

      {/* Stat row */}
      <View style={styles.statsRow}>
        <HUDStat label="CREDITS" value={credits.toLocaleString()} />
        <HUDStat label="WIN" value={totalWin.toLocaleString()} accent />
      </View>
    </Animated.View>
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
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  hud: {
    position: 'absolute',
    bottom: 32,
    alignSelf: 'center',
    width: SCREEN_WIDTH * 0.9,
    backgroundColor: 'rgba(10, 10, 30, 0.78)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(120, 80, 255, 0.6)',
    paddingVertical: 14,
    paddingHorizontal: 20,
    // iOS shadow
    shadowColor: '#7c3aed',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.5,
    shadowRadius: 16,
    // Android elevation
    elevation: 12,
  },
  worldBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(124, 58, 237, 0.35)',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 10,
  },
  worldText: {
    color: '#c4b5fd',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCell: {
    alignItems: 'flex-start',
  },
  statLabel: {
    color: 'rgba(196, 181, 253, 0.7)',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: '#f5f3ff',
    fontSize: 22,
    fontWeight: '800',
  },
  statValueAccent: {
    color: '#fbbf24', // amber – win highlight
  },
});

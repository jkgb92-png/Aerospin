/**
 * Aerospin – Floating HUD with Gyroscope Tilt  (Industrial Surveillance theme)
 * =============================================================================
 * A React Native component that uses the device's gyroscope / accelerometer
 * to subtly tilt a 3-D HUD overlay as the player moves their phone.
 *
 * Visual language: "Industrial Surveillance"
 * ------------------------------------------
 *  • Palette: charcoal (#1C1C1C), slate (#3A4550), tactical olive (#3D4A2E),
 *    signal amber (#D4860A), off-white (#D8D4CC).
 *  • No neon, no glow, no gradients.  Every element has a hard shadow.
 *  • GPS coordinate readout replaces decorative world-badge.
 *  • Typeface styling: condensed, mono, all-caps — military HUD convention.
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
  /** GPS coordinate string displayed in the location badge (e.g. "51.5074°N 0.1278°W"). */
  gpsCoord: string;
  /** Total win amount for the current session. */
  totalWin: number;
}

/**
 * FloatingHUD
 *
 * Renders a semi-transparent industrial HUD card that tilts in response to
 * device orientation.  Safe to mount at the root of your game screen.
 */
export function FloatingHUD({ credits, gpsCoord, totalWin }: FloatingHUDProps) {
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
      {/* GPS location badge */}
      <View style={styles.gpsBadge}>
        <Text style={styles.gpsLabel}>◈ GPS</Text>
        <Text style={styles.gpsCoord}>{gpsCoord}</Text>
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
    backgroundColor: 'rgba(28, 28, 28, 0.92)',   // charcoal
    borderRadius: 4,                               // hard industrial corners
    borderWidth: 1,
    borderColor: '#4A5058',                        // slate border
    paddingVertical: 14,
    paddingHorizontal: 20,
    // Hard shadow — no soft glow
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
    elevation: 10,
  },
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
    color: '#D8D4CC',                              // off-white readout
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.8,
    fontVariant: ['tabular-nums'],
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statCell: {
    alignItems: 'flex-start',
  },
  statLabel: {
    color: '#6B7A85',                              // muted slate
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statValue: {
    color: '#D8D4CC',                              // off-white
    fontSize: 22,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statValueAccent: {
    color: '#D4860A',                              // signal amber – win readout
  },
});

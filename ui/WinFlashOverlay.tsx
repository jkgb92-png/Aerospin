/**
 * Aerospin – WinFlashOverlay
 * ==========================
 * Full-screen overlay that provides haptic-feedback simulation when a winning
 * line is hit:
 *
 *  • Screen-shake  – rapid ±4 px translateX/Y sequence (works on all platforms)
 *  • Neon pulse    – animated border glow using a signal-green colour pulse
 *                    that fires 3 times then fades back to transparent.
 *
 * Mount above the Three.js canvas but below the HUD (zIndex 15).
 * Pass `isWin={true}` to trigger; animations auto-reset on completion.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, StyleSheet, View } from 'react-native';
import { TOKENS } from './designTokens';

const { width: W, height: H } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Screen-shake keyframes (±4 px, 8 frames × 16 ms ≈ 128 ms total)
// ---------------------------------------------------------------------------

const SHAKE_FRAMES: [number, number][] = [
  [ 4,  2], [-4, -2], [ 3, -3], [-3,  3],
  [ 2,  4], [-2, -4], [ 1, -1], [ 0,  0],
];
const FRAME_MS = 16;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface WinFlashOverlayProps {
  /** Set to true when a winning line is detected to trigger the animations. */
  isWin: boolean;
}

/**
 * WinFlashOverlay
 *
 * Renders an absolutely-positioned full-screen overlay that shakes and pulses
 * in response to winning spins.  Use `pointerEvents="none"` to ensure the
 * overlay doesn't block touch events on the game UI beneath it.
 */
export function WinFlashOverlay({ isWin }: WinFlashOverlayProps) {
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;
  const borderOpacity = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  useEffect(() => {
    if (!isWin || isAnimating.current) return;
    isAnimating.current = true;

    // ── Screen-shake sequence ─────────────────────────────────────────────
    const shakeSeqX = Animated.sequence(
      SHAKE_FRAMES.map(([x]) =>
        Animated.timing(shakeX, { toValue: x, duration: FRAME_MS, useNativeDriver: true }),
      ),
    );
    const shakeSeqY = Animated.sequence(
      SHAKE_FRAMES.map(([, y]) =>
        Animated.timing(shakeY, { toValue: y, duration: FRAME_MS, useNativeDriver: true }),
      ),
    );

    // ── Neon border pulse (3 × fade-in/out) ──────────────────────────────
    const pulse = Animated.sequence([
      Animated.timing(borderOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(borderOpacity, { toValue: 0.2, duration: 80, useNativeDriver: true }),
      Animated.timing(borderOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(borderOpacity, { toValue: 0.2, duration: 80, useNativeDriver: true }),
      Animated.timing(borderOpacity, { toValue: 1, duration: 80, useNativeDriver: true }),
      Animated.timing(borderOpacity, { toValue: 0, duration: 300, useNativeDriver: true }),
    ]);

    Animated.parallel([shakeSeqX, shakeSeqY, pulse]).start(() => {
      shakeX.setValue(0);
      shakeY.setValue(0);
      borderOpacity.setValue(0);
      isAnimating.current = false;
    });
  }, [isWin, shakeX, shakeY, borderOpacity]);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          transform: [
            { translateX: shakeX },
            { translateY: shakeY },
          ],
        },
      ]}
    >
      {/* Animated neon border */}
      <Animated.View
        style={[
          styles.neonBorder,
          { opacity: borderOpacity },
        ]}
      />
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: W,
    height: H,
    zIndex: TOKENS.zIndex.hud - 5, // above canvas (10), below HUD (20)
    pointerEvents: 'none',
  } as unknown as object, // cast required: StyleSheet doesn't know pointerEvents at root View level in all RN versions
  neonBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 3,
    borderColor: '#00FF88', // signal-green neon
    // borderRadius intentionally 0 – hard industrial corners
  },
});

// Unused but kept to satisfy the View placeholder for the overlay background
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _unused = View;

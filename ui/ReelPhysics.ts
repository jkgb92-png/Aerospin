/**
 * Aerospin – Reel Physics: Drag Coefficient & Overshoot Spring
 * =============================================================
 * Models a physical reel that decelerates under drag, overshoots its target
 * stop by a small amount, then settles back — like a heavy mechanical drum.
 *
 * Animation model
 * ---------------
 * An underdamped spring (damping ratio ζ < 1) naturally overshoots before
 * converging. We tune the spring so that:
 *
 *   1. The reel accelerates quickly at launch (high initial velocity).
 *   2. Air/mechanical drag slows it down (DRAG_COEFFICIENT).
 *   3. It shoots slightly past the target stop (OVERSHOOT_FACTOR).
 *   4. A gentle restoring force pulls it back into the exact stop position.
 *
 * The numeric parameters map directly to React Native Animated.spring config:
 *   • tension  – spring stiffness  (higher = snappier)
 *   • friction – damping constant  (lower  = more overshoot)
 *   • velocity – initial velocity  (higher = more momentum at launch)
 *
 * Usage
 * -----
 * ```ts
 * import { Animated } from 'react-native';
 * import { spinReel } from './ReelPhysics';
 *
 * const position = useRef(new Animated.Value(0)).current;
 *
 * // Called when the spin result is known and the reel should settle on `stopY`
 * spinReel(position, stopY, { onSettle: () => console.log('reel settled') });
 * ```
 */

import { Animated } from 'react-native';

// ---------------------------------------------------------------------------
// Physics constants
// ---------------------------------------------------------------------------

/**
 * Drag coefficient applied to the reel strip during deceleration.
 * Dimensionless factor in (0, 1]. 1.0 = no drag (frictionless); lower values
 * simulate greater mechanical resistance and produce shorter overshoots.
 * 0.72 mirrors the feel of a weighted casino drum.
 */
export const DRAG_COEFFICIENT = 0.72;

/**
 * Fraction of the reel strip height that the reel overshoots before snapping
 * back. E.g. 0.08 means the reel travels 8 % past the target stop before
 * the restoring spring brings it home.
 */
export const OVERSHOOT_FACTOR = 0.08;

/**
 * Initial angular velocity imparted to the reel at spin start (in px/s as
 * perceived by the animation system). Higher = more dramatic momentum.
 */
export const LAUNCH_VELOCITY = 1800;

// Spring config for the settling phase (underdamped → overshoot then converge)
const SETTLE_SPRING: Omit<Animated.SpringAnimationConfig, 'toValue' | 'useNativeDriver'> = {
  tension: 38,       // lower tension → softer spring → visible overshoot
  friction: 5,       // low friction → reel damps slowly, feels heavy
  velocity: 0,       // velocity is set per-call from the deceleration phase
  restDisplacementThreshold: 0.5,
  restSpeedThreshold: 0.5,
};

// Fast deceleration phase that brings the reel close to the target
const DECEL_SPRING: Omit<Animated.SpringAnimationConfig, 'toValue' | 'useNativeDriver'> = {
  tension: 80,
  friction: 12,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface SpinReelOptions {
  /** Pixel height of a single symbol cell on screen. */
  symbolHeight?: number;
  /** Called once the reel has fully settled at its stop position. */
  onSettle?: () => void;
}

/**
 * Animate a reel strip to its final stop position using a two-phase motion:
 *
 * Phase 1 – Deceleration
 *   The reel rushes toward `stopValue` with drag applied; the effective target
 *   is pushed `OVERSHOOT_FACTOR * symbolHeight` past the true stop.
 *
 * Phase 2 – Settle (underdamped spring)
 *   A soft spring pulls the reel back from the overshoot to the exact stop.
 *
 * @param animValue  The Animated.Value controlling the reel's translateY.
 * @param stopValue  The final resting Y position (pixels from the top of the
 *                   strip, usually `stopIndex * symbolHeight`).
 * @param options    Optional config (see SpinReelOptions).
 */
export function spinReel(
  animValue: Animated.Value,
  stopValue: number,
  options: SpinReelOptions = {},
): void {
  const { symbolHeight = 80, onSettle } = options;

  // The overshoot target is slightly past the true stop (in the direction of
  // motion — downward, so positive offset for a downward-scrolling strip).
  const overshootAmount = OVERSHOOT_FACTOR * symbolHeight;
  const overshootTarget = stopValue + overshootAmount;

  // Apply drag: scale the launch velocity down by the drag coefficient so the
  // reel decelerates as if meeting mechanical resistance.
  const effectiveVelocity = LAUNCH_VELOCITY * DRAG_COEFFICIENT;

  // Phase 1: fast deceleration toward the overshoot target
  Animated.spring(animValue, {
    toValue: overshootTarget,
    ...DECEL_SPRING,
    velocity: effectiveVelocity,
    useNativeDriver: true,
  }).start(() => {
    // Phase 2: soft underdamped settle back to the true stop
    Animated.spring(animValue, {
      toValue: stopValue,
      ...SETTLE_SPRING,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        onSettle?.();
      }
    });
  });
}

/**
 * Instantly snap a reel to its stop position without any animation.
 * Useful during initial layout or when skipping animations (e.g. auto-play).
 */
export function snapReel(animValue: Animated.Value, stopValue: number): void {
  animValue.setValue(stopValue);
}

/**
 * Convert a reel strip stop index to a pixel offset.
 *
 * @param stopIndex    Integer stop index into the reel strip.
 * @param symbolHeight Pixel height of one symbol cell.
 * @returns            Pixel Y offset for `translateY`.
 */
export function stopIndexToY(stopIndex: number, symbolHeight: number): number {
  return -(stopIndex * symbolHeight);
}

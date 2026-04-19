/**
 * Aerospin – ThreeReelCanvas (native stub)
 * =========================================
 * On iOS/Android the Three.js canvas is not used — the existing
 * IndustrialCasinoDashboard React Native rendering handles everything.
 * This stub satisfies the import so native builds compile cleanly.
 *
 * The web implementation is in ThreeReelCanvas.web.tsx which Metro
 * automatically selects for the web platform bundle.
 */

import React from 'react';

export type SpinPhase = 'idle' | 'spinning' | 'settling';

export interface ThreeReelCanvasProps {
  /** 5-reel × 3-row symbol index grid (0–8). */
  visibleSymbols?: number[][];
  /** Current phase of the spin animation. */
  spinPhase?: SpinPhase;
  /** Monotonically-increasing spin counter used to seed the voxel RNG. */
  spinNumber?: number;
  /** GPS coordinate string, e.g. "51.5074°N  0.1278°W". */
  gpsCoord?: string;
  /** Called once the satellite → isometric camera tween completes. */
  onCameraTransitionEnd?: () => void;
}

/**
 * Native stub — renders nothing.
 * The full Three.js implementation lives in ThreeReelCanvas.web.tsx.
 */
export function ThreeReelCanvas(_props: ThreeReelCanvasProps): null {
  return null;
}

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

/**
 * Imperative API exposed by the Three.js canvas to parent components.
 * Delivered via the `onSceneReady` callback once the WebGL context is live.
 */
export interface ThreeSceneApi {
  /**
   * Placeholder: prepares the scene to swap a specific terrain tile for a
   * high-detail Luma/Splat hero asset.
   *
   * @param coords  GPS coordinate string identifying the real-world location.
   * @param tileIndex  0-based index into the 5×3 tile grid (default: 0).
   */
  loadHeroAsset(coords: string, tileIndex?: number): void;
}

export interface ThreeReelCanvasProps {
  /** 5-reel × 3-row symbol index grid (0–8). */
  visibleSymbols?: number[][];
  /** Current phase of the spin animation. */
  spinPhase?: SpinPhase;
  /** Monotonically-increasing spin counter used to seed the voxel RNG. */
  spinNumber?: number;
  /** GPS coordinate string, e.g. "51.5074°N  0.1278°W". */
  gpsCoord?: string;
  /**
   * When true, activates the X-Ray subsurface clip mode:
   *  – the main tile cubes are cross-sectioned by the clipping plane
   *  – the neon-green voxel sub-layer at y = -5 becomes visible
   */
  xrayActive?: boolean;
  /** Called once the satellite → isometric camera tween completes. */
  onCameraTransitionEnd?: () => void;
  /** Called once the WebGL scene is initialised, providing the imperative API. */
  onSceneReady?: (api: ThreeSceneApi) => void;
}

/**
 * Native stub — renders nothing.
 * The full Three.js implementation lives in ThreeReelCanvas.web.tsx.
 */
export function ThreeReelCanvas(_props: ThreeReelCanvasProps): null {
  return null;
}

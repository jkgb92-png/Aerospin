/**
 * Aerospin – useGoldenHourLight
 * ==============================
 * React hook that manages a dynamic directional light + hemisphere light on a
 * Three.js scene based on the player's local solar time, derived from the GPS
 * longitude.
 *
 * Light schedule
 * --------------
 *  06:00 – 08:00  Golden Dawn  – warm amber (#FFB347), low elevation
 *  08:00 – 17:00  Daylight     – white (#FFFFFF),     high elevation
 *  17:00 – 19:00  Golden Dusk  – coral sunset (#FF7F50), low elevation
 *  19:00 – 06:00  Night        – deep blue (#1A1A4E),  near-zero elevation
 *
 * Usage
 * -----
 * ```ts
 * const sceneRef = useRef<THREE.Scene>(null);
 * useGoldenHourLight(sceneRef, lon);   // lon from parsed GPS coord
 * ```
 */

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LightPreset {
  /** Hex colour for the directional light (sun/moon). */
  dirColour: number;
  /** Intensity of the directional light. */
  dirIntensity: number;
  /** Elevation of the sun above the horizon, in radians (0 = horizon, π/2 = zenith). */
  elevation: number;
  /** Sky colour for the hemisphere light. */
  skyColour: number;
  /** Ground colour for the hemisphere light. */
  groundColour: number;
}

// ---------------------------------------------------------------------------
// Preset builder
// ---------------------------------------------------------------------------

function getPreset(localHour: number): LightPreset {
  if (localHour >= 6 && localHour < 8) {
    // Golden Dawn
    const t = (localHour - 6) / 2; // 0→1 as hour progresses through window
    return {
      dirColour: 0xffb347,
      dirIntensity: 1.2 + t * 0.8,
      elevation: (Math.PI / 12) * (1 + t * 2), // 15° → 45°
      skyColour: 0xffd080,
      groundColour: 0x3d2a10,
    };
  }
  if (localHour >= 8 && localHour < 17) {
    // Daylight
    const t = (localHour - 8) / 9; // 0→1 as hour progresses through window
    // Sun arcs from 45° at 8:00 to ~80° at 12:30 then back to 45° at 17:00
    const arc = Math.sin(t * Math.PI); // 0 → 1 → 0
    return {
      dirColour: 0xffffff,
      dirIntensity: 2.0,
      elevation: Math.PI / 4 + arc * (Math.PI / 3.5),
      skyColour: 0xc0d8ff,
      groundColour: 0x4a5a2e,
    };
  }
  if (localHour >= 17 && localHour < 19) {
    // Golden Dusk
    const t = (localHour - 17) / 2;
    return {
      dirColour: 0xff7f50,
      dirIntensity: 1.2 - t * 0.8,
      elevation: (Math.PI / 12) * (3 - t * 2.5), // 45° → ~5°
      skyColour: 0xff9955,
      groundColour: 0x3d1a08,
    };
  }
  // Night (19:00 – 06:00)
  return {
    dirColour: 0x1a1a4e,
    dirIntensity: 0.3,
    elevation: 0.05,
    skyColour: 0x080820,
    groundColour: 0x101010,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const DIR_LIGHT_NAME = '__goldenHourDir__';
const HEMI_LIGHT_NAME = '__goldenHourHemi__';
/** Recalculate the light once per minute (sun moves ~0.25° per minute). */
const UPDATE_INTERVAL_MS = 60_000;

/**
 * Adds a directional + hemisphere light to `sceneRef.current` and updates
 * their colours and positions based on the player's local solar time.
 *
 * @param sceneRef  A React ref holding the live Three.js Scene.
 * @param lon       Longitude in decimal degrees (used for solar hour offset).
 */
export function useGoldenHourLight(
  sceneRef: React.MutableRefObject<THREE.Scene | null>,
  lon: number,
): void {
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const hemiLightRef = useRef<THREE.HemisphereLight | null>(null);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    // ── Create lights if not already present ─────────────────────────────
    let dirLight = scene.getObjectByName(DIR_LIGHT_NAME) as THREE.DirectionalLight | undefined;
    if (!dirLight) {
      dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
      dirLight.name = DIR_LIGHT_NAME;
      scene.add(dirLight);
    }
    dirLightRef.current = dirLight;

    let hemiLight = scene.getObjectByName(HEMI_LIGHT_NAME) as THREE.HemisphereLight | undefined;
    if (!hemiLight) {
      hemiLight = new THREE.HemisphereLight(0xc0d8ff, 0x4a5a2e, 0.8);
      hemiLight.name = HEMI_LIGHT_NAME;
      scene.add(hemiLight);
    }
    hemiLightRef.current = hemiLight;

    // ── Apply preset immediately then on a 60 s interval ─────────────────
    function applyPreset() {
      const scene = sceneRef.current;
      const dir = dirLightRef.current;
      const hemi = hemiLightRef.current;
      if (!scene || !dir || !hemi) return;

      // Local solar hour: actual UTC hour of day + longitude offset (15° per hour)
      const now = new Date();
      const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
      const localHour = ((utcHours + lon / 15) % 24 + 24) % 24;

      const preset = getPreset(localHour);

      // Update directional light colour and position
      dir.color.setHex(preset.dirColour);
      dir.intensity = preset.dirIntensity;
      // Place the light source above the scene on a hemisphere at `elevation`
      const radius = 15;
      dir.position.set(
        radius * Math.cos(preset.elevation),
        radius * Math.sin(preset.elevation),
        radius * 0.5,
      );
      dir.lookAt(0, 0, 0);

      // Update hemisphere light sky / ground colours
      hemi.color.setHex(preset.skyColour);
      hemi.groundColor.setHex(preset.groundColour);
    }

    applyPreset();
    const intervalId = setInterval(applyPreset, UPDATE_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [sceneRef, lon]);
}

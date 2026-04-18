/**
 * Aerospin – EarthBackdrop
 * ========================
 * Renders a live, slow-scrolling satellite tile layer of the player's current
 * location as the game's background.
 *
 * Location strategy (priority order)
 * -----------------------------------
 * 1. GPS via expo-location (most accurate; requires LOCATION_WHEN_IN_USE perm).
 * 2. IP geolocation fallback via the open ip-api.com JSON endpoint (no key
 *    required, coarse accuracy ~city level) if GPS is unavailable or denied.
 * 3. Hard-coded default (0 °N, 0 °E – Gulf of Guinea) if both fail.
 *
 * Tile source
 * -----------
 * Uses the Esri World Imagery tile layer (ArcGIS), a free satellite basemap
 * with no clouds and sub-metre resolution in populated areas.
 * URL template:
 *   https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/
 *          MapServer/tile/{z}/{y}/{x}
 *
 * Slow-scroll effect
 * ------------------
 * A 2×2 tile grid (each tile is 256 px) is rendered at zoom level 15 (~3 m/px).
 * An Animated loop drifts the grid 0.5 px/s south-east, giving the illusion
 * of looking down from a slow-moving satellite.  The grid wraps seamlessly
 * because adjacent tiles share edges.
 *
 * Dependencies (add to package.json)
 *   expo-location    ^16.x
 *   expo-image       ^1.x   (or plain <Image> from react-native)
 */

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Image, StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { PERFORMANCE_BUDGET, TOKENS } from './designTokens';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Tile pixel size at zoom 15. */
const TILE_SIZE = 256;

/** Zoom level: 15 gives ~3 m/px – urban ground detail without cloud noise. */
const ZOOM = 15;

/** Satellite tile URL template (Esri World Imagery – free, no API key). */
const TILE_URL = (z: number, x: number, y: number): string =>
  `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;

/** Pixels per second to drift the tile grid (simulates satellite movement). */
const SCROLL_SPEED_PX_PER_S = 0.5;

/** How many seconds for one full 256 px tile-width drift before resetting. */
const LOOP_DURATION_MS = (TILE_SIZE / SCROLL_SPEED_PX_PER_S) * 1000;

/** Default location (Royal Observatory, Greenwich) if all geolocation attempts fail. */
const DEFAULT_LAT = 51.4769;
const DEFAULT_LON = -0.0014;

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ---------------------------------------------------------------------------
// Geo → tile math (Web Mercator / Slippy Map)
// ---------------------------------------------------------------------------

function lon2tile(lon: number, zoom: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** zoom);
}

function lat2tile(lat: number, zoom: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) *
      2 ** zoom,
  );
}

// ---------------------------------------------------------------------------
// IP geolocation fallback
// ---------------------------------------------------------------------------

async function fetchIpLocation(): Promise<{ lat: number; lon: number }> {
  try {
    const resp = await fetch('https://ip-api.com/json/?fields=lat,lon,status');
    if (!resp.ok) throw new Error('ip-api non-200');
    const data = await resp.json();
    if (data.status !== 'success') throw new Error('ip-api failed');
    return { lat: data.lat as number, lon: data.lon as number };
  } catch {
    return { lat: DEFAULT_LAT, lon: DEFAULT_LON };
  }
}

// ---------------------------------------------------------------------------
// EarthBackdrop component
// ---------------------------------------------------------------------------

/**
 * EarthBackdrop fills the entire screen with a slow-scrolling satellite view
 * of the player's position.  Mount it behind all other game UI elements.
 *
 * @example
 * ```tsx
 * <View style={StyleSheet.absoluteFill}>
 *   <EarthBackdrop />
 *   <GameUI />
 * </View>
 * ```
 */
export function EarthBackdrop() {
  const [tileCoords, setTileCoords] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [useStaticFallback, setUseStaticFallback] = useState(false);
  const [tileLoadFailures, setTileLoadFailures] = useState(0);
  const scrollAnim = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  // ── 1. Resolve player location ──────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;

    async function resolve() {
      let lat = DEFAULT_LAT;
      let lon = DEFAULT_LON;

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          lat = loc.coords.latitude;
          lon = loc.coords.longitude;
        } else {
          // GPS denied – try IP
          const ip = await fetchIpLocation();
          lat = ip.lat;
          lon = ip.lon;
        }
      } catch {
        // Any error: try IP then fall back to default
        try {
          const ip = await fetchIpLocation();
          lat = ip.lat;
          lon = ip.lon;
        } catch {
          // stick with DEFAULT
        }
      }

      if (!cancelled) {
        setTileCoords({ x: lon2tile(lon, ZOOM), y: lat2tile(lat, ZOOM) });
        setUseStaticFallback(false);
        setTileLoadFailures(0);
      }
    }

    resolve();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── 2. Start slow-scroll loop once tiles are known ───────────────────────
  useEffect(() => {
    if (!tileCoords) return;
    if (useStaticFallback) return;

    scrollAnim.setValue(0);
    const loop = Animated.loop(
      Animated.timing(scrollAnim, {
        toValue: -TILE_SIZE,     // drift one full tile before reset
        duration: LOOP_DURATION_MS,
        useNativeDriver: true,
      }),
    );
    loopRef.current = loop;
    loop.start();

    return () => {
      loop.stop();
    };
  }, [tileCoords, scrollAnim, useStaticFallback]);

  // ── 3. Build tile grid (2 columns × 3 rows to fully cover any screen) ───
  if (!tileCoords || useStaticFallback) {
    return (
      <StaticWireframeBackdrop />
    );
  }

  const { x: tx, y: ty } = tileCoords;
  // Extra column & row so the scroll loop never shows a gap at the edges
  const requestedCols = Math.ceil(SCREEN_W / TILE_SIZE) + 2;
  const requestedRows = Math.ceil(SCREEN_H / TILE_SIZE) + 2;
  const maxCols = Math.max(2, Math.floor(Math.sqrt(PERFORMANCE_BUDGET.maxActiveTiles)));
  const cols = Math.min(requestedCols, maxCols);
  const rows = Math.max(
    2,
    Math.min(
      requestedRows,
      Math.floor(PERFORMANCE_BUDGET.maxActiveTiles / cols),
    ),
  );

  const tiles: React.ReactNode[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const uri = TILE_URL(ZOOM, tx + col, ty + row);
      tiles.push(
        <Image
          key={`${col}-${row}`}
          source={{ uri }}
          style={[
            styles.tile,
            { left: col * TILE_SIZE, top: row * TILE_SIZE },
          ]}
          resizeMode="cover"
          onError={() => {
            setTileLoadFailures((prev) => {
              const next = prev + 1;
              if (next >= PERFORMANCE_BUDGET.maxTileLoadFailuresBeforeFallback) {
                setUseStaticFallback(true);
              }
              return next;
            });
          }}
        />,
      );
    }
  }

  return (
    <View style={styles.container} pointerEvents="none">
      <Animated.View
        style={[
          styles.tileCanvas,
          { transform: [{ translateX: scrollAnim }, { translateY: scrollAnim }] },
        ]}
      >
        {tiles}
      </Animated.View>
      {/* Dim overlay so the satellite image doesn't overpower the game UI */}
      <View
        style={[
          styles.dimOverlay,
          { backgroundColor: `rgba(0, 0, 0, ${Math.min(0.55, 0.42 + tileLoadFailures * 0.01)})` },
        ]}
      />
    </View>
  );
}

function StaticWireframeBackdrop() {
  return (
    <View style={styles.placeholder}>
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`h${i}`} style={[styles.phGridLine, { top: `${(i + 1) * 11}%` }]} />
      ))}
      {Array.from({ length: 8 }).map((_, i) => (
        <View key={`v${i}`} style={[styles.phGridLineV, { left: `${(i + 1) * 11}%` }]} />
      ))}
      <View style={styles.placeholderDim} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
    zIndex: TOKENS.zIndex.backdrop,
  },
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#111510',
  },
  phGridLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: TOKENS.color.signalGreen,
    opacity: 0.12,
  },
  phGridLineV: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: TOKENS.color.signalGreen,
    opacity: 0.12,
  },
  placeholderDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  tileCanvas: {
    position: 'absolute',
    // Start one tile-width before the screen edge so scrolling left reveals tiles
    left: -TILE_SIZE,
    top: -TILE_SIZE,
  },
  tile: {
    position: 'absolute',
    width: TILE_SIZE,
    height: TILE_SIZE,
  },
  dimOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.42)',
  },
});

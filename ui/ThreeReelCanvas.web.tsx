/**
 * Aerospin – ThreeReelCanvas (web)
 * ==================================
 * Full Three.js scene for the web platform.  Metro automatically selects this
 * file over ThreeReelCanvas.tsx when building the web bundle.
 *
 * Features
 * --------
 *  • 5 × 3 satellite-tile terrain rendered as BoxGeometry cubes
 *  • Holographic wireframe overlay (ShaderMaterial with animated scanlines)
 *  • Dynamic Golden Hour lighting via useGoldenHourLight
 *  • Satellite → isometric camera fly-by when a spin starts
 *  • Voxelisation spin transition (random Y-scale scramble → settle)
 *  • Selective bloom targeting the holographic scanline colour only
 *  • Velocity-based motion blur (custom Effect, decays exponentially)
 *  • Chromatic aberration scaled by spin velocity
 *  • X-Ray subsurface clip plane (THREE.Plane, localClippingEnabled)
 *  • Voxel sub-layer grid at y = -5 (neon-green DataTexture, xray-only)
 *  • loadHeroAsset() placeholder for high-detail tile swaps
 */

import React, { useEffect, useRef } from 'react';
import { Dimensions, StyleSheet, View } from 'react-native';
import * as THREE from 'three';
import {
  ChromaticAberrationEffect,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  SelectiveBloomEffect,
} from 'postprocessing';
import { useGoldenHourLight } from './useGoldenHourLight';
import type { ThreeReelCanvasProps, ThreeSceneApi } from './ThreeReelCanvas';

export type { ThreeReelCanvasProps, ThreeSceneApi };

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const COLS = 5;
const ROWS = 3;
const TILE_W = 0.85;
const TILE_H = 0.85;
const TILE_D = 0.3;
const SPACING_X = 1.0;
const SPACING_Y = 1.0;

/** Y position of the voxel sub-layer grid. */
const SUBLAYER_Y = -5;

// ---------------------------------------------------------------------------
// Camera positions
// ---------------------------------------------------------------------------

const CAM_SATELLITE = new THREE.Vector3(0, 20, 0.001); // top-down (+epsilon to avoid gimbal)
const CAM_ISOMETRIC = new THREE.Vector3(8, 8, 8);      // 45° industrial view
const CAM_LOOK_AT   = new THREE.Vector3(0, 0, 0);
const CAM_TWEEN_S   = 1.2; // seconds for satellite → isometric tween

// ---------------------------------------------------------------------------
// Holographic wireframe ShaderMaterial (scanline + edge glow)
// Colour: #00FF88 – selected for bloom by SelectiveBloomEffect
// ---------------------------------------------------------------------------

const WIRE_VERT = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const WIRE_FRAG = `
uniform float uTime;
varying vec2 vUv;

void main() {
  // Animate scanlines scrolling upward: 1 tile per 4 seconds
  float scroll = mod(vUv.y + uTime * 0.25, 1.0);
  // Draw a thin scanline every 1/10th of the UV tile
  float line = mod(scroll * 10.0, 1.0);
  float intensity = step(0.0, line) * step(line, 0.06);

  // Soft edge glow near UV borders
  float edgeX = min(vUv.x, 1.0 - vUv.x);
  float edgeY = min(vUv.y, 1.0 - vUv.y);
  float edge = 1.0 - smoothstep(0.0, 0.08, min(edgeX, edgeY));

  float alpha = max(intensity * 0.6, edge * 0.35);
  if (alpha < 0.01) discard;
  // Full-brightness #00FF88 so SelectiveBloom picks it up cleanly
  gl_FragColor = vec4(0.0, 1.0, 0.533, alpha);
}
`;

// ---------------------------------------------------------------------------
// VelocityBlurEffect – custom postprocessing Effect
// ---------------------------------------------------------------------------

const BLUR_FRAG = `
uniform float uBlurStrength;

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  if (uBlurStrength < 0.005) {
    outputColor = inputColor;
    return;
  }
  vec4 color = vec4(0.0);
  float weight = 0.0;
  for (float i = -3.0; i <= 3.0; i += 1.0) {
    vec2 sampleUv = vec2(uv.x, uv.y + i * uBlurStrength * 0.018);
    sampleUv = clamp(sampleUv, 0.001, 0.999);
    color += texture2D(inputBuffer, sampleUv);
    weight += 1.0;
  }
  outputColor = color / weight;
}
`;

class VelocityBlurEffect extends Effect {
  private _blurUniform: THREE.Uniform<number>;

  constructor() {
    const uniforms = new Map<string, THREE.Uniform<number>>([
      ['uBlurStrength', new THREE.Uniform(0.0)],
    ]);
    super('VelocityBlurEffect', BLUR_FRAG, { uniforms });
    this._blurUniform = uniforms.get('uBlurStrength')!;
  }

  setStrength(v: number): void {
    this._blurUniform.value = v;
  }
}

// ---------------------------------------------------------------------------
// Seeded RNG (mulberry32) for deterministic voxel heights per spin
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed;
  return function () {
    s += 0x6d2b79f5;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// GPS longitude parser
// ---------------------------------------------------------------------------

function parseLon(gpsCoord: string): number {
  const m = gpsCoord.match(/(\d+\.?\d*)°([EW])/i);
  if (!m) return 0;
  const v = parseFloat(m[1]);
  return m[2].toUpperCase() === 'W' ? -v : v;
}

// ---------------------------------------------------------------------------
// Voxel sub-layer texture
// Generates a 16 × 16 DataTexture with a neon-green (#00FF88) voxel-grid
// pattern on a near-black background.
// ---------------------------------------------------------------------------

function buildVoxelTexture(): THREE.DataTexture {
  const SIZE = 16;
  const BORDER = 1; // 1-pixel black border around each voxel cell
  const data = new Uint8Array(SIZE * SIZE * 4);

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const idx = (y * SIZE + x) * 4;
      const onBorder = x % 4 < BORDER || y % 4 < BORDER;
      // #00FF88 = R:0, G:255, B:136. Border cells use a darker shade (R:0, G:180, B:60)
      // so the grid lines read as deep green against the bright neon fill.
      data[idx]     = 0;                       // R (both branches)
      data[idx + 1] = onBorder ? 180 : 255;   // G – bright fill / dimmer border
      data[idx + 2] = onBorder ? 60  : 136;   // B – #00FF88 fill / dark-green border
      data[idx + 3] = 255;                     // A
    }
  }

  const tex = new THREE.DataTexture(data, SIZE, SIZE, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// ThreeReelCanvas component
// ---------------------------------------------------------------------------

/**
 * ThreeReelCanvas (web)
 *
 * Hosts a vanilla Three.js WebGLRenderer canvas inside an Expo web View.
 * All Three.js lifecycle (scene, lights, RAF loop, post-processing) is
 * managed inside a single useEffect that tears down cleanly on unmount.
 */
export function ThreeReelCanvas({
  spinPhase = 'idle',
  spinNumber = 0,
  gpsCoord = '51.5074°N  0.1278°W',
  xrayActive = false,
  onCameraTransitionEnd,
  onSceneReady,
}: ThreeReelCanvasProps) {
  const containerRef = useRef<View>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const spinPhaseRef = useRef(spinPhase);
  const spinNumberRef = useRef(spinNumber);
  const xrayActiveRef = useRef(xrayActive);
  // Stable refs for callbacks so the RAF loop always calls the latest version
  const onCameraTransitionEndRef = useRef(onCameraTransitionEnd);
  const onSceneReadyRef = useRef(onSceneReady);

  // Keep refs in sync with latest props (accessed inside RAF loop)
  useEffect(() => { spinPhaseRef.current = spinPhase; }, [spinPhase]);
  useEffect(() => { spinNumberRef.current = spinNumber; }, [spinNumber]);
  useEffect(() => { xrayActiveRef.current = xrayActive; }, [xrayActive]);
  useEffect(() => { onCameraTransitionEndRef.current = onCameraTransitionEnd; }, [onCameraTransitionEnd]);
  useEffect(() => { onSceneReadyRef.current = onSceneReady; }, [onSceneReady]);

  // Longitude for golden-hour light
  const lon = parseLon(gpsCoord);
  useGoldenHourLight(sceneRef, lon);

  useEffect(() => {
    // ── 0. DOM container ──────────────────────────────────────────────────
    const container = containerRef.current as unknown as HTMLDivElement;
    if (!container) return;

    const { width: W, height: H } = Dimensions.get('window');
    const w = container.clientWidth || W;
    const h = container.clientHeight || H;

    // ── 1. Renderer ───────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(w, h);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    // Enable per-material clipping planes for the X-Ray subsurface mode.
    // Without this flag Three.js ignores material.clippingPlanes entirely.
    renderer.localClippingEnabled = true;
    container.appendChild(renderer.domElement);

    // ── 2. Scene ──────────────────────────────────────────────────────────
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f0a);
    sceneRef.current = scene;

    // Ambient light – always present so MeshStandardMaterial tiles are never black
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    scene.add(ambient);

    // ── 3. Camera ─────────────────────────────────────────────────────────
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    camera.position.copy(CAM_ISOMETRIC);
    camera.lookAt(CAM_LOOK_AT);

    // Camera tween state
    let camTweenActive = false;
    let camTweenT = 1.0; // 1 = at isometric, 0 = at satellite
    const camFrom = new THREE.Vector3();
    const camTo = new THREE.Vector3();

    function startCameraTween(from: THREE.Vector3, to: THREE.Vector3) {
      camFrom.copy(from);
      camTo.copy(to);
      camTweenT = 0;
      camTweenActive = true;
    }

    // ── 4a. X-Ray subsurface clipping plane ───────────────────────────────
    // The plane equation is: normal · point + constant ≥ 0 → visible.
    // Normal (0, 1, 0) + constant = 0 → visible region: y ≥ 0.
    // When xray is active this clips the lower halves of all main tiles,
    // revealing the sub-layer grid sitting at y = SUBLAYER_Y below them.
    const xrayClipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    // ── 4b. Main-tile terrain ─────────────────────────────────────────────
    const tileGeom = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
    const wireGeom = new THREE.PlaneGeometry(TILE_W - 0.04, TILE_H - 0.04);

    const tileGroups: THREE.Group[] = [];
    // Collect wireframe overlay meshes for SelectiveBloom targeting
    const wireOverlays: THREE.Mesh[] = [];

    // Emissive base colour prevents black tiles when lighting is dim.
    // clippingPlanes is populated only while xray mode is active (see RAF loop).
    const tileMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e3d2e,
      emissive: new THREE.Color(0x1a2a1a),
      emissiveIntensity: 0.6,
      metalness: 0.4,
      roughness: 0.7,
      clippingPlanes: [], // filled when xrayActive
    });

    const wireUniforms = {
      uTime: { value: 0 },
    };
    const wireMaterial = new THREE.ShaderMaterial({
      vertexShader: WIRE_VERT,
      fragmentShader: WIRE_FRAG,
      uniforms: wireUniforms,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
    });

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const group = new THREE.Group();
        group.position.set(
          (col - 2) * SPACING_X,
          (1 - row) * SPACING_Y,
          0,
        );

        // Main cube
        const mesh = new THREE.Mesh(tileGeom, tileMaterial);
        group.add(mesh);

        // Holographic wireframe overlay (slightly in front of the tile face)
        const overlay = new THREE.Mesh(wireGeom, wireMaterial);
        overlay.position.z = TILE_D / 2 + 0.005;
        overlay.renderOrder = 1;
        group.add(overlay);
        wireOverlays.push(overlay);

        scene.add(group);
        tileGroups.push(group);
      }
    }

    // ── 4c. Voxel sub-layer grid ──────────────────────────────────────────
    // A second 5 × 3 grid of tiles positioned at y = SUBLAYER_Y (-5).
    // Only visible when xrayActive is true so the X-Ray clip cross-section
    // reveals this "underground" terrain layer.
    const voxelTexture = buildVoxelTexture();
    const sublayerGeom = new THREE.BoxGeometry(TILE_W, TILE_H * 0.5, TILE_D * 0.6);
    const sublayerMaterial = new THREE.MeshStandardMaterial({
      map: voxelTexture,
      emissive: new THREE.Color(0x00ff88),
      emissiveIntensity: 0.45,
      metalness: 0.1,
      roughness: 0.5,
    });

    const sublayerGroup = new THREE.Group();
    sublayerGroup.position.y = SUBLAYER_Y;
    sublayerGroup.visible = false; // only shown when xrayActive

    for (let col = 0; col < COLS; col++) {
      for (let row = 0; row < ROWS; row++) {
        const mesh = new THREE.Mesh(sublayerGeom, sublayerMaterial);
        mesh.position.set(
          (col - 2) * SPACING_X,
          (1 - row) * SPACING_Y,
          0,
        );
        sublayerGroup.add(mesh);
      }
    }
    scene.add(sublayerGroup);

    // ── 5. Post-processing (SelectiveBloom) ───────────────────────────────
    // SelectiveBloomEffect restricts the bloom glow to a specific set of
    // scene objects.  By adding only the holographic wireframe overlay meshes
    // we guarantee that the #00FF88 scanlines bleed off screen while the
    // rest of the scene (tiles, terrain) is not over-bloomed.
    const composer = new EffectComposer(renderer);
    composer.addPass(new RenderPass(scene, camera));

    const blurEffect = new VelocityBlurEffect();

    const bloomEffect = new SelectiveBloomEffect(scene, camera, {
      luminanceThreshold: 0.25, // lower than global BloomEffect so the green
      luminanceSmoothing: 0.1,  // scanlines always qualify even at lower brightness
      intensity: 2.0,           // stronger glow since selection is narrow
      mipmapBlur: true,
    });
    // Add every holographic overlay mesh to the bloom selection.
    // Selection is a Set<Object3D>; SelectiveBloomEffect renders bloom only
    // on geometry that belongs to this set.
    wireOverlays.forEach((m) => bloomEffect.selection.add(m));

    const aberrationEffect = new ChromaticAberrationEffect({
      offset: new THREE.Vector2(0, 0),
      radialModulation: true,
      modulationOffset: 0.15,
    });

    // Order: blur → selective bloom → aberration
    composer.addPass(new EffectPass(camera, blurEffect, bloomEffect, aberrationEffect));

    // ── 6. Voxelisation state ─────────────────────────────────────────────
    let voxelTargetScales: number[] = tileGroups.map(() => 1);
    let voxelCurrentScales: number[] = tileGroups.map(() => 1);
    let prevSpinPhase: typeof spinPhase = 'idle';

    function setVoxelTargets(spinNum: number) {
      const rng = mulberry32(spinNum * 0x9e3779b9);
      voxelTargetScales = tileGroups.map(() => 0.2 + rng() * 2.8);
    }

    // ── 7. Velocity / blur state ──────────────────────────────────────────
    let spinVelocity = 0;

    // ── 8. Hero asset registry ────────────────────────────────────────────
    // Stores pending hero-asset tile swaps; processed in the RAF loop so
    // scene mutations happen on the render thread.
    const pendingHeroSwaps: Array<{ tileIndex: number; coords: string }> = [];

    // ── 9. Scene API ──────────────────────────────────────────────────────
    const sceneApi: ThreeSceneApi = {
      loadHeroAsset(coords, tileIndex = 0) {
        if (__DEV__) {
          console.log(
            `[ThreeReelCanvas] loadHeroAsset coords="${coords}" tile=${tileIndex}`,
          );
        }
        // Queue the swap to be processed on the next animation frame so we
        // never mutate scene objects from outside the render loop.
        pendingHeroSwaps.push({ tileIndex, coords });
      },
    };
    // ── 10. RAF loop ──────────────────────────────────────────────────────
    let raf: number;
    let lastTime = performance.now();
    let transitionEndFired = false;
    let prevXrayActive = false;

    function frame() {
      raf = requestAnimationFrame(frame);

      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.1); // cap at 100 ms
      lastTime = now;

      const phase = spinPhaseRef.current;
      const xray = xrayActiveRef.current;

      // ── Camera tween ──────────────────────────────────────────────────
      if (phase === 'spinning' && prevSpinPhase !== 'spinning') {
        // Snap to satellite, then tween to isometric
        camera.position.copy(CAM_SATELLITE);
        camera.lookAt(CAM_LOOK_AT);
        startCameraTween(CAM_SATELLITE, CAM_ISOMETRIC);
        transitionEndFired = false;
        spinVelocity = 1.0;
      }

      if (camTweenActive) {
        camTweenT = Math.min(camTweenT + dt / CAM_TWEEN_S, 1);
        // Ease-out cubic
        const ease = 1 - Math.pow(1 - camTweenT, 3);
        camera.position.lerpVectors(camFrom, camTo, ease);
        camera.lookAt(CAM_LOOK_AT);
        if (camTweenT >= 1) {
          camTweenActive = false;
          if (!transitionEndFired) {
            transitionEndFired = true;
            onCameraTransitionEndRef.current?.();
          }
        }
      }

      // ── X-Ray clip plane ──────────────────────────────────────────────
      if (xray !== prevXrayActive) {
        if (xray) {
          // Apply the clip plane to main tiles: clips everything below y=0,
          // exposing the sub-layer beneath.
          tileMaterial.clippingPlanes = [xrayClipPlane];
          sublayerGroup.visible = true;
        } else {
          tileMaterial.clippingPlanes = [];
          sublayerGroup.visible = false;
        }
        tileMaterial.needsUpdate = true;
        prevXrayActive = xray;
      }

      // ── Hero asset swaps ──────────────────────────────────────────────
      while (pendingHeroSwaps.length > 0) {
        const swap = pendingHeroSwaps.shift()!;
        const group = tileGroups[swap.tileIndex];
        if (group) {
          // Replace the main tile mesh material with a high-emissive
          // "hero" placeholder that signals where a Luma/Splat asset would
          // be loaded in the full implementation.
          const heroMaterial = new THREE.MeshStandardMaterial({
            color: 0xffd700,           // gold tint as a visible placeholder
            emissive: new THREE.Color(0x553300),
            emissiveIntensity: 0.9,
            metalness: 0.8,
            roughness: 0.2,
          });
          // Replace the mesh material on the first child (the tile cube)
          const tileMesh = group.children[0] as THREE.Mesh;
          if (tileMesh?.isMesh) {
            tileMesh.material = heroMaterial;
          }
          if (__DEV__) {
            console.log(
              `[ThreeReelCanvas] Hero asset placeholder applied to tile ${swap.tileIndex} (coords: ${swap.coords})`,
            );
          }
        }
      }

      // ── Voxelisation ──────────────────────────────────────────────────
      if (phase === 'spinning' && prevSpinPhase !== 'spinning') {
        setVoxelTargets(spinNumberRef.current);
      }
      if (phase === 'settling' && prevSpinPhase === 'spinning') {
        voxelTargetScales = tileGroups.map(() => 1);
      }

      const lerpSpeed = phase === 'spinning' ? dt / 0.3 : phase === 'settling' ? dt / 0.6 : dt / 0.2;
      tileGroups.forEach((g, i) => {
        const target = phase === 'idle' ? 1 : voxelTargetScales[i] ?? 1;
        voxelCurrentScales[i] = THREE.MathUtils.lerp(voxelCurrentScales[i] ?? 1, target, Math.min(lerpSpeed, 1));
        g.scale.y = voxelCurrentScales[i];
      });

      prevSpinPhase = phase;

      // ── Spin velocity decay ───────────────────────────────────────────
      if (phase === 'spinning') {
        spinVelocity = 1.0;
      } else {
        spinVelocity *= Math.exp(-dt * 3.0); // exponential decay, halves in ~0.23 s
        if (spinVelocity < 0.005) spinVelocity = 0;
      }

      // ── Post-processing uniforms ──────────────────────────────────────
      blurEffect.setStrength(spinVelocity);
      aberrationEffect.offset.set(spinVelocity * 0.006, spinVelocity * 0.003);

      // ── Wireframe scanline time uniform ───────────────────────────────
      wireUniforms.uTime.value += dt;

      // ── Render ────────────────────────────────────────────────────────
      composer.render();
    }

    raf = requestAnimationFrame(frame);

    // Deliver the imperative API now that the scene and RAF loop are fully
    // initialised — the first frame will already have run before any external
    // caller can act on the API.
    onSceneReadyRef.current?.(sceneApi);

    // ── 11. Resize handling ───────────────────────────────────────────────
    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          renderer.setSize(width, height);
          composer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
        }
      });
      resizeObserver.observe(container);
    }

    // ── 12. Cleanup ───────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(raf);
      resizeObserver?.disconnect();
      composer.dispose();
      renderer.dispose();
      tileGeom.dispose();
      wireGeom.dispose();
      tileMaterial.dispose();
      wireMaterial.dispose();
      blurEffect.dispose();
      bloomEffect.dispose();
      aberrationEffect.dispose();
      sublayerGeom.dispose();
      sublayerMaterial.dispose();
      voxelTexture.dispose();
      if (container.contains(renderer.domElement)) {
        container.removeChild(renderer.domElement);
      }
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intentionally empty – inner refs track live prop values

  return (
    <View
      ref={containerRef}
      style={styles.canvas}
      // Prevent the canvas from intercepting touch events on the dashboard
      pointerEvents="none"
    />
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5, // above backdrop (0), below dashboard (10)
  },
});

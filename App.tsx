import React, { Component, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { EarthBackdrop } from './ui/EarthBackdrop';
import { IndustrialCasinoDashboard } from './ui/IndustrialCasinoDashboard';
import { FloatingHUD, SpinRecord } from './ui/FloatingHUD';
import { ThreeReelCanvas, ThreeSceneApi, SpinPhase } from './ui/ThreeReelCanvas';
import { WinFlashOverlay } from './ui/WinFlashOverlay';
import {
  loadSounds,
  unloadSounds,
  playSound,
  playReelSettleSequence,
  primeAudioForUserGesture,
  SoundEvent,
} from './ui/SoundDesign';
import { TOKENS } from './ui/designTokens';

// ---------------------------------------------------------------------------
// Sample data – replace with real game state / state management
// ---------------------------------------------------------------------------

const SAMPLE_SPINS: SpinRecord[] = [
  { spinNumber: 1, bet: 1.00, payout: 0.00,  net: -1.00, winSymbol: null,  winLines: 0 },
  { spinNumber: 2, bet: 1.00, payout: 2.50,  net:  1.50, winSymbol: '🏗',  winLines: 2 },
  { spinNumber: 3, bet: 1.00, payout: 0.00,  net: -1.00, winSymbol: null,  winLines: 0 },
  { spinNumber: 4, bet: 1.00, payout: 5.00,  net:  4.00, winSymbol: '📡',  winLines: 3 },
  { spinNumber: 5, bet: 1.00, payout: 0.00,  net: -1.00, winSymbol: null,  winLines: 0 },
];

// 5-reel × 3-row idle symbol grid (indices into INDUSTRIAL_SYMBOLS)
const IDLE_SYMBOLS: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [1, 3, 5],
  [2, 4, 6],
];

// ---------------------------------------------------------------------------
// ErrorBoundary – catches render-phase exceptions so the screen never goes
// fully blank.  Shows a styled fallback instead of a white void.
// ---------------------------------------------------------------------------

interface EBState { error: Error | null }

class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null };

  static getDerivedStateFromError(error: Error): EBState {
    return { error };
  }

  render() {
    const { error } = this.state;
    if (error) {
      return (
        <View style={errStyles.container}>
          <Text style={errStyles.title}>⚠  SYSTEM ERROR</Text>
          <Text style={errStyles.message}>{error.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const errStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1C1C1C',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: '#D4860A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  message: {
    color: '#D8D4CC',
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.75,
    lineHeight: 20,
  },
});

// ---------------------------------------------------------------------------
// GPS coordinate used across components
// ---------------------------------------------------------------------------

const GPS_COORD = '51.5074°N  0.1278°W';

// ---------------------------------------------------------------------------
// App root
// ---------------------------------------------------------------------------

export default function App() {
  const [credits] = useState(1250);
  const [totalWin] = useState(12.50);
  const [spinPhase, setSpinPhase] = useState<SpinPhase>('idle');
  const [spinNumber, setSpinNumber] = useState(0);
  const [isWin, setIsWin] = useState(false);
  const [xrayActive, setXrayActive] = useState(false);
  const sceneApiRef = useRef<ThreeSceneApi | null>(null);
  const soundsReady = useRef(false);

  // On web: prevent the page from scrolling so the full-screen canvas and
  // absolutely-positioned UI layers don't overflow the visible viewport.
  // react-native-web renders into a div that can grow beyond 100 vh when
  // flex children have non-zero intrinsic heights, making the page
  // scrollable and revealing a "ghost" duplicate of the canvas below the fold.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const { documentElement: html, body } = document;
      html.style.height = '100%';
      html.style.overflow = 'hidden';
      body.style.height = '100%';
      body.style.overflow = 'hidden';
      body.style.margin = '0';
    }
  }, []);

  // Load sounds once on mount; unload on unmount.
  // On web, loadSounds() itself is safe before any user gesture – only
  // playback (triggered by the SPIN button) requires a prior gesture.
  useEffect(() => {
    let mounted = true;
    loadSounds()
      .then(() => {
        if (mounted) soundsReady.current = true;
      })
      .catch(() => {
        // Non-fatal: audio will be silently absent if loading fails
        // (e.g. unsupported platform, missing permissions)
      });
    return () => {
      mounted = false;
      unloadSounds().catch(() => {});
    };
  }, []);

  const handleSceneReady = useCallback((api: ThreeSceneApi) => {
    sceneApiRef.current = api;
  }, []);

  const handleSpin = useCallback(() => {
    // Advance spin counter and trigger the Three.js camera + voxel transition
    const nextSpin = spinNumber + 1;
    setSpinNumber(nextSpin);
    setSpinPhase('spinning');
    setIsWin(false);

    if (!soundsReady.current) return;
    primeAudioForUserGesture()
      .then(() => playSound(SoundEvent.REEL_SPIN))
      .then(() => {
        // Simulate reel settling after ~1.8 s
        setTimeout(() => {
          setSpinPhase('settling');
          playReelSettleSequence(5);
          // Determine a mock win on every 4th spin for demo
          if (nextSpin % 4 === 0) {
            setIsWin(true);
            playSound(SoundEvent.WIN).catch(() => {});
          }
          // Return to idle after settle animation
          setTimeout(() => {
            setSpinPhase('idle');
            setIsWin(false);
          }, 800);
        }, 1800);
      })
      .catch(() => {});
  }, [soundsReady, spinNumber]);

  return (
    <ErrorBoundary>
      <View style={styles.root}>
        {/* Satellite tile backdrop (fills behind all other UI) */}
        <EarthBackdrop />

        {/* Three.js 3-D reel canvas – web only (native stub renders nothing) */}
        {Platform.OS === 'web' && (
          <ErrorBoundary>
            <ThreeReelCanvas
              spinPhase={spinPhase}
              spinNumber={spinNumber}
              gpsCoord={GPS_COORD}
              xrayActive={xrayActive}
              onSceneReady={handleSceneReady}
            />
          </ErrorBoundary>
        )}

        {/* Main casino dashboard */}
        <IndustrialCasinoDashboard
          credits={credits}
          totalWin={totalWin}
          visibleSymbols={IDLE_SYMBOLS}
          onSpin={handleSpin}
        />

        {/* Win flash overlay – screen-shake + neon border pulse */}
        <WinFlashOverlay isWin={isWin} />

        {/* Gyro-tilt HUD overlay pinned to the bottom */}
        <FloatingHUD
          credits={credits}
          gpsCoord={GPS_COORD}
          totalWin={totalWin}
          spinHistory={SAMPLE_SPINS}
        />

        <StatusBar style="light" />
      </View>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: TOKENS.color.charcoal,
    overflow: 'hidden',
  },
});

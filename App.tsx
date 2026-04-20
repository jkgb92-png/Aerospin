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
import { spinIndustrial } from './ui/slotEngine';
import { TOKENS } from './ui/designTokens';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BET_SIZE = 1.0;
const STARTING_CREDITS = 1250;
const MAX_SPIN_HISTORY = 10;

// Emoji glyphs for each Industrial symbol index (matches INDUSTRIAL_SYMBOLS
// in IndustrialCasinoDashboard.tsx).
const INDUSTRIAL_GLYPHS = ['📄', '🛢', '📍', '🔩', '🏗', '📦', '🗝', '📡', '🛸'];

// 5-reel × 3-row idle symbol grid displayed before the first spin
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
  const [credits, setCredits] = useState(STARTING_CREDITS);
  const [totalWin, setTotalWin] = useState(0);
  const [visibleSymbols, setVisibleSymbols] = useState<number[][]>(IDLE_SYMBOLS);
  const [winningReels, setWinningReels] = useState<Set<number>>(new Set());
  const [spinHistory, setSpinHistory] = useState<SpinRecord[]>([]);
  const [spinPhase, setSpinPhase] = useState<SpinPhase>('idle');
  const [spinNumber, setSpinNumber] = useState(0);
  const [isWin, setIsWin] = useState(false);
  const [xrayActive, setXrayActive] = useState(false);
  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState(0);
  const sceneApiRef = useRef<ThreeSceneApi | null>(null);
  const soundsReady = useRef(false);
  // Ref mirrors so setTimeout/useEffect closures always see the latest values.
  const freeSpinsRemainingRef = useRef(0);
  const pendingAutoSpinRef = useRef(false);

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

  /**
   * Advance the free-spins countdown after a spin settles.
   * Decrements the remaining count, deactivates X-Ray when exhausted, and
   * queues the next auto-spin via pendingAutoSpinRef.
   */
  const advanceFreeSpin = useCallback(() => {
    if (freeSpinsRemainingRef.current <= 0) return;
    const next = freeSpinsRemainingRef.current - 1;
    freeSpinsRemainingRef.current = next;
    setFreeSpinsRemaining(next);
    if (next === 0) {
      setXrayActive(false);
    }
    pendingAutoSpinRef.current = true;
  }, []);

  // Fire an auto-spin when the phase returns to idle and a free spin is queued.
  useEffect(() => {
    if (spinPhase === 'idle' && pendingAutoSpinRef.current) {
      pendingAutoSpinRef.current = false;
      const t = setTimeout(() => handleSpin(), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  // handleSpin is intentionally omitted from deps: the ref pattern below
  // ensures the latest version is always called without re-subscribing.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinPhase]);

  const handleSpin = useCallback(() => {
    // Block re-entry while a spin is already in progress.
    if (spinPhase !== 'idle') return;

    const isFreeSpin = freeSpinsRemainingRef.current > 0;

    // Refuse paid spins when the player is out of credits.
    if (!isFreeSpin && credits < BET_SIZE) return;

    const nextSpin = spinNumber + 1;
    setSpinNumber(nextSpin);
    setSpinPhase('spinning');
    setIsWin(false);
    setWinningReels(new Set());

    // Deduct bet only for paid (non-free) spins.
    if (!isFreeSpin) {
      setCredits(c => c - BET_SIZE);
    }

    // Determine result now (deterministic at spin start; result revealed on settle)
    const result = spinIndustrial(BET_SIZE);

    // Update symbol grid so the Three.js voxel heights react to the new spin
    setVisibleSymbols(result.grid);

    // Trigger audio if available (non-fatal if sounds are not loaded yet)
    if (soundsReady.current) {
      primeAudioForUserGesture()
        .then(() => playSound(SoundEvent.REEL_SPIN))
        .catch(() => {});
    }

    // After reels stop (~1.8 s): reveal outcome
    setTimeout(() => {
      setSpinPhase('settling');
      if (soundsReady.current) playReelSettleSequence(5);

      if (result.payout > 0) {
        setCredits(c => c + result.payout);
        setTotalWin(w => w + result.payout);
        setIsWin(true);
        setWinningReels(result.winningReels);
        if (soundsReady.current) playSound(SoundEvent.WIN).catch(() => {});
      }

      // Free spins bonus: trigger on 3+ scatters (only if not already in bonus).
      if (result.freeSpinsTriggered && freeSpinsRemainingRef.current === 0) {
        const FREE_SPIN_COUNT = 3;
        freeSpinsRemainingRef.current = FREE_SPIN_COUNT;
        setFreeSpinsRemaining(FREE_SPIN_COUNT);
        setXrayActive(true);
        if (soundsReady.current) playSound(SoundEvent.FREE_SPINS).catch(() => {});
      }

      // Record this spin in history (keep last MAX_SPIN_HISTORY entries)
      setSpinHistory(prev => {
        const winSym =
          result.topWinSymbolIndex !== null
            ? (INDUSTRIAL_GLYPHS[result.topWinSymbolIndex] ?? null)
            : null;
        const record: SpinRecord = {
          spinNumber: nextSpin,
          bet: isFreeSpin ? 0 : BET_SIZE,
          payout: result.payout,
          net: result.payout - (isFreeSpin ? 0 : BET_SIZE),
          winSymbol: winSym,
          winLines: result.winLines,
        };
        return [...prev.slice(-(MAX_SPIN_HISTORY - 1)), record];
      });

      // Return to idle after settle animation; schedule next free spin if any.
      setTimeout(() => {
        setSpinPhase('idle');
        setIsWin(false);
        setWinningReels(new Set());

        if (freeSpinsRemainingRef.current > 0) {
          advanceFreeSpin();
        }
      }, 800);
    }, 1800);
  }, [advanceFreeSpin, credits, spinNumber, spinPhase]);

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
          visibleSymbols={visibleSymbols}
          winningReels={winningReels}
          spinning={spinPhase !== 'idle'}
          freeSpinsRemaining={freeSpinsRemaining}
          onSpin={handleSpin}
        />

        {/* Win flash overlay – screen-shake + neon border pulse */}
        <WinFlashOverlay isWin={isWin} />

        {/* Gyro-tilt HUD overlay pinned to the bottom */}
        <FloatingHUD
          credits={credits}
          gpsCoord={GPS_COORD}
          totalWin={totalWin}
          spinHistory={spinHistory}
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

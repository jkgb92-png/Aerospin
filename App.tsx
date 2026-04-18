import React, { Component, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { EarthBackdrop } from './ui/EarthBackdrop';
import { IndustrialCasinoDashboard } from './ui/IndustrialCasinoDashboard';
import { FloatingHUD, SpinRecord } from './ui/FloatingHUD';
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
// App root
// ---------------------------------------------------------------------------

export default function App() {
  const [credits] = useState(1250);
  const [totalWin] = useState(12.50);
  const soundsReady = useRef(false);

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

  const handleSpin = useCallback(() => {
    if (!soundsReady.current) return;
    primeAudioForUserGesture()
      .then(() => playSound(SoundEvent.REEL_SPIN))
      .then(() => playReelSettleSequence(5))
      .catch(() => {});
  }, []);

  return (
    <ErrorBoundary>
      <View style={styles.root}>
        {/* Satellite tile backdrop (fills behind all other UI) */}
        <EarthBackdrop />

        {/* Main casino dashboard */}
        <IndustrialCasinoDashboard
          credits={credits}
          totalWin={totalWin}
          visibleSymbols={IDLE_SYMBOLS}
          onSpin={handleSpin}
        />

        {/* Gyro-tilt HUD overlay pinned to the bottom */}
        <FloatingHUD
          credits={credits}
          gpsCoord="51.5074°N  0.1278°W"
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
    zIndex: TOKENS.zIndex.dashboard,
  },
});

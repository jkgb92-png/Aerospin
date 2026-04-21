import React, { Component, ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';

import { EarthBackdrop } from './ui/EarthBackdrop';
import { CasinoDashboard } from './ui/CasinoDashboard';
import { FloatingHUD, SpinRecord } from './ui/FloatingHUD';
import { ThreeReelCanvas, ThreeSceneApi, SpinPhase } from './ui/ThreeReelCanvas';
import { WinCelebration } from './ui/WinCelebration';
import { ParticleField } from './ui/ParticleField';
import {
  loadSounds,
  unloadSounds,
  playSound,
  playReelSettleSequence,
  primeAudioForUserGesture,
  SoundEvent,
} from './ui/SoundDesign';
import { spinIndustrial, getJackpotPool } from './ui/slotEngine';
import { TOKENS } from './ui/designTokens';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STARTING_CREDITS = 1250;
const MAX_SPIN_HISTORY = 10;

const CASINO_GLYPHS = ['🍒', '🍋', '🍊', '🔔', '⭐', '💎', '7️⃣', '🎯', '🌟'];

const IDLE_SYMBOLS: number[][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [1, 3, 5],
  [2, 4, 6],
];

// ---------------------------------------------------------------------------
// ErrorBoundary
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
    backgroundColor: TOKENS.color.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  title: {
    color: TOKENS.color.gold,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 2,
    marginBottom: 12,
  },
  message: {
    color: TOKENS.color.white,
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.75,
    lineHeight: 20,
  },
});

// ---------------------------------------------------------------------------
// GPS helpers
// ---------------------------------------------------------------------------

const GPS_COORD = '51.5074°N  0.1278°W';

function formatCoord(lat: number, lon: number): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}°${ns}  ${Math.abs(lon).toFixed(4)}°${ew}`;
}

function offsetCoord(lat: number, lon: number, dLat: number, dLon: number): string {
  return formatCoord(lat + dLat, lon + dLon);
}

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
  const [lastPayout, setLastPayout] = useState(0);
  const [xrayActive, setXrayActive] = useState(false);
  const [freeSpinsRemaining, setFreeSpinsRemaining] = useState(0);
  const [gpsCoord, setGpsCoord] = useState(GPS_COORD);
  const [betSize, setBetSize] = useState(1.0);
  const [jackpot, setJackpot] = useState(getJackpotPool());
  const sceneApiRef = useRef<ThreeSceneApi | null>(null);
  const soundsReady = useRef(false);
  const freeSpinsRemainingRef = useRef(0);
  const pendingAutoSpinRef = useRef(false);
  const betSizeRef = useRef(betSize);

  // Keep betSizeRef in sync
  useEffect(() => { betSizeRef.current = betSize; }, [betSize]);

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

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        if (!mounted) return;
        const { latitude: lat, longitude: lon } = loc.coords;
        setGpsCoord(formatCoord(lat, lon));
      } catch {
        // Non-fatal: keep London default.
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    loadSounds()
      .then(() => { if (mounted) soundsReady.current = true; })
      .catch(() => {});
    return () => {
      mounted = false;
      unloadSounds().catch(() => {});
    };
  }, []);

  const handleSceneReady = useCallback((api: ThreeSceneApi) => {
    sceneApiRef.current = api;
  }, []);

  const handleBetChange = useCallback((bet: number) => {
    setBetSize(bet);
  }, []);

  const advanceFreeSpin = useCallback(() => {
    if (freeSpinsRemainingRef.current <= 0) return;
    const next = freeSpinsRemainingRef.current - 1;
    freeSpinsRemainingRef.current = next;
    setFreeSpinsRemaining(next);
    if (next === 0) setXrayActive(false);
    pendingAutoSpinRef.current = true;
  }, []);

  useEffect(() => {
    if (spinPhase === 'idle' && pendingAutoSpinRef.current) {
      pendingAutoSpinRef.current = false;
      const t = setTimeout(() => handleSpin(), 600);
      return () => clearTimeout(t);
    }
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spinPhase]);

  const handleSpin = useCallback(() => {
    if (spinPhase !== 'idle') return;

    const currentBet = betSizeRef.current;
    const isFreeSpin = freeSpinsRemainingRef.current > 0;

    if (!isFreeSpin && credits < currentBet) return;

    const nextSpin = spinNumber + 1;
    setSpinNumber(nextSpin);
    setSpinPhase('spinning');
    setIsWin(false);
    setWinningReels(new Set());

    if (!isFreeSpin) setCredits(c => c - currentBet);

    const result = spinIndustrial(currentBet);
    setVisibleSymbols(result.grid);
    setJackpot(getJackpotPool());

    if (soundsReady.current) {
      primeAudioForUserGesture()
        .then(() => playSound(SoundEvent.REEL_SPIN))
        .catch(() => {});
    }

    setTimeout(() => {
      setSpinPhase('settling');
      if (soundsReady.current) playReelSettleSequence(5);

      if (result.payout > 0) {
        setCredits(c => c + result.payout);
        setTotalWin(w => w + result.payout);
        setIsWin(true);
        setLastPayout(result.payout);
        setWinningReels(result.winningReels);
        if (soundsReady.current) playSound(SoundEvent.WIN).catch(() => {});
      }

      if (result.freeSpinsTriggered && freeSpinsRemainingRef.current === 0) {
        const FREE_COUNT = result.freeSpinCount;
        freeSpinsRemainingRef.current = FREE_COUNT;
        setFreeSpinsRemaining(FREE_COUNT);
        setXrayActive(true);
        if (soundsReady.current) playSound(SoundEvent.FREE_SPINS).catch(() => {});
      }

      setSpinHistory(prev => {
        const winSym =
          result.topWinSymbolIndex !== null
            ? (CASINO_GLYPHS[result.topWinSymbolIndex] ?? null)
            : null;
        const record: SpinRecord = {
          spinNumber: nextSpin,
          bet: isFreeSpin ? 0 : currentBet,
          payout: result.payout,
          net: result.payout - (isFreeSpin ? 0 : currentBet),
          winSymbol: winSym,
          winLines: result.winLines,
        };
        return [...prev.slice(-(MAX_SPIN_HISTORY - 1)), record];
      });

      setTimeout(() => {
        setSpinPhase('idle');
        setIsWin(false);
        setWinningReels(new Set());
        if (freeSpinsRemainingRef.current > 0) advanceFreeSpin();
      }, 800);
    }, 1800);
  }, [advanceFreeSpin, credits, spinNumber, spinPhase]);

  return (
    <ErrorBoundary>
      <View style={styles.root}>
        <EarthBackdrop />

        <ParticleField />

        {Platform.OS === 'web' && (
          <ErrorBoundary>
            <ThreeReelCanvas
              spinPhase={spinPhase}
              spinNumber={spinNumber}
              gpsCoord={gpsCoord}
              xrayActive={xrayActive}
              onSceneReady={handleSceneReady}
            />
          </ErrorBoundary>
        )}

        <CasinoDashboard
          credits={credits}
          totalWin={totalWin}
          visibleSymbols={visibleSymbols}
          winningReels={winningReels}
          spinning={spinPhase !== 'idle'}
          spinPhase={spinPhase}
          freeSpinsRemaining={freeSpinsRemaining}
          onSpin={handleSpin}
          betSize={betSize}
          onBetChange={handleBetChange}
          jackpot={jackpot}
        />

        <WinCelebration isWin={isWin} payout={lastPayout} betSize={betSize} />

        <FloatingHUD
          credits={credits}
          gpsCoord={gpsCoord}
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

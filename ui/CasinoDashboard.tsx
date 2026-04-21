/**
 * AeroSpin Royale – Casino Dashboard
 * Full-screen luxury Vegas casino UI.
 * 5×3 reels, bet selector, jackpot counter, free spins display.
 */

import React, { useCallback, useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { TOKENS } from './designTokens';
import { spinReel } from './ReelPhysics';
import type { SpinPhase } from './ThreeReelCanvas';

const USE_NATIVE = Platform.OS !== 'web';
const { width: W } = Dimensions.get('window');

// Symbol glyphs for indices 0-8
const CASINO_GLYPHS = ['🍒', '🍋', '🍊', '🔔', '⭐', '💎', '7️⃣', '🎯', '🌟'];

const BET_OPTIONS = [0.25, 0.5, 1.0, 2.0, 5.0];

const REEL_SYMBOL_H = 60; // px per symbol cell
const REEL_ROWS = 3;
const REEL_COLS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CasinoDashboardProps {
  credits: number;
  totalWin: number;
  visibleSymbols: number[][];   // [col][row], 5 cols × 3 rows
  winningReels: Set<number>;
  spinning: boolean;
  spinPhase: SpinPhase;
  freeSpinsRemaining: number;
  onSpin: () => void;
  betSize: number;
  onBetChange: (bet: number) => void;
  jackpot: number;
}

// ---------------------------------------------------------------------------
// Animated jackpot counter
// ---------------------------------------------------------------------------

function useAnimatedNumber(target: number, duration = 400) {
  const anim = useRef(new Animated.Value(target)).current;
  const displayRef = useRef(target);
  const [display, setDisplay] = React.useState(target);

  useEffect(() => {
    const listener = anim.addListener(({ value }) => {
      const rounded = Math.round(value * 100) / 100;
      if (rounded !== displayRef.current) {
        displayRef.current = rounded;
        setDisplay(rounded);
      }
    });
    Animated.timing(anim, {
      toValue: target,
      duration,
      useNativeDriver: false,
      easing: Easing.out(Easing.quad),
    }).start();
    return () => anim.removeListener(listener);
  }, [target, anim, duration]);

  return display;
}

// ---------------------------------------------------------------------------
// JackpotBanner
// ---------------------------------------------------------------------------

function JackpotBanner({ jackpot }: { jackpot: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const displayJackpot = useAnimatedNumber(jackpot, 600);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.06, duration: 800, useNativeDriver: USE_NATIVE }),
        Animated.timing(pulseAnim, { toValue: 1.0, duration: 800, useNativeDriver: USE_NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim]);

  return (
    <Animated.View style={[styles.jackpotBanner, { transform: [{ scale: pulseAnim }] }]}>
      <Text style={styles.jackpotLabel}>✦  JACKPOT  ✦</Text>
      <Text style={styles.jackpotValue}>{displayJackpot.toFixed(2)}</Text>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Single reel column
// ---------------------------------------------------------------------------

interface ReelColumnProps {
  colIndex: number;
  symbols: number[];   // length 3
  spinning: boolean;
  isWinReel: boolean;
  spinPhase: SpinPhase;
}

function ReelColumn({ colIndex, symbols, spinning, isWinReel, spinPhase }: ReelColumnProps) {
  const reelAnim = useRef(new Animated.Value(0)).current;
  const glowAnim = useRef(new Animated.Value(0)).current;
  const spinLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  // Spin loop while spinning phase is active
  useEffect(() => {
    if (spinning) {
      const delay = colIndex * 120;
      const timeout = setTimeout(() => {
        spinLoopRef.current = Animated.loop(
          Animated.timing(reelAnim, {
            toValue: REEL_SYMBOL_H * REEL_ROWS,
            duration: 300,
            easing: Easing.linear,
            useNativeDriver: USE_NATIVE,
          })
        );
        spinLoopRef.current.start();
      }, delay);
      return () => clearTimeout(timeout);
    } else {
      spinLoopRef.current?.stop();
      // Settle using ReelPhysics
      const stopY = 0;
      spinReel(reelAnim, stopY, { onSettle: undefined });
    }
    return undefined;
  }, [spinning, colIndex, reelAnim]);

  // Glow pulse on win
  useEffect(() => {
    if (isWinReel && spinPhase === 'settling') {
      Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 300, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.2, duration: 300, useNativeDriver: false }),
        ]),
        { iterations: 4 }
      ).start(() => glowAnim.setValue(0));
    } else {
      glowAnim.setValue(0);
    }
  }, [isWinReel, spinPhase, glowAnim]);

  const borderColor = glowAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [TOKENS.color.panelBorder, TOKENS.color.gold],
  });

  const translateY = reelAnim.interpolate({
    inputRange: [0, REEL_SYMBOL_H * REEL_ROWS],
    outputRange: [0, REEL_SYMBOL_H * REEL_ROWS],
  });

  return (
    <Animated.View style={[styles.reelColumn, { borderColor }]}>
      <Animated.View style={{ transform: [{ translateY }] }}>
        {symbols.map((sym, row) => (
          <View
            key={row}
            style={[
              styles.symbolCell,
              isWinReel && spinPhase === 'settling' && styles.symbolCellWin,
            ]}
          >
            <Text style={styles.symbolText}>{CASINO_GLYPHS[sym] ?? '?'}</Text>
          </View>
        ))}
      </Animated.View>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Reel Grid
// ---------------------------------------------------------------------------

interface ReelGridProps {
  visibleSymbols: number[][];
  winningReels: Set<number>;
  spinning: boolean;
  spinPhase: SpinPhase;
}

function ReelGrid({ visibleSymbols, winningReels, spinning, spinPhase }: ReelGridProps) {
  return (
    <View style={styles.reelGrid}>
      {Array.from({ length: REEL_COLS }, (_, col) => (
        <ReelColumn
          key={col}
          colIndex={col}
          symbols={visibleSymbols[col] ?? [0, 0, 0]}
          spinning={spinning}
          isWinReel={winningReels.has(col)}
          spinPhase={spinPhase}
        />
      ))}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Bet selector
// ---------------------------------------------------------------------------

interface BetSelectorProps {
  betSize: number;
  onBetChange: (bet: number) => void;
  disabled: boolean;
}

function BetSelector({ betSize, onBetChange, disabled }: BetSelectorProps) {
  return (
    <View style={styles.betSelector}>
      <Text style={styles.betLabel}>BET</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.betOptions}>
        {BET_OPTIONS.map(opt => (
          <Pressable
            key={opt}
            onPress={() => !disabled && onBetChange(opt)}
            style={[styles.betOption, betSize === opt && styles.betOptionActive]}
          >
            <Text style={[styles.betOptionText, betSize === opt && styles.betOptionTextActive]}>
              {opt.toFixed(2)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Spin button
// ---------------------------------------------------------------------------

interface SpinButtonProps {
  onSpin: () => void;
  spinning: boolean;
  freeSpinsRemaining: number;
}

function SpinButton({ onSpin, spinning, freeSpinsRemaining }: SpinButtonProps) {
  const glowAnim = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!spinning) {
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0.4, duration: 900, useNativeDriver: false }),
        ])
      );
      loop.start();
      return () => loop.stop();
    } else {
      glowAnim.setValue(0.4);
    }
    return undefined;
  }, [spinning, glowAnim]);

  const shadowOpacity = glowAnim.interpolate({
    inputRange: [0.4, 1],
    outputRange: [0.4, 0.9],
  });

  return (
    <Animated.View style={[styles.spinBtnWrapper, { opacity: spinning ? 0.6 : 1 }]}>
      <Pressable
        onPress={onSpin}
        disabled={spinning}
        style={({ pressed }) => [styles.spinBtn, pressed && styles.spinBtnPressed]}
      >
        <Text style={styles.spinBtnText}>
          {freeSpinsRemaining > 0 ? `FREE  ${freeSpinsRemaining}` : 'SPIN'}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Stats row
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: string;
  accent?: boolean;
}

function StatCard({ label, value, accent }: StatCardProps) {
  return (
    <View style={styles.statCard}>
      <Text style={styles.statCardLabel}>{label}</Text>
      <Text style={[styles.statCardValue, accent && styles.statCardValueAccent]}>{value}</Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main CasinoDashboard
// ---------------------------------------------------------------------------

export function CasinoDashboard({
  credits,
  totalWin,
  visibleSymbols,
  winningReels,
  spinning,
  spinPhase,
  freeSpinsRemaining,
  onSpin,
  betSize,
  onBetChange,
  jackpot,
}: CasinoDashboardProps) {
  const displayCredits = useAnimatedNumber(credits, 500);
  const displayWin = useAnimatedNumber(totalWin, 500);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {/* Jackpot banner */}
      <JackpotBanner jackpot={jackpot} />

      {/* Free spins indicator */}
      {freeSpinsRemaining > 0 && (
        <View style={styles.freeSpinsBadge}>
          <Text style={styles.freeSpinsText}>🎰 FREE SPINS: {freeSpinsRemaining}</Text>
        </View>
      )}

      {/* Reel panel */}
      <View style={styles.reelPanel}>
        {/* Corner accents */}
        <View style={[styles.cornerAccent, styles.cornerTL]} />
        <View style={[styles.cornerAccent, styles.cornerTR]} />
        <View style={[styles.cornerAccent, styles.cornerBL]} />
        <View style={[styles.cornerAccent, styles.cornerBR]} />

        <ReelGrid
          visibleSymbols={visibleSymbols}
          winningReels={winningReels}
          spinning={spinning}
          spinPhase={spinPhase}
        />
      </View>

      {/* Stats row */}
      <View style={styles.statsRow}>
        <StatCard label="CREDITS" value={displayCredits.toFixed(2)} />
        <StatCard label="TOTAL WIN" value={displayWin.toFixed(2)} accent />
        {winningReels.size > 0 && spinPhase === 'settling' && (
          <View style={styles.winLinesBadge}>
            <Text style={styles.winLinesText}>WIN!</Text>
          </View>
        )}
      </View>

      {/* Bet selector */}
      <BetSelector betSize={betSize} onBetChange={onBetChange} disabled={spinning} />

      {/* Spin button */}
      <SpinButton onSpin={onSpin} spinning={spinning} freeSpinsRemaining={freeSpinsRemaining} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const REEL_COL_W = Math.floor((Math.min(W, 500) - 48) / REEL_COLS);

const styles = StyleSheet.create({
  root: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: TOKENS.zIndex.dashboard,
    paddingHorizontal: 16,
  },

  // Jackpot banner
  jackpotBanner: {
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 24,
    paddingVertical: 8,
    backgroundColor: 'rgba(14,14,22,0.85)',
    borderWidth: 1,
    borderColor: TOKENS.color.gold,
    borderRadius: TOKENS.borderRadius.soft,
  },
  jackpotLabel: {
    color: TOKENS.color.gold,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  jackpotValue: {
    color: TOKENS.color.gold,
    fontSize: 32,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
    textShadowColor: TOKENS.color.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 8,
  },

  // Free spins
  freeSpinsBadge: {
    backgroundColor: TOKENS.color.neonPurple,
    borderRadius: TOKENS.borderRadius.round,
    paddingHorizontal: 16,
    paddingVertical: 5,
    marginBottom: 8,
  },
  freeSpinsText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
  },

  // Reel panel
  reelPanel: {
    backgroundColor: 'rgba(14,14,22,0.9)',
    borderWidth: 1.5,
    borderColor: TOKENS.color.panelBorder,
    borderRadius: TOKENS.borderRadius.soft,
    padding: 8,
    marginBottom: 12,
    // Gold glow
    shadowColor: TOKENS.color.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 8,
  },

  // Corner accent decorations
  cornerAccent: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderColor: TOKENS.color.gold,
  },
  cornerTL: { top: 4, left: 4, borderTopWidth: 2, borderLeftWidth: 2 },
  cornerTR: { top: 4, right: 4, borderTopWidth: 2, borderRightWidth: 2 },
  cornerBL: { bottom: 4, left: 4, borderBottomWidth: 2, borderLeftWidth: 2 },
  cornerBR: { bottom: 4, right: 4, borderBottomWidth: 2, borderRightWidth: 2 },

  // Reel grid
  reelGrid: {
    flexDirection: 'row',
    gap: 4,
  },

  // Single reel column
  reelColumn: {
    width: REEL_COL_W,
    height: REEL_SYMBOL_H * REEL_ROWS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: TOKENS.color.panelBorder,
    borderRadius: TOKENS.borderRadius.hard,
    backgroundColor: 'rgba(5,5,8,0.6)',
  },

  // Symbol cell
  symbolCell: {
    width: REEL_COL_W,
    height: REEL_SYMBOL_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  symbolCellWin: {
    backgroundColor: 'rgba(255,215,0,0.12)',
  },
  symbolText: {
    fontSize: 30,
  },

  // Stats row
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 10,
    alignItems: 'center',
  },
  statCard: {
    backgroundColor: 'rgba(14,14,22,0.85)',
    borderWidth: 1,
    borderColor: TOKENS.color.panelBorder,
    borderRadius: TOKENS.borderRadius.soft,
    paddingHorizontal: 14,
    paddingVertical: 8,
    alignItems: 'center',
  },
  statCardLabel: {
    color: TOKENS.color.dimText,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  statCardValue: {
    color: TOKENS.color.white,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  statCardValueAccent: {
    color: TOKENS.color.gold,
    textShadowColor: TOKENS.color.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 6,
  },
  winLinesBadge: {
    backgroundColor: TOKENS.color.neonPink,
    borderRadius: TOKENS.borderRadius.round,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  winLinesText: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },

  // Bet selector
  betSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  betLabel: {
    color: TOKENS.color.dimText,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  betOptions: {
    flexDirection: 'row',
    gap: 6,
  },
  betOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: TOKENS.borderRadius.round,
    borderWidth: 1,
    borderColor: TOKENS.color.goldDim,
    backgroundColor: 'rgba(14,14,22,0.8)',
  },
  betOptionActive: {
    backgroundColor: TOKENS.color.gold,
    borderColor: TOKENS.color.gold,
  },
  betOptionText: {
    color: TOKENS.color.dimText,
    fontSize: 12,
    fontWeight: '700',
  },
  betOptionTextActive: {
    color: TOKENS.color.bg,
  },

  // Spin button
  spinBtnWrapper: {
    width: 180,
    borderRadius: TOKENS.borderRadius.round,
    overflow: 'hidden',
    shadowColor: TOKENS.color.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.7,
    shadowRadius: 20,
    elevation: 12,
  },
  spinBtn: {
    backgroundColor: TOKENS.color.gold,
    borderRadius: TOKENS.borderRadius.round,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinBtnPressed: {
    backgroundColor: TOKENS.color.goldDim,
  },
  spinBtnText: {
    color: TOKENS.color.bg,
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
});

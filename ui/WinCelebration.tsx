/**
 * AeroSpin Royale – WinCelebration overlay
 * Screen shake + gold border glow + BIG WIN / MEGA WIN text + coin burst.
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Dimensions, Platform, StyleSheet, Text, View } from 'react-native';
import { TOKENS } from './designTokens';

const { width: W, height: H } = Dimensions.get('window');
const USE_NATIVE = Platform.OS !== 'web';

const SHAKE_FRAMES: [number, number][] = [
  [5, 3], [-5, -3], [4, -4], [-4, 4],
  [3, 5], [-3, -5], [2, -2], [0, 0],
];
const FRAME_MS = 16;

const COIN_COUNT = 16;

const MEGA_WIN_RATIO = 200;
const BIG_WIN_RATIO = 50;



interface WinCelebrationProps {
  isWin: boolean;
  payout: number;
  betSize: number;
}

// ---------------------------------------------------------------------------
// Coin burst particle
// ---------------------------------------------------------------------------

interface CoinParticle {
  angle: number;
  distance: number;
  color: string;
}

const COIN_COLORS = [TOKENS.color.gold, TOKENS.color.neonCyan, TOKENS.color.neonPink, '#FFFFFF'];

const COINS: CoinParticle[] = Array.from({ length: COIN_COUNT }, (_, i) => ({
  angle: (i / COIN_COUNT) * Math.PI * 2,
  distance: 80 + Math.random() * 80,
  color: COIN_COLORS[i % COIN_COLORS.length],
}));

function CoinBurst({ playing }: { playing: boolean }) {
  const anims = useRef(COINS.map(() => new Animated.Value(0))).current;
  const opacs = useRef(COINS.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    if (!playing) {
      anims.forEach(a => a.setValue(0));
      opacs.forEach(a => a.setValue(0));
      return;
    }
    Animated.parallel([
      ...anims.map(a =>
        Animated.timing(a, { toValue: 1, duration: 600, useNativeDriver: USE_NATIVE })
      ),
      ...opacs.map(a =>
        Animated.sequence([
          Animated.timing(a, { toValue: 1, duration: 100, useNativeDriver: USE_NATIVE }),
          Animated.timing(a, { toValue: 0, duration: 500, useNativeDriver: USE_NATIVE }),
        ])
      ),
    ]).start();
  }, [playing, anims, opacs]);

  return (
    <View style={styles.coinBurstContainer} pointerEvents="none">
      {COINS.map((coin, i) => {
        const tx = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.cos(coin.angle) * coin.distance],
        });
        const ty = anims[i].interpolate({
          inputRange: [0, 1],
          outputRange: [0, Math.sin(coin.angle) * coin.distance],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.coin,
              {
                backgroundColor: coin.color,
                opacity: opacs[i],
                transform: [{ translateX: tx }, { translateY: ty }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// WinCelebration
// ---------------------------------------------------------------------------

export function WinCelebration({ isWin, payout, betSize }: WinCelebrationProps) {
  const shakeX = useRef(new Animated.Value(0)).current;
  const shakeY = useRef(new Animated.Value(0)).current;
  const borderOpacity = useRef(new Animated.Value(0)).current;
  const textScale = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const isAnimating = useRef(false);

  const ratio = betSize > 0 ? payout / betSize : 0;
  const isMegaWin = ratio >= MEGA_WIN_RATIO;
  const isBigWin = ratio >= BIG_WIN_RATIO;

  useEffect(() => {
    if (!isWin || isAnimating.current) return;
    isAnimating.current = true;

    // Screen shake
    const shakeSeqX = Animated.sequence(
      SHAKE_FRAMES.map(([x]) =>
        Animated.timing(shakeX, { toValue: x, duration: FRAME_MS, useNativeDriver: false })
      )
    );
    const shakeSeqY = Animated.sequence(
      SHAKE_FRAMES.map(([, y]) =>
        Animated.timing(shakeY, { toValue: y, duration: FRAME_MS, useNativeDriver: false })
      )
    );

    // Gold border pulse
    const borderPulse = Animated.sequence([
      Animated.timing(borderOpacity, { toValue: 1, duration: 80, useNativeDriver: false }),
      Animated.timing(borderOpacity, { toValue: 0.2, duration: 80, useNativeDriver: false }),
      Animated.timing(borderOpacity, { toValue: 1, duration: 80, useNativeDriver: false }),
      Animated.timing(borderOpacity, { toValue: 0.2, duration: 80, useNativeDriver: false }),
      Animated.timing(borderOpacity, { toValue: 1, duration: 80, useNativeDriver: false }),
      Animated.timing(borderOpacity, { toValue: 0, duration: 400, useNativeDriver: false }),
    ]);

    // Big/mega win text animation
    const textAnim = (isBigWin || isMegaWin)
      ? Animated.sequence([
          Animated.parallel([
            Animated.spring(textScale, { toValue: 1, useNativeDriver: USE_NATIVE, bounciness: 14 }),
            Animated.timing(textOpacity, { toValue: 1, duration: 200, useNativeDriver: USE_NATIVE }),
          ]),
          Animated.delay(900),
          Animated.timing(textOpacity, { toValue: 0, duration: 300, useNativeDriver: USE_NATIVE }),
        ])
      : Animated.timing(textOpacity, { toValue: 0, duration: 0, useNativeDriver: USE_NATIVE });

    Animated.parallel([shakeSeqX, shakeSeqY, borderPulse, textAnim]).start(() => {
      shakeX.setValue(0);
      shakeY.setValue(0);
      borderOpacity.setValue(0);
      textScale.setValue(0);
      textOpacity.setValue(0);
      isAnimating.current = false;
    });
  }, [isWin, isBigWin, isMegaWin, shakeX, shakeY, borderOpacity, textScale, textOpacity]);

  const winLabel = isMegaWin ? 'MEGA WIN!' : 'BIG WIN!';

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.overlay,
        {
          transform: [{ translateX: shakeX }, { translateY: shakeY }],
        },
      ]}
    >
      {/* Gold neon border */}
      <Animated.View style={[styles.neonBorder, { opacity: borderOpacity }]} />

      {/* Coin burst from center */}
      <CoinBurst playing={isWin} />

      {/* Big / Mega win text */}
      {(isBigWin || isMegaWin) && (
        <Animated.Text
          style={[
            styles.winText,
            isMegaWin && styles.megaWinText,
            { opacity: textOpacity, transform: [{ scale: textScale }] },
          ]}
        >
          {winLabel}
        </Animated.Text>
      )}
    </Animated.View>
  );
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: W,
    height: H,
    zIndex: TOKENS.zIndex.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  neonBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderWidth: 4,
    borderColor: TOKENS.color.gold,
    borderRadius: 0,
  },
  coinBurstContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  coin: {
    position: 'absolute',
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  winText: {
    color: TOKENS.color.gold,
    fontSize: 52,
    fontWeight: '900',
    letterSpacing: 4,
    textShadowColor: TOKENS.color.gold,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 20,
    textAlign: 'center',
  },
  megaWinText: {
    color: TOKENS.color.neonCyan,
    textShadowColor: TOKENS.color.neonCyan,
    fontSize: 62,
  },
});

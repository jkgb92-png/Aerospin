/**
 * AeroSpin Royale – Particle Field background
 * Floating golden sparkles using Animated API (no native driver on web).
 */
import React, { useEffect, useRef, useMemo } from 'react';
import { Animated, Dimensions, Platform, StyleSheet, View } from 'react-native';
import { TOKENS } from './designTokens';

const { width: W, height: H } = Dimensions.get('window');
const USE_NATIVE = Platform.OS !== 'web';
const PARTICLE_COUNT = 24;

interface Particle {
  x: number;
  size: number;
  duration: number;
  delay: number;
  color: string;
}

const COLORS = [
  TOKENS.color.gold,
  TOKENS.color.neonCyan,
  TOKENS.color.neonPink,
  TOKENS.color.neonPurple,
  '#FFFFFF',
];

export function ParticleField() {
  const particles: Particle[] = useMemo(() => {
    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
      x: (i / PARTICLE_COUNT) * W + Math.random() * (W / PARTICLE_COUNT),
      size: 2 + Math.random() * 3,
      duration: 4000 + Math.random() * 8000,
      delay: Math.random() * 6000,
      color: COLORS[i % COLORS.length],
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={styles.container} pointerEvents="none">
      {particles.map((p, i) => (
        <FloatingParticle key={i} particle={p} />
      ))}
    </View>
  );
}

function FloatingParticle({ particle }: { particle: Particle }) {
  const anim = useRef(new Animated.Value(0)).current;
  const opacAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(particle.delay),
        Animated.parallel([
          Animated.timing(anim, {
            toValue: 1,
            duration: particle.duration,
            useNativeDriver: USE_NATIVE,
          }),
          Animated.sequence([
            Animated.timing(opacAnim, { toValue: 0.8, duration: particle.duration * 0.2, useNativeDriver: USE_NATIVE }),
            Animated.timing(opacAnim, { toValue: 0.3, duration: particle.duration * 0.6, useNativeDriver: USE_NATIVE }),
            Animated.timing(opacAnim, { toValue: 0, duration: particle.duration * 0.2, useNativeDriver: USE_NATIVE }),
          ]),
        ]),
        Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: USE_NATIVE }),
        Animated.timing(opacAnim, { toValue: 0, duration: 0, useNativeDriver: USE_NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, opacAnim, particle]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [H + 20, -20] });
  const translateX = anim.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, particle.size * 8, 0] });

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: particle.x,
        width: particle.size,
        height: particle.size,
        borderRadius: particle.size / 2,
        backgroundColor: particle.color,
        opacity: opacAnim,
        transform: [{ translateY }, { translateX }],
      }}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: TOKENS.zIndex.particles,
    overflow: 'hidden',
  },
});

import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

import { EarthBackdrop } from './ui/EarthBackdrop';
import { IndustrialCasinoDashboard } from './ui/IndustrialCasinoDashboard';
import { FloatingHUD, SpinRecord } from './ui/FloatingHUD';

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
// App root
// ---------------------------------------------------------------------------

export default function App() {
  const [credits] = useState(1250);
  const [totalWin] = useState(12.50);

  return (
    <View style={styles.root}>
      {/* Satellite tile backdrop (fills behind all other UI) */}
      <EarthBackdrop />

      {/* Main casino dashboard */}
      <IndustrialCasinoDashboard
        credits={credits}
        totalWin={totalWin}
        visibleSymbols={IDLE_SYMBOLS}
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
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#1C1C1C',
  },
});

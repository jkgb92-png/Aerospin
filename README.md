# Aerospin 🎰

**The next-generation mobile casino slots experience** — provably fair, gyroscope-reactive, and built for every screen.

[![Expo SDK](https://img.shields.io/badge/Expo-52-000020?logo=expo)](https://expo.dev)
[![React Native](https://img.shields.io/badge/React%20Native-0.76-61DAFB?logo=react)](https://reactnative.dev)
[![Made with ❤️](https://img.shields.io/badge/Made%20with-%E2%9D%A4%EF%B8%8F-red)](https://github.com/jkgb92-png/Aerospin)

---

## Features

### 🎮 Multiverse Slot Engine
Three fully realised game worlds — each with its own symbol set, reel configuration, and payline topology:

| World | Reels × Rows | Paylines | RTP | Highlight |
|-------|-------------|----------|-----|-----------|
| **Las Vegas Classic** | 5 × 3 | 20 | 96.5 % | Wild substitution, Cherry → Diamond pay table |
| **Neon Cyber** | 6 × 4 | 50 | 96.8 % | Scatter free-spins (12 spins), cluster-pay bonus |
| **Industrial Surveillance** | 5 × 3 | 20 | 96.3 % | Scatter free-spins (10 spins), gritty industrial symbols |

### 🔐 Provably Fair Backend
Every spin is cryptographically verifiable:

1. The server publishes a **SHA-256 commitment** to its seed before any bet is placed.
2. Each outcome is derived from `HMAC-SHA512(server_seed, client_seed:nonce)`.
3. After a session the **server seed is revealed** — players can independently replay and verify every single spin.

### 📡 Gyroscope HUD
A floating Industrial Surveillance–themed heads-up display that **tilts in real time** with device orientation (via `expo-sensors`). Displays:
- Credit balance and session win
- Live GPS coordinate badge
- Raw stats table for the last 10 spins (spin #, bet, payout, net, winning symbol, paylines hit)

### 🌍 Satellite Earth Backdrop
A live satellite-tile backdrop rendered behind all UI using `expo-location` — the map centres on the player's real-world GPS position.

### 🎵 Sound Design
Adaptive audio layer (`ui/SoundDesign.ts`) powered by `expo-av` with reel physics callbacks.

### ⚡ Adaptive Asset Streaming
High-resolution 3-D assets are streamed via AWS CloudFront / GCS using Unity Addressables with:
- **4 LOD levels** (full → 128 × 128 proxy) selected by live bandwidth measurement
- **512 MB on-device LRU cache** with world-aware eviction policy
- Content-hash bundle naming + signed HTTPS URLs (1-hour expiry)

---

## Project Structure

```
Aerospin/
├── App.tsx                        # Root component
├── app.json                       # Expo configuration
├── ui/
│   ├── EarthBackdrop.tsx          # Satellite map backdrop
│   ├── IndustrialCasinoDashboard.tsx  # Main 5-reel game UI
│   ├── FloatingHUD.tsx            # Gyro-tilt HUD overlay
│   ├── ReelPhysics.ts             # Reel spin / stop physics
│   └── SoundDesign.ts             # Audio event bindings
├── casino_logic/
│   └── multiverse_slot.py         # Slot math model (3 worlds, RTP sim)
├── backend/
│   └── provably_fair.py           # Cryptographic fairness engine
├── asset_streaming/
│   ├── adaptive_quality.py        # LOD selector by bandwidth
│   └── ASSET_STREAMING_STRATEGY.md
├── graphics_pipeline/
│   ├── AerospinForwardRenderer.asset
│   ├── UniversalRenderPipelineAsset_Aerospin.asset
│   └── pipeline_bootstrap.py      # Unity URP bootstrap
└── tests/
    └── test_aerospin.py
```

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) ≥ 18
- [Expo CLI](https://docs.expo.dev/get-started/installation/) (`npm install -g expo-cli`)
- Python ≥ 3.10 (for backend / casino logic)
- iOS Simulator / Android Emulator **or** the [Expo Go](https://expo.dev/go) app

### Install

```bash
git clone https://github.com/jkgb92-png/Aerospin.git
cd Aerospin
npm install
```

### Run

```bash
# Start the Metro bundler (opens QR code for Expo Go)
npx expo start

# iOS simulator
npx expo start --ios

# Android emulator
npx expo start --android

# Web browser
npx expo start --web
```

### Test (Python backend)

```bash
pip install pytest
python -m pytest tests/test_aerospin.py -v
```

### Verify a spin (CLI demo)

```bash
python backend/provably_fair.py
```

---

## Platforms

| Platform | Status |
|----------|--------|
| iOS | ✅ |
| Android | ✅ |
| Web | ✅ |

---

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `expo` ~52 | App runtime & toolchain |
| `expo-sensors` | Accelerometer for HUD tilt |
| `expo-location` | GPS coord for satellite backdrop |
| `expo-av` | Audio playback |
| `react-native` 0.76 | UI framework |

---

Made with ❤️ — [Aerospin](https://github.com/jkgb92-png/Aerospin)

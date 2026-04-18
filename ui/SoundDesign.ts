/**
 * Aerospin – Sound Design (Grounded)
 * ====================================
 * Maps game events to real-world recorded sound assets.
 *
 * Philosophy
 * ----------
 * Every sound is drawn from the physical world rather than synthetic casino
 * effects: the hollow thud of a heavy door, the metallic snap of a deadbolt.
 * These anchor the player in reality and complement the satellite Earth backdrop.
 *
 * Asset placement
 * ---------------
 * Place the raw audio files in `assets/sounds/`.  Supported formats: .mp3
 * (universal) and .wav (iOS/Android lossless).  Filenames must match the
 * constants below exactly.
 *
 *   assets/sounds/reel_spin.mp3    – a sliding grocery-store automatic door
 *   assets/sounds/win_deadbolt.mp3 – a heavy deadbolt slamming home
 *   assets/sounds/reel_settle.mp3  – a brief mechanical thud as the reel stops
 *   assets/sounds/free_spin.mp3    – a distant rumble (thunder / heavy machinery)
 *
 * Integration (expo-av)
 * ---------------------
 * ```ts
 * import { SoundEvent, loadSounds, playSound, unloadSounds } from './SoundDesign';
 *
 * // In your root component:
 * useEffect(() => {
 *   loadSounds();
 *   return () => { unloadSounds(); };
 * }, []);
 *
 * // On spin:
 * playSound(SoundEvent.REEL_SPIN);
 *
 * // On win:
 * playSound(SoundEvent.WIN);
 * ```
 *
 * Dependencies (add to package.json)
 *   expo-av  ^14.x
 */

import { Audio } from 'expo-av';

// ---------------------------------------------------------------------------
// Event catalogue
// ---------------------------------------------------------------------------

export enum SoundEvent {
  /** Played when reels begin spinning – sliding automatic grocery-store door. */
  REEL_SPIN = 'REEL_SPIN',
  /** Played once each reel settles on its stop – mechanical thud. */
  REEL_SETTLE = 'REEL_SETTLE',
  /** Played on any winning combination – heavy deadbolt clicking into place. */
  WIN = 'WIN',
  /** Played when free spins are triggered – distant rumble / industrial bass. */
  FREE_SPINS = 'FREE_SPINS',
}

// ---------------------------------------------------------------------------
// Asset map: event → bundled require()
// ---------------------------------------------------------------------------

// Using require() so Metro bundler resolves and bundles the assets at build time.
const SOUND_ASSETS: Record<SoundEvent, ReturnType<typeof require>> = {
  [SoundEvent.REEL_SPIN]:   require('../assets/sounds/reel_spin.mp3'),
  [SoundEvent.REEL_SETTLE]: require('../assets/sounds/reel_settle.mp3'),
  [SoundEvent.WIN]:         require('../assets/sounds/win_deadbolt.mp3'),
  [SoundEvent.FREE_SPINS]:  require('../assets/sounds/free_spin.mp3'),
};

// ---------------------------------------------------------------------------
// Sound pool (loaded instances)
// ---------------------------------------------------------------------------

const _pool = new Map<SoundEvent, Audio.Sound>();
let _audioPrimedForGesture = false;

/**
 * Pre-load all sound assets into memory.
 * Call once on app startup (e.g. inside a root useEffect or App.onReady).
 */
export async function loadSounds(): Promise<void> {
  await Audio.setAudioModeAsync({
    playsInSilentModeIOS: true,
    staysActiveInBackground: false,
  });

  await Promise.all(
    Object.values(SoundEvent).map(async (event) => {
      const { sound } = await Audio.Sound.createAsync(
        SOUND_ASSETS[event as SoundEvent],
        { shouldPlay: false, volume: 1.0 },
      );
      _pool.set(event as SoundEvent, sound);
    }),
  );
}

/**
 * Play a sound event.  Rewinds to the start before playing so rapid
 * re-triggers work correctly (e.g. multiple reels settling in quick succession).
 *
 * @param event  The SoundEvent to play.
 * @param volume Optional volume override in [0, 1].  Defaults to 1.0.
 */
export async function playSound(
  event: SoundEvent,
  volume = 1.0,
): Promise<void> {
  const sound = _pool.get(event);
  if (!sound) return;
  try {
    await sound.setVolumeAsync(volume);
    await sound.setPositionAsync(0);
    await sound.playAsync();
  } catch {
    // Silently ignore playback errors (device muted, audio session interrupted)
  }
}

/**
 * Unload all sounds and release native audio resources.
 * Call when the game screen unmounts or the app is going to the background.
 */
export async function unloadSounds(): Promise<void> {
  await Promise.all(
    [..._pool.values()].map((sound) => sound.unloadAsync()),
  );
  _pool.clear();
  _audioPrimedForGesture = false;
}

/**
 * Prime web/mobile audio context from a user gesture to reduce first-play latency.
 * Safe to call repeatedly; priming runs once per load cycle.
 */
export async function primeAudioForUserGesture(): Promise<void> {
  if (_audioPrimedForGesture) return;
  await Promise.all(
    [..._pool.values()].map(async (sound) => {
      try {
        await sound.setVolumeAsync(0);
        await sound.setPositionAsync(0);
        await sound.playAsync();
        await sound.pauseAsync();
        await sound.setPositionAsync(0);
        await sound.setVolumeAsync(1);
      } catch {
        // If priming fails on a platform, normal playback still attempts later.
      }
    }),
  );
  _audioPrimedForGesture = true;
}

// ---------------------------------------------------------------------------
// Convenience: play all reel-settle sounds with a staggered delay
// ---------------------------------------------------------------------------

/**
 * Stagger reel-settle sounds across N reels, each `delayMs` apart, to give
 * the impression of heavy drums stopping one by one.
 *
 * @param reelCount  Total number of reels (typically 5 or 6).
 * @param delayMs    Milliseconds between successive settle sounds.
 */
export function playReelSettleSequence(
  reelCount: number,
  delayMs = 120,
): void {
  if (reelCount <= 1) {
    playSound(SoundEvent.REEL_SETTLE, 0.7);
    return;
  }
  for (let i = 0; i < reelCount; i++) {
    setTimeout(() => {
      playSound(SoundEvent.REEL_SETTLE, 0.7 + 0.3 * (i / (reelCount - 1)));
    }, i * delayMs);
  }
}

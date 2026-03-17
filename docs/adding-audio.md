# Adding Audio Assets

This guide covers adding music tracks, SFX pools, and footstep sounds.

## Overview

Audio is split into two independent subsystems sharing a master gain node:

- **Music** — streamed background tracks, playlist-based with crossfading
- **SFX** — short one-shot sounds, pooled per sound ID with pitch variation

Both are driven by `audioManifest.ts`. The simulation never calls audio directly — it emits typed `GameEvent`s that `AudioModule` translates into audio playback.

## Adding music tracks

### 1 — Drop the audio file

Place `.ogg` files in `static/audio/music/`. OGG Vorbis is the required format for web compatibility.

```
static/audio/music/track_55_your_track_name.ogg
```

### 2 — Register in the manifest

**`src/lib/game/audio/audioManifest.ts`**

Add the path to the appropriate playlist's `tracks` array:

```ts
playlists: {
  main: {
    tracks: [
      // ...existing...
      '/audio/music/track_55_your_track_name.ogg',
    ],
    mode: 'shuffle',
    crossfadeDuration: 0,
  },
},
```

To create a new playlist (e.g. for a different zone or mood), add a new key under `playlists`. Switch between playlists at runtime by emitting a `WEATHER_CHANGED` event or adding a dedicated event type in `src/lib/game/types/events.ts`.

## Adding SFX

### 1 — Drop the audio files

Place `.ogg` files in `static/audio/sfx/`. Use numbered variants for natural-sounding randomization:

```
static/audio/sfx/footstep_stone_001.ogg
static/audio/sfx/footstep_stone_002.ogg
...
```

More variants = less repetition. Aim for at least 4–6 per sound.

### 2 — Register a sound pool

**`src/lib/game/audio/audioManifest.ts`**

Add an entry under `sfx`. The key is the sound ID used when playing the sound.

```ts
sfx: {
  // ...existing...
  'footstep.stone': {
    maxConcurrent: 3,       // max simultaneous instances
    pitchVariation: 0.08,   // ±4% pitch randomization per play
    variants: [
      '/audio/sfx/footstep_stone_001.ogg',
      '/audio/sfx/footstep_stone_002.ogg',
      // ...
    ],
  },
},
```

The SFX module picks a random variant each play call and applies pitch variation automatically.

### 3 — Play the sound

Sounds are played by calling `audio.sfx.play('your.sound.id')` inside `AudioModule.handleEvents()`. The simulation must first emit a `GameEvent` that triggers the call.

To add a completely new event type, declare it in **`src/lib/game/types/events.ts`**, emit it from the relevant simulation function, and handle it in `AudioModule.handleEvents()`.

## Footstep sounds

Footstep playback is already wired up. To add footstep audio for a tile type:

### 1 — Register the SFX pool (see above)

Use the naming convention `footstep.<surface>` (e.g. `footstep.stone`, `footstep.sand`).

### 2 — Map TileType → sound ID

**`src/lib/game/audio/AudioModule.ts`**

Add an entry to `FOOTSTEP_SURFACE`:

```ts
const FOOTSTEP_SURFACE: Partial<Record<number, string>> = {
  [TileType.CARPET]: 'footstep.carpet',
  [TileType.STONE]:  'footstep.stone',   // ← add your mapping here
};
```

Tile types without an entry play no footstep sound.

## Prop sounds

The simulation emits four prop-related events that `AudioModule.handleEvents()` can translate into audio. They are currently declared but silent — wire them up as artwork and SFX are finalised.

**`src/lib/game/audio/AudioModule.ts`**

```ts
case 'PROP_DESTROYED': {
  // Play a break sound based on prop type or tool used
  // e.g. this.sfx.play('break.wood');
  break;
}

case 'PROP_DAMAGED': {
  // Play a hit sound (optional — can be noisy for multi-hit props)
  break;
}

case 'PROP_STATE_CHANGED': {
  // Play a door creak, chest click, etc. keyed on event.to (new stateId)
  // e.g. if (event.to === 'open') this.sfx.play('door.open');
  break;
}

case 'PROP_CONTAINER_OPENED': {
  // Play a chest-open sound
  break;
}
```

Add the corresponding SFX pools to `audioManifest.ts` following the SFX registration steps above. Suggested naming convention: `break.<material>`, `door.<verb>`, `chest.<verb>`.

## Volume and gain

The gain hierarchy is:

```
AudioContext
  └─ masterGain   (0–1, global mute/volume)
      ├─ musicGain  (0–1, music bus)
      └─ sfxGain    (0–1, SFX bus)
```

These are controlled at runtime by the UI. No manifest changes are needed for volume.

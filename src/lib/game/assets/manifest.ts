// src/lib/game/assets/manifest.ts
//
// Central list of every image the game preloads at startup.
// Add new spritesheets and tilesets here as they are introduced.
// The renderer will warn at runtime if a referenced image is missing from this list.

import type { AssetManifest } from './AssetLoader';

export const MANIFEST: AssetManifest = {
  images: [
    '/sprites/characters/Adam_16x16.png',
    '/sprites/tilesets/Room_Builder_16x16.png',
    '/sprites/props/Interiors_16x16.png',
    // '/sprites/characters/Npc_01.png',
  ],
};

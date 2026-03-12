// src/lib/game/engine/AssetLoader.ts

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LoadedAssets {
  images: Map<string, HTMLImageElement>;
}

export interface AssetManifest {
  images: string[];   // paths relative to /static (e.g. '/sprites/characters/Adam_16x16.png')
}

export type LoadProgressCallback = (loaded: number, total: number) => void;

// ─── AssetLoader ──────────────────────────────────────────────────────────────

/**
 * Preload all assets declared in the manifest before the game loop starts.
 * Returns a promise that resolves only when every asset is ready.
 *
 * Usage in +page.svelte:
 *   const assets = await loadAssets(MANIFEST, (loaded, total) => {
 *     progress = loaded / total;
 *   });
 *   renderer.init(assets);
 *   gameLoop.start();
 *
 * @param manifest  - Declares every asset the game needs at startup
 * @param onProgress - Optional callback for loading screen progress bar
 */
export async function loadAssets(
    manifest: AssetManifest,
    onProgress?: LoadProgressCallback
): Promise<LoadedAssets> {
  const images = new Map<string, HTMLImageElement>();

  const total  = manifest.images.length;
  let   loaded = 0;

  await Promise.all(
      manifest.images.map(
          (src) =>
              new Promise<void>((resolve, reject) => {
                const img    = new Image();

                img.onload = () => {
                  images.set(src, img);
                  loaded++;
                  onProgress?.(loaded, total);
                  resolve();
                };

                img.onerror = () =>
                    reject(new Error(`[AssetLoader] Failed to load image: ${src}`));

                img.src = src;
              })
      )
  );

  return { images };
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

/**
 * Central manifest — every sprite sheet used in the game declared here.
 * Add new sheets here as new characters / tilesets are introduced.
 * The renderer will warn at runtime if an image is missing from this list.
 */
export const MANIFEST: AssetManifest = {
  images: [
    '/sprites/characters/Adam_16x16.png',
    // '/sprites/characters/Npc_01.png',
    // '/sprites/tilesets/Modern_Interior.png',
  ],
};
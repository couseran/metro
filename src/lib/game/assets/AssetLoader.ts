// src/lib/game/assets/AssetLoader.ts
//
// Generic asset preloading infrastructure.
// The list of assets to load lives in manifest.ts — this file is app-agnostic.

// ─── Types ────────────────────────────────────────────────────────────────────

/** Map of image path → loaded HTMLImageElement, populated by loadAssets(). */
export interface LoadedAssets {
  images: Map<string, HTMLImageElement>;
}

/** Declares every asset the game needs. Passed to loadAssets() at startup. */
export interface AssetManifest {
  /** Paths relative to /static (e.g. '/sprites/characters/Adam_16x16.png'). */
  images: string[];
}

/** Called each time an asset finishes loading. Used to drive a loading-screen progress bar. */
export type LoadProgressCallback = (loaded: number, total: number) => void;

// ─── Loader ───────────────────────────────────────────────────────────────────

/**
 * Preload all assets declared in the manifest before the game loop starts.
 * Resolves only when every asset is ready; rejects on the first load failure.
 *
 * @param manifest   - All assets the game needs at startup (see manifest.ts)
 * @param onProgress - Optional callback for loading-screen progress
 */
export async function loadAssets(
    manifest: AssetManifest,
    onProgress?: LoadProgressCallback,
): Promise<LoadedAssets> {
  const images = new Map<string, HTMLImageElement>();
  const total  = manifest.images.length;
  let   loaded = 0;

  await Promise.all(
      manifest.images.map(
          (src) =>
              new Promise<void>((resolve, reject) => {
                const img = new Image();

                img.onload = () => {
                  images.set(src, img);
                  loaded++;
                  onProgress?.(loaded, total);
                  resolve();
                };

                img.onerror = () =>
                    reject(new Error(`[AssetLoader] Failed to load image: ${src}`));

                img.src = src;
              }),
      ),
  );

  return { images };
}

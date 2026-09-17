import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function cacheKey(projectPath: string, datasource: string): string {
  return `${projectPath}::${datasource}`;
}

export function getCachedGeojson(
  projectPath: string,
  datasource: string
): string | null {
  return cache.get(cacheKey(projectPath, datasource)) ?? null;
}

export function fetchLayerGeojson(
  projectPath: string,
  datasource: string
): Promise<string> {
  const key = cacheKey(projectPath, datasource);

  const cached = cache.get(key);
  if (cached !== undefined) {
    return Promise.resolve(cached);
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending;
  }

  const promise = invoke<string>("get_layer_geojson", {
    projectPath,
    datasource,
  })
    .then((text) => {
      cache.set(key, text);
      inFlight.delete(key);
      return text;
    })
    .catch((err) => {
      inFlight.delete(key);
      throw err;
    });

  inFlight.set(key, promise);
  return promise;
}

export async function prefetchAllLayers(
  projectPath: string,
  datasources: string[]
): Promise<void> {
  await Promise.allSettled(
    datasources.map((ds) => fetchLayerGeojson(projectPath, ds))
  );
}

export function clearLayerGeojsonCache(): void {
  cache.clear();
  inFlight.clear();
}

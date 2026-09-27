import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();

function cacheKey(projectPath: string, datasource: string): string {
  return `${projectPath}::${datasource}`;
}

export function getCachedGeojson(
  projectPath: string,
  datasource: string,
): string | null {
  return cache.get(cacheKey(projectPath, datasource)) ?? null;
}

export function fetchLayerGeojson(
  projectPath: string,
  datasource: string,
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

// Membatasi jumlah konversi paralel (ogr2ogr) yang berjalan bersamaan.
// Menjalankan semua layer sekaligus tanpa batas justru bisa membuat total
// waktu loading lebih lambat karena CPU/disk I/O rebutan resource, terutama
// untuk project dengan banyak layer atau file besar.
const PREFETCH_CONCURRENCY = 3;

export async function prefetchAllLayers(
  projectPath: string,
  datasources: string[],
): Promise<void> {
  const queue = [...datasources];

  async function worker() {
    while (queue.length > 0) {
      const ds = queue.shift();
      if (ds === undefined) break;
      try {
        await fetchLayerGeojson(projectPath, ds);
      } catch {
        // Kegagalan satu layer tidak menghentikan layer lain; error asli
        // tetap tersimpan di cache "inFlight" rejection dan akan muncul
        // lagi saat komponen preview memanggil fetchLayerGeojson ulang.
      }
    }
  }

  const workerCount = Math.min(PREFETCH_CONCURRENCY, datasources.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
}

export function clearLayerGeojsonCache(): void {
  cache.clear();
  inFlight.clear();
}

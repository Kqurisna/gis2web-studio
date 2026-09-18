export interface GeojsonFeatureLike {
  type: string;
  properties: Record<string, unknown> | null;
  geometry: unknown;
}

export interface ParsedGeojsonLayer {
  fields: string[];
  features: GeojsonFeatureLike[];
}

/**
 * Parse GeoJSON text dan ambil daftar field (kolom atribut) secara dinamis
 * dari union seluruh feature (bukan hanya feature pertama, supaya field yang
 * hanya muncul di sebagian feature tetap terdeteksi), plus daftar feature-nya
 * untuk dipakai merender tabel/menyinkronkan dengan peta.
 */
export function parseGeojsonForAttributeTable(geojsonText: string): ParsedGeojsonLayer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(geojsonText);
  } catch {
    return { fields: [], features: [] };
  }

  const featureCollection = parsed as { features?: unknown };
  const rawFeatures = Array.isArray(featureCollection?.features)
    ? (featureCollection.features as GeojsonFeatureLike[])
    : [];

  const fieldSet = new Set<string>();
  for (const feature of rawFeatures) {
    const props = feature?.properties;
    if (props && typeof props === "object") {
      Object.keys(props).forEach((key) => fieldSet.add(key));
    }
  }

  return {
    fields: Array.from(fieldSet),
    features: rawFeatures,
  };
}

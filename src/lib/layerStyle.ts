import type L from "leaflet";
import type { LayerInfo } from "../components/ProjectPanel";

export function styleForLayer(
  color: string,
  isBoundary: boolean,
  fillOpacity: number
): L.PathOptions {
  return isBoundary
    ? { color, weight: 2, fillOpacity: 0 }
    : { color, weight: 1.5, fillOpacity };
}

export function resolveFeatureColor(
  layer: LayerInfo,
  categoryColorOverrides: Record<string, string> | undefined,
  feature: GeoJSON.Feature | undefined,
  fallbackColor: string
): string {
  // Categorized renderer (warna per nilai diskrit)
  if (layer.categories && layer.categories.length > 0 && layer.category_field) {
    const rawValue = feature?.properties?.[layer.category_field];
    const valueKey = rawValue === null || rawValue === undefined ? "NULL" : String(rawValue);

    const override = categoryColorOverrides?.[valueKey];
    if (override) return override;

    const matched = layer.categories.find((cat) => cat.value === valueKey);
    if (matched) return matched.color;

    return fallbackColor;
  }

  // Graduated renderer (warna per rentang angka). Field sumber nilainya sama
  // dengan category_field (di QGIS keduanya memakai atribut "attr" pada
  // <renderer-v2>, diparse ke field yang sama di backend).
  if (layer.ranges && layer.ranges.length > 0 && layer.category_field) {
    const rawValue = feature?.properties?.[layer.category_field];
    const numericValue = typeof rawValue === "number" ? rawValue : parseFloat(String(rawValue));
    if (!Number.isNaN(numericValue)) {
      const matched = layer.ranges.find(
        (r) => numericValue >= r.lower && numericValue <= r.upper
      );
      if (matched) {
        const override = categoryColorOverrides?.[matched.label];
        if (override) return override;
        return matched.color;
      }
    }
    return fallbackColor;
  }

  return fallbackColor;
}

export function getStrongHighlightStyle(base: L.PathOptions): L.PathOptions {
  return {
    ...base,
    weight: (base.weight ?? 1.5) + 3,
    color: "#facc15",
    fillOpacity: Math.min((base.fillOpacity ?? 0.35) + 0.25, 0.85),
    dashArray: undefined,
  };
}

export function getSubtleHighlightStyle(base: L.PathOptions): L.PathOptions {
  return {
    ...base,
    weight: (base.weight ?? 1.5) + 1.5,
    fillOpacity: Math.min((base.fillOpacity ?? 0.35) + 0.1, 0.7),
  };
}

// Preview hover: visual sementara yang berbeda dari highlight seleksi
// (getStrongHighlightStyle/getSubtleHighlightStyle), supaya user bisa
// membedakan "sedang di-hover" vs "sudah dipilih/diklik".
export function getPreviewHighlightStyle(base: L.PathOptions): L.PathOptions {
  return {
    ...base,
    weight: (base.weight ?? 1.5) + 2,
    color: "#3b82f6",
    dashArray: "4 3",
    fillOpacity: Math.min((base.fillOpacity ?? 0.35) + 0.1, 0.65),
  };
}

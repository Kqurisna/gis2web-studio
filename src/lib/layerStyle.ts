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
  if (!layer.categories || layer.categories.length === 0 || !layer.category_field) {
    return fallbackColor;
  }
  const rawValue = feature?.properties?.[layer.category_field];
  const valueKey = rawValue === null || rawValue === undefined ? "NULL" : String(rawValue);

  const override = categoryColorOverrides?.[valueKey];
  if (override) return override;

  const matched = layer.categories.find((cat) => cat.value === valueKey);
  if (matched) return matched.color;

  return fallbackColor;
}

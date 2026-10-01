import { useEffect, useRef } from "react";
import L from "leaflet";
import type { LayerInfo } from "./ProjectPanel";
import type { WebGisConfig } from "./ConfigurationPanel";
import { getCachedGeojson } from "../lib/layerGeojsonCache";
import { styleForLayer, resolveFeatureColor } from "../lib/layerStyle";

interface ExportPreviewMapProps {
  projectPath: string | null;
  layers: LayerInfo[];
  selectedLayerIndexes: number[];
  boundaryLayerIndex: number | null;
  layerColors: Record<number, string>;
  layerCategoryColors: Record<number, Record<string, string>>;
  layerOpacities: Record<number, number>;
  layerPointSizes: Record<number, number>;
  layerOrder: number[];
  config: WebGisConfig;
}

// Preview export murni dari CACHE (hasil prefetch saat import), tidak pernah
// memanggil invoke/ogr2ogr, tidak menulis file apa pun. Layer yang belum ada
// di cache (gagal prefetch) di-skip diam-diam, bukan memicu fetch baru.
function ExportPreviewMap({
  projectPath,
  layers,
  selectedLayerIndexes,
  boundaryLayerIndex,
  layerColors,
  layerCategoryColors,
  layerOpacities,
  layerPointSizes,
  layerOrder,
  config,
}: ExportPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { zoomControl: true }).setView([-2.5, 118], 5);
    mapRef.current = map;
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !projectPath) return;

    map.eachLayer((l) => {
      if (l instanceof L.TileLayer || l instanceof L.GeoJSON) map.removeLayer(l);
    });

    L.tileLayer(config.basemap === "custom" ? "" : basemapUrl(config.basemap), {
      attribution: "",
    }).addTo(map);
    map.setMinZoom(config.minZoom);
    map.setMaxZoom(config.maxZoom);

    const indexesSet = new Set([
      ...selectedLayerIndexes,
      ...(boundaryLayerIndex !== null ? [boundaryLayerIndex] : []),
    ]);
    const indexesToShow = [
      ...layerOrder.filter((idx) => indexesSet.has(idx)),
      ...Array.from(indexesSet).filter((idx) => !layerOrder.includes(idx)),
    ];

    const allBounds: L.LatLngBounds[] = [];

    for (const index of indexesToShow) {
      const layer = layers[index];
      if (!layer) continue;
      const cached = getCachedGeojson(projectPath, layer.datasource);
      if (cached === null) continue;

      let data: GeoJSON.GeoJsonObject;
      try {
        data = JSON.parse(cached);
      } catch {
        continue;
      }

      const isBoundary = index === boundaryLayerIndex;
      const layerColor = layerColors[index] ?? (isBoundary ? "#f97316" : "#2563eb");
      const layerOpacity = layerOpacities[index] ?? 0.35;
      const categoryOverrides = layerCategoryColors[index];
      const hasCategories = !!layer.categories && layer.categories.length > 0;
      const hasRanges = !!layer.ranges && layer.ranges.length > 0;
      const hasClassifiedStyle = hasCategories || hasRanges;

      const style: L.StyleFunction = (feature) => {
        const resolvedColor = hasClassifiedStyle
          ? resolveFeatureColor(layer, categoryOverrides, feature, layerColor)
          : layerColor;
        return styleForLayer(resolvedColor, isBoundary, layerOpacity);
      };

      const geoLayer = L.geoJSON(data, {
        style,
        pointToLayer: (feature, latlng) => {
          const resolvedColor = hasClassifiedStyle
            ? resolveFeatureColor(layer, categoryOverrides, feature, layerColor)
            : layerColor;
          return L.circleMarker(latlng, {
            radius: layerPointSizes[index] ?? 5,
            color: resolvedColor,
            fillOpacity: layerOpacity,
          });
        },
      }).addTo(map);

      const b = geoLayer.getBounds();
      if (b.isValid()) allBounds.push(b);
    }

    if (allBounds.length > 0) {
      const combined = allBounds.reduce((acc, b) => acc.extend(b), allBounds[0]);
      map.fitBounds(combined, { padding: [16, 16] });
    }
  }, [
    projectPath,
    layers,
    selectedLayerIndexes,
    boundaryLayerIndex,
    layerColors,
    layerCategoryColors,
    layerOpacities,
    layerPointSizes,
    layerOrder,
    config.basemap,
    config.minZoom,
    config.maxZoom,
  ]);

  return <div ref={containerRef} className="export-preview-map" />;
}

function basemapUrl(basemap: WebGisConfig["basemap"]): string {
  switch (basemap) {
    case "satellite":
      return "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
    case "topo":
      return "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
    default:
      return "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  }
}

export default ExportPreviewMap;

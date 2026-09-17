import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { invoke } from "@tauri-apps/api/core";
import type { LayerInfo } from "./ProjectPanel";
import type { WebGisConfig, BasemapOption } from "./ConfigurationPanel";

interface MapViewProps {
  projectPath: string | null;
  layers: LayerInfo[];
  selectedLayerIndexes: number[];
  boundaryLayerIndex: number | null;
  config: WebGisConfig;
  layerColors: Record<number, string>;
  layerOpacities: Record<number, number>;
  layerOrder: number[];
  activeLayerIndex: number | null;
  onFocusLayer: (index: number) => void;
}

interface BasemapTileDef {
  url: string;
  attribution: string;
  maxNativeZoom?: number;
}

const BASEMAP_TILE_CONFIG: Record<BasemapOption, BasemapTileDef> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri",
    maxNativeZoom: 19,
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
    maxNativeZoom: 17,
  },
};

function styleForLayer(
  color: string,
  isBoundary: boolean,
  fillOpacity: number
): L.PathOptions {
  return isBoundary
    ? { color, weight: 2, fillOpacity: 0 }
    : { color, weight: 1.5, fillOpacity };
}

function MapView({
  projectPath,
  layers,
  selectedLayerIndexes,
  boundaryLayerIndex,
  config,
  layerColors,
  layerOpacities,
  layerOrder,
  activeLayerIndex,
  onFocusLayer,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const dataLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const layerRefsRef = useRef<Map<number, L.GeoJSON>>(new Map());
  const layerStyleRef = useRef<Map<number, L.PathOptions>>(new Map());
  const layerOrderRef = useRef<number[]>(layerOrder);

  const [layerErrors, setLayerErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  function applyStackingOrder(order: number[]) {
    [...order].reverse().forEach((idx) => {
      layerRefsRef.current.get(idx)?.bringToFront();
    });
  }

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false }).setView(
      [-2.5, 118],
      5
    );
    L.control.zoom({ position: "bottomright" }).addTo(map);
    dataLayerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
    }

    const basemapDef = BASEMAP_TILE_CONFIG[config.basemap];
    const tileLayer = L.tileLayer(basemapDef.url, {
      attribution: basemapDef.attribution,
      maxNativeZoom: basemapDef.maxNativeZoom,
    });
    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    map.setMinZoom(config.minZoom);
    map.setMaxZoom(config.maxZoom);
  }, [config.basemap, config.minZoom, config.maxZoom]);

  useEffect(() => {
    const map = mapRef.current;
    const group = dataLayerGroupRef.current;
    if (!map || !group || !projectPath) return;

    const activeMap = map;
    const activeGroup = group;

    let cancelled = false;

    async function loadLayers() {
      setIsLoading(true);
      setLayerErrors([]);
      activeGroup.clearLayers();
      layerRefsRef.current.clear();
      layerStyleRef.current.clear();

      const errors: string[] = [];
      let boundaryGeoLayer: L.GeoJSON | null = null;

      const indexesToLoad = Array.from(
        new Set([
          ...selectedLayerIndexes,
          ...(boundaryLayerIndex !== null ? [boundaryLayerIndex] : []),
        ])
      );

      for (const index of indexesToLoad) {
        const layer = layers[index];
        if (!layer) continue;

        try {
          const geojsonText = await invoke<string>("get_layer_geojson", {
            projectPath,
            datasource: layer.datasource,
          });
          const geojsonData = JSON.parse(geojsonText);

          const isBoundary = index === boundaryLayerIndex;
          const layerColor = layerColors[index] ?? (isBoundary ? "#f97316" : "#2563eb");
          const layerOpacity = layerOpacities[index] ?? 0.35;
          const style = styleForLayer(layerColor, isBoundary, layerOpacity);

          const geoLayer = L.geoJSON(geojsonData, {
            style,
            pointToLayer: (_feature, latlng) =>
              L.circleMarker(latlng, {
                radius: 5,
                color: layerColor,
                fillOpacity: layerOpacity,
              }),
          });

          geoLayer.on("click", () => onFocusLayer(index));

          layerRefsRef.current.set(index, geoLayer);
          layerStyleRef.current.set(index, style);

          if (isBoundary) {
            boundaryGeoLayer = geoLayer;
          }

          if (selectedLayerIndexes.includes(index) || isBoundary) {
            geoLayer.addTo(activeGroup);
          }
        } catch (err) {
          let message: string;
          if (err instanceof Error) {
            message = err.message;
          } else if (typeof err === "string") {
            message = err;
          } else {
            try {
              message = JSON.stringify(err);
            } catch {
              message = "Terjadi error yang tidak diketahui";
            }
          }
          errors.push(`${layer.name}: ${message}`);
        }
      }

      if (!cancelled) {
        setLayerErrors(errors);
        setIsLoading(false);
        applyStackingOrder(layerOrderRef.current);

        if (boundaryGeoLayer) {
          const bounds = boundaryGeoLayer.getBounds();
          if (bounds.isValid()) {
            activeMap.flyToBounds(bounds, {
              maxZoom: config.maxZoom,
              duration: 2.4,
              easeLinearity: 0.08,
            });
          }
        }
      }
    }

    loadLayers();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, layers, selectedLayerIndexes, boundaryLayerIndex, layerColors]);

  useEffect(() => {
    layerOrderRef.current = layerOrder;
    applyStackingOrder(layerOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerOrder]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeLayerIndex === null) return;

    const geoLayer = layerRefsRef.current.get(activeLayerIndex);
    if (!geoLayer) return;

    const bounds = geoLayer.getBounds();
    if (bounds.isValid()) {
      map.flyToBounds(bounds, {
        maxZoom: config.maxZoom,
        padding: [40, 40],
        duration: 1.6,
        easeLinearity: 0.08,
      });
    }

    geoLayer.setStyle({ weight: 5 });

    const timeout = window.setTimeout(() => {
      const originalStyle = layerStyleRef.current.get(activeLayerIndex);
      if (originalStyle) {
        geoLayer.setStyle(originalStyle);
      }
    }, 900);

    return () => window.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeLayerIndex]);

  return (
    <div className="map-view-wrapper">
      {isLoading && (
        <div className="map-status-banner">Memuat layer...</div>
      )}
      {layerErrors.length > 0 && (
        <div className="map-error-banner">
          <strong>Beberapa layer gagal dimuat:</strong>
          <ul>
            {layerErrors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        </div>
      )}
      <div ref={containerRef} className="map-container" />
    </div>
  );
}

export default MapView;

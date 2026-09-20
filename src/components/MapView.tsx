import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { fetchLayerGeojson } from "../lib/layerGeojsonCache";
import { styleForLayer, resolveFeatureColor, getStrongHighlightStyle, getSubtleHighlightStyle } from "../lib/layerStyle";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import { pointToLineDistance } from "@turf/point-to-line-distance";
import { polygonToLine } from "@turf/polygon-to-line";
import type { LayerInfo } from "./ProjectPanel";
import type { WebGisConfig, BasemapOption, FeatureDisplayMode } from "./ConfigurationPanel";

interface MapViewProps {
  projectPath: string | null;
  layers: LayerInfo[];
  selectedLayerIndexes: number[];
  boundaryLayerIndex: number | null;
  config: WebGisConfig;
  layerColors: Record<number, string>;
  layerCategoryColors: Record<number, Record<string, string>>;
  layerOpacities: Record<number, number>;
  layerOrder: number[];
  activeLayerIndex: number | null;
  onFocusLayer: (index: number) => void;
  activeFeature: { layerIndex: number; featureIndex: number } | null;
  onFocusFeature: (layerIndex: number, featureIndex: number) => void;
  visibleFields: Record<number, string[]>;
  featureDisplayMode: FeatureDisplayMode;
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

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function MapView({
  projectPath,
  layers,
  selectedLayerIndexes,
  boundaryLayerIndex,
  config,
  layerColors,
  layerCategoryColors,
  layerOpacities,
  layerOrder,
  activeLayerIndex,
  onFocusLayer,
  activeFeature,
  onFocusFeature,
  visibleFields,
  featureDisplayMode,
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const dataLayerGroupRef = useRef<L.LayerGroup | null>(null);
  const layerRefsRef = useRef<Map<number, L.GeoJSON>>(new Map());
  const layerStyleRef = useRef<Map<number, L.PathOptions | L.StyleFunction>>(new Map());
  const featureLayerRefsRef = useRef<Map<string, L.Layer>>(new Map());
  const layerGeojsonDataRef = useRef<Map<number, GeoJSON.FeatureCollection>>(new Map());
  const clickCycleRef = useRef<{
    point: L.Point | null;
    matches: { layerIndex: number; featureIndex: number }[];
    index: number;
  }>({ point: null, matches: [], index: -1 });
  const layerOrderRef = useRef<number[]>(layerOrder);
  const prevBoundaryLayerIndexRef = useRef<number | null>(null);
  const visibleFieldsRef = useRef<Record<number, string[]>>(visibleFields);
  const featureDisplayModeRef = useRef<FeatureDisplayMode>(featureDisplayMode);

  useEffect(() => {
    visibleFieldsRef.current = visibleFields;
  }, [visibleFields]);

  useEffect(() => {
    featureDisplayModeRef.current = featureDisplayMode;
  }, [featureDisplayMode]);

  const [layerErrors, setLayerErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  function applyStackingOrder(order: number[]) {
    [...order].reverse().forEach((idx) => {
      layerRefsRef.current.get(idx)?.bringToFront();
    });
  }

  const handleCycleClickRef = useRef<((e: L.LeafletMouseEvent) => void) | null>(null);

  const NEAREST_FEATURE_PIXEL_TOLERANCE = 12;

  function getVisibleZOrderedFeatureCandidates(latlng: L.LatLng) {
    const group = dataLayerGroupRef.current;
    const map = mapRef.current;
    if (!group || !map) return [];

    const pt = turfPoint([latlng.lng, latlng.lat]);
    const candidates: { layerIndex: number; featureIndex: number; layerInstance: L.Layer }[] = [];
    // Dipakai untuk fallback nearest-feature: jarak (meter) tiap kandidat ke titik klik.
    const nearestByDistance: {
      layerIndex: number;
      featureIndex: number;
      layerInstance: L.Layer;
      distanceMeters: number;
    }[] = [];

    // Toleransi klik dalam meter, dihitung dari toleransi piksel layar pada
    // zoom saat ini, supaya konsisten secara visual di semua level zoom.
    const clickPoint = map.latLngToContainerPoint(latlng);
    const toleranceProbePoint = L.point(clickPoint.x + NEAREST_FEATURE_PIXEL_TOLERANCE, clickPoint.y);
    const toleranceLatLng = map.containerPointToLatLng(toleranceProbePoint);
    const toleranceMeters = latlng.distanceTo(toleranceLatLng);

    const orderedLayerIndexes = [...layerOrderRef.current];
    layerRefsRef.current.forEach((_geoLayer, idx) => {
      if (!orderedLayerIndexes.includes(idx)) orderedLayerIndexes.push(idx);
    });

    for (const layerIndex of orderedLayerIndexes) {
      const geoLayer = layerRefsRef.current.get(layerIndex);
      if (!geoLayer || !group.hasLayer(geoLayer)) continue;

      const geojsonData = layerGeojsonDataRef.current.get(layerIndex);
      if (!geojsonData) continue;

      const features = geojsonData.features ?? [];
      const matchedInLayer: number[] = [];

      features.forEach((feature, featureIndex) => {
        const geomType = feature.geometry?.type;
        if (geomType !== "Polygon" && geomType !== "MultiPolygon") return;
        const typedFeature = feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

        try {
          if (booleanPointInPolygon(pt, typedFeature)) {
            matchedInLayer.push(featureIndex);
            return;
          }
        } catch {
          // geometry tidak valid, skip exact hit-test untuk feature ini
        }

        // Fallback: feature kecil (mis. buffer radius kecil) sering meleset
        // dari exact point-in-polygon. Hitung jarak titik klik ke garis luar
        // polygon; kalau masih dalam toleransi piksel, anggap "kena".
        try {
          const boundaryLine = polygonToLine(typedFeature);
          const lineFeatures =
            boundaryLine.type === "FeatureCollection" ? boundaryLine.features : [boundaryLine];

          // pointToLineDistance hanya menerima LineString tunggal; pecah
          // setiap MultiLineString menjadi beberapa LineString terpisah.
          const singleLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
          lineFeatures.forEach((lf) => {
            if (lf.geometry.type === "LineString") {
              singleLines.push(lf as GeoJSON.Feature<GeoJSON.LineString>);
            } else if (lf.geometry.type === "MultiLineString") {
              lf.geometry.coordinates.forEach((coords) => {
                singleLines.push({
                  type: "Feature",
                  properties: {},
                  geometry: { type: "LineString", coordinates: coords },
                });
              });
            }
          });

          for (const line of singleLines) {
            const distanceMeters = pointToLineDistance(pt, line, { units: "meters" });
            if (distanceMeters <= toleranceMeters) {
              const key = `${layerIndex}:${featureIndex}`;
              const layerInstance = featureLayerRefsRef.current.get(key);
              if (layerInstance) {
                nearestByDistance.push({ layerIndex, featureIndex, layerInstance, distanceMeters });
              }
              break;
            }
          }
        } catch {
          // geometry tidak valid untuk fallback juga, skip
        }
      });

      matchedInLayer
        .sort((a, b) => b - a)
        .forEach((featureIndex) => {
          const key = `${layerIndex}:${featureIndex}`;
          const layerInstance = featureLayerRefsRef.current.get(key);
          if (layerInstance) {
            candidates.push({ layerIndex, featureIndex, layerInstance });
          }
        });
    }

    // Exact hit selalu diprioritaskan. Fallback nearest-feature hanya dipakai
    // kalau tidak ada exact hit sama sekali di titik klik, diurutkan dari
    // yang paling dekat ke titik klik.
    if (candidates.length === 0 && nearestByDistance.length > 0) {
      nearestByDistance.sort((a, b) => a.distanceMeters - b.distanceMeters);
      return nearestByDistance.map(({ layerIndex, featureIndex, layerInstance }) => ({
        layerIndex,
        featureIndex,
        layerInstance,
      }));
    }

    return candidates;
  }

  useEffect(() => {
    handleCycleClickRef.current = (e: L.LeafletMouseEvent) => {
      const map = mapRef.current;
      if (!map) return;

      const candidates = getVisibleZOrderedFeatureCandidates(e.latlng);
      if (candidates.length === 0) return;

      const clickPoint = map.latLngToContainerPoint(e.latlng);
      const prev = clickCycleRef.current;

      const sameKeys =
        prev.matches.length === candidates.length &&
        prev.matches.every(
          (m, i) => m.layerIndex === candidates[i].layerIndex && m.featureIndex === candidates[i].featureIndex
        );
      const closeToPrev = prev.point ? prev.point.distanceTo(clickPoint) < 15 : false;

      const nextIndex = sameKeys && closeToPrev ? (prev.index + 1) % candidates.length : 0;

      clickCycleRef.current = {
        point: clickPoint,
        matches: candidates.map(({ layerIndex, featureIndex }) => ({ layerIndex, featureIndex })),
        index: nextIndex,
      };

      const selected = candidates[nextIndex];
      onFocusFeature(selected.layerIndex, selected.featureIndex);

      // Leaflet otomatis membuka popup pada layer yang benar-benar disentuh
      // (e.target), terlepas dari feature mana yang dipilih oleh cycle logic
      // di atas. Supaya mode "card" benar-benar tidak menampilkan popup apa
      // pun, tutup SEMUA popup yang mungkin terbuka di seluruh feature dulu,
      // baru buka ulang sesuai mode yang aktif.
      featureLayerRefsRef.current.forEach((layerInstance) => {
        const anyLayer = layerInstance as L.Layer & { closePopup?: () => L.Layer };
        anyLayer.closePopup?.();
      });

      if (featureDisplayModeRef.current !== "card") {
        const anyLayer = selected.layerInstance as L.Layer & {
          openPopup?: (latlng?: L.LatLng) => L.Layer;
        };
        anyLayer.openPopup?.(e.latlng);
      }
    };
  });

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, { zoomControl: false, doubleClickZoom: false }).setView(
      [-2.5, 118],
      5
    );
    L.control.zoom({ position: "bottomright" }).addTo(map);
    dataLayerGroupRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Trackpad MacBook: double-tap 2 jari memicu gesture native "Smart Zoom"
    // bawaan WKWebView, terpisah dari dblclick Leaflet biasa. Cegah di level
    // container map saja (bukan document/global) supaya tidak mengganggu
    // double-click di elemen UI lain (form, panel, dsb).
    const containerEl = containerRef.current;
    const preventNativeDblZoom = (ev: Event) => {
      ev.preventDefault();
      ev.stopPropagation();
    };
    containerEl.addEventListener("dblclick", preventNativeDblZoom, { capture: true });

    return () => {
      containerEl.removeEventListener("dblclick", preventNativeDblZoom, { capture: true } as EventListenerOptions);
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
    const activeProjectPath = projectPath;

    let cancelled = false;

    async function loadLayers() {
      setIsLoading(true);
      setLayerErrors([]);
      activeGroup.clearLayers();
      layerRefsRef.current.clear();
      layerStyleRef.current.clear();
      featureLayerRefsRef.current.clear();
      layerGeojsonDataRef.current.clear();

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
          const geojsonText = await fetchLayerGeojson(activeProjectPath, layer.datasource);
          const geojsonData = JSON.parse(geojsonText);
          layerGeojsonDataRef.current.set(index, geojsonData);

          const isBoundary = index === boundaryLayerIndex;
          const layerColor = layerColors[index] ?? (isBoundary ? "#f97316" : "#2563eb");
          const layerOpacity = layerOpacities[index] ?? 0.35;
          const categoryOverrides = layerCategoryColors[index];
          const hasCategories = !!layer.categories && layer.categories.length > 0;

          const style: L.StyleFunction = (feature) => {
            const resolvedColor = hasCategories
              ? resolveFeatureColor(layer, categoryOverrides, feature, layerColor)
              : layerColor;
            return styleForLayer(resolvedColor, isBoundary, layerOpacity);
          };

          const geoLayer = L.geoJSON(geojsonData, {
            style,
            pointToLayer: (feature, latlng) => {
              const resolvedColor = hasCategories
                ? resolveFeatureColor(layer, categoryOverrides, feature, layerColor)
                : layerColor;
              return L.circleMarker(latlng, {
                radius: 5,
                color: resolvedColor,
                fillOpacity: layerOpacity,
              });
            },
            onEachFeature: (feature, layerInstance) => {
              const featureIndex = geojsonData.features.indexOf(feature);
              const properties = feature.properties as Record<string, unknown> | null;

              if (properties && Object.keys(properties).length > 0) {
                layerInstance.bindPopup(() => {
                  const selectedFields = visibleFieldsRef.current[index];
                  const allKeys = Object.keys(properties);
                  const fieldsToShow = selectedFields
                    ? selectedFields.filter((f) => allKeys.includes(f))
                    : allKeys;

                  if (fieldsToShow.length === 0) {
                    return `<div class="feature-popup"><p class="feature-popup-empty">Tidak ada kolom yang dipilih untuk ditampilkan.</p></div>`;
                  }

                  const rows = fieldsToShow
                    .map((key) => {
                      const value = properties[key];
                      return `<tr><th>${escapeHtml(key)}</th><td>${escapeHtml(
                        value === null || value === undefined ? "-" : String(value)
                      )}</td></tr>`;
                    })
                    .join("");

                  return `<div class="feature-popup"><table class="feature-popup-table">${rows}</table></div>`;
                }, { autoPan: false });
              }

              if (featureIndex !== -1) {
                featureLayerRefsRef.current.set(`${index}:${featureIndex}`, layerInstance);
                layerInstance.on("click", (e: L.LeafletMouseEvent) => {
                  handleCycleClickRef.current?.(e);
                });
              }
            },
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

        if (boundaryGeoLayer && boundaryLayerIndex !== prevBoundaryLayerIndexRef.current) {
          const bounds = boundaryGeoLayer.getBounds();
          if (bounds.isValid()) {
            activeMap.flyToBounds(bounds, {
              maxZoom: config.maxZoom,
              duration: 2.4,
              easeLinearity: 0.08,
            });
          }
        }
        prevBoundaryLayerIndexRef.current = boundaryLayerIndex;
      }
    }

    loadLayers();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath, layers, selectedLayerIndexes, boundaryLayerIndex, layerColors, layerCategoryColors]);

  useEffect(() => {
    layerOrderRef.current = layerOrder;
    applyStackingOrder(layerOrder);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerOrder]);

  // Opacity harus langsung terlihat begitu slider digeser, tanpa menunggu
  // effect loadLayers (yang berat: clear + rebuild semua layer, reset popup,
  // reset highlight). Jadi cukup panggil setStyle() ke layer yang sudah
  // terender, dengan opacity terbaru, tanpa fetch ulang atau rebuild apa pun.
  useEffect(() => {
    layerRefsRef.current.forEach((geoLayer, index) => {
      const layer = layers[index];
      if (!layer) return;

      const isBoundary = index === boundaryLayerIndex;
      const layerColor = layerColors[index] ?? (isBoundary ? "#f97316" : "#2563eb");
      const layerOpacity = layerOpacities[index] ?? 0.35;
      const categoryOverrides = layerCategoryColors[index];
      const hasCategories = !!layer.categories && layer.categories.length > 0;

      const style: L.StyleFunction = (feature) => {
        const resolvedColor = hasCategories
          ? resolveFeatureColor(layer, categoryOverrides, feature, layerColor)
          : layerColor;
        return styleForLayer(resolvedColor, isBoundary, layerOpacity);
      };

      geoLayer.setStyle(style);
      layerStyleRef.current.set(index, style);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerOpacities]);

  // Opacity harus langsung terlihat begitu slider digeser, tanpa menunggu
  // effect loadLayers (yang berat: clear + rebuild semua layer, reset popup,
  // reset highlight). Jadi cukup panggil setStyle() ke layer yang sudah
  // terender, dengan opacity terbaru, tanpa fetch ulang atau rebuild apa pun.
  useEffect(() => {
    layerRefsRef.current.forEach((geoLayer, index) => {
      const layer = layers[index];
      if (!layer) return;

      const isBoundary = index === boundaryLayerIndex;
      const layerColor = layerColors[index] ?? (isBoundary ? "#f97316" : "#2563eb");
      const layerOpacity = layerOpacities[index] ?? 0.35;
      const categoryOverrides = layerCategoryColors[index];
      const hasCategories = !!layer.categories && layer.categories.length > 0;

      const style: L.StyleFunction = (feature) => {
        const resolvedColor = hasCategories
          ? resolveFeatureColor(layer, categoryOverrides, feature, layerColor)
          : layerColor;
        return styleForLayer(resolvedColor, isBoundary, layerOpacity);
      };

      geoLayer.setStyle(style);
      layerStyleRef.current.set(index, style);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layerOpacities]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeLayerIndex === null) return;

    const geoLayer = layerRefsRef.current.get(activeLayerIndex);
    if (!geoLayer) return;

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

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeFeature) return;
    if (featureDisplayMode === "card") return;

    const key = `${activeFeature.layerIndex}:${activeFeature.featureIndex}`;
    const layerInstance = featureLayerRefsRef.current.get(key);
    if (!layerInstance) return;

    const anyLayer = layerInstance as L.Layer & {
      getBounds?: () => L.LatLngBounds;
      getLatLng?: () => L.LatLng;
      openPopup: () => L.Layer;
    };

    anyLayer.openPopup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeFeature, featureDisplayMode]);

  useEffect(() => {
    if (!activeFeature) return;

    const key = `${activeFeature.layerIndex}:${activeFeature.featureIndex}`;
    const layerInstance = featureLayerRefsRef.current.get(key);
    if (!layerInstance) return;

    const anyLayer = layerInstance as L.Layer & {
      getPopup?: () => L.Popup | undefined;
      isPopupOpen?: () => boolean;
      closePopup: () => L.Layer;
    };

    if (typeof anyLayer.isPopupOpen === "function" && anyLayer.isPopupOpen()) {
      if (featureDisplayMode === "card") {
        anyLayer.closePopup();
      } else {
        anyLayer.getPopup?.()?.update();
      }
    }
  }, [visibleFields, activeFeature, featureDisplayMode]);

  // Visual feedback: feature yang diklik mendapat strong highlight,
  // feature lain di layer yang sama mendapat subtle highlight,
  // feature dari layer lain kembali ke style normal.
  // Generic: dikelompokkan berdasarkan layerIndex (key "layerIndex:featureIndex"),
  // bukan berdasarkan nama layer.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    featureLayerRefsRef.current.forEach((layerInstance, key) => {
      const [layerIndexStr, featureIndexStr] = key.split(":");
      const layerIndex = Number(layerIndexStr);
      const featureIndex = Number(featureIndexStr);

      const styleFnOrObj = layerStyleRef.current.get(layerIndex);
      if (!styleFnOrObj) return;

      const anyLayer = layerInstance as L.Path & { feature?: GeoJSON.Feature };
      if (typeof anyLayer.setStyle !== "function") return;

      const baseStyle =
        typeof styleFnOrObj === "function"
          ? styleFnOrObj(anyLayer.feature as GeoJSON.Feature)
          : styleFnOrObj;
      if (!baseStyle) return;

      if (!activeFeature || activeFeature.layerIndex !== layerIndex) {
        anyLayer.setStyle(baseStyle);
        return;
      }

      if (featureIndex === activeFeature.featureIndex) {
        anyLayer.setStyle(getStrongHighlightStyle(baseStyle));
        if (typeof (anyLayer as L.Path).bringToFront === "function") {
          (anyLayer as L.Path).bringToFront();
        }
      } else {
        anyLayer.setStyle(getSubtleHighlightStyle(baseStyle));
      }
    });
  }, [activeFeature]);

  // Safety-net: zoom cepat kadang membuat Leaflet me-redraw path SVG
  // sehingga style highlight sesaat hilang. Re-apply highlight setelah
  // zoom selesai, tanpa mengubah logic utama di atas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const reapplyHighlight = () => {
      if (!activeFeature) return;

      featureLayerRefsRef.current.forEach((layerInstance, key) => {
        const [layerIndexStr, featureIndexStr] = key.split(":");
        const layerIndex = Number(layerIndexStr);
        const featureIndex = Number(featureIndexStr);

        if (layerIndex !== activeFeature.layerIndex) return;

        const styleFnOrObj = layerStyleRef.current.get(layerIndex);
        if (!styleFnOrObj) return;

        const anyLayer = layerInstance as L.Path & { feature?: GeoJSON.Feature };
        if (typeof anyLayer.setStyle !== "function") return;

        const baseStyle =
          typeof styleFnOrObj === "function"
            ? styleFnOrObj(anyLayer.feature as GeoJSON.Feature)
            : styleFnOrObj;
        if (!baseStyle) return;

        if (featureIndex === activeFeature.featureIndex) {
          anyLayer.setStyle(getStrongHighlightStyle(baseStyle));
          if (typeof anyLayer.bringToFront === "function") {
            anyLayer.bringToFront();
          }
        } else {
          anyLayer.setStyle(getSubtleHighlightStyle(baseStyle));
        }
      });
    };

    map.on("zoomend", reapplyHighlight);
    return () => {
      map.off("zoomend", reapplyHighlight);
    };
  }, [activeFeature]);

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

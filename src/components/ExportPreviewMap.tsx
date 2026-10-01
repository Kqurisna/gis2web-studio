import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import type { LayerInfo } from "./ProjectPanel";
import type { WebGisConfig, ExportConfig } from "./ConfigurationPanel";
import { getCachedGeojson } from "../lib/layerGeojsonCache";
import { styleForLayer, resolveFeatureColor, computeLabeledFeatureIndexes } from "../lib/layerStyle";

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
  layerVisibleFields: Record<number, string[]>;
  config: WebGisConfig;
  exportConfig: ExportConfig;
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
  layerVisibleFields,
  config,
  exportConfig,
}: ExportPreviewMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [card, setCard] = useState<{ layerName: string; rows: { key: string; value: string }[] } | null>(null);

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
    map.setMinZoom(exportConfig.minZoom);
    map.setMaxZoom(exportConfig.maxZoom);

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

      const labeledFeatureIndexes = computeLabeledFeatureIndexes(layer, data as GeoJSON.FeatureCollection);

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
        onEachFeature: (feature, layerInstance) => {
          const properties = feature.properties as Record<string, unknown> | null;
          const featureIndex = (data as GeoJSON.FeatureCollection).features.indexOf(feature);

          // Popup: sama seperti hasil export (field sesuai visible_fields).
          if (
            (exportConfig.featureDisplayMode === "popup" || exportConfig.featureDisplayMode === "both") &&
            properties &&
            Object.keys(properties).length > 0
          ) {
            layerInstance.bindPopup(() => {
              const selectedFields = layerVisibleFields[index];
              const allKeys = Object.keys(properties);
              const fieldsToShow = selectedFields
                ? selectedFields.filter((f) => allKeys.includes(f))
                : allKeys;
              if (fieldsToShow.length === 0) {
                return '<div class="feature-popup"><p class="feature-popup-empty">Tidak ada kolom yang dipilih untuk ditampilkan.</p></div>';
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

          // Feature Information card (mode "card" / "both"): klik feature
          // menampilkan card ringan, sama seperti showFeatureCard() di
          // hasil export (app.js), bukan komponen FeatureInfoCard penuh
          // yang dipakai aplikasi utama (tidak ada edit kolom di preview).
          if (exportConfig.featureDisplayMode === "card" || exportConfig.featureDisplayMode === "both") {
            layerInstance.on("click", () => {
              const selectedFields = layerVisibleFields[index];
              const allKeys = properties ? Object.keys(properties) : [];
              const fieldsToShow = selectedFields
                ? selectedFields.filter((f) => allKeys.includes(f))
                : allKeys;
              const rows = fieldsToShow.map((key) => {
                const value = properties ? properties[key] : undefined;
                return { key, value: value === null || value === undefined ? "-" : String(value) };
              });
              setCard({ layerName: layer.name, rows });
            });
          }

          // Labeling: sama seperti hasil export (tooltip permanent).
          if (layer.labeling && featureIndex !== -1 && labeledFeatureIndexes.has(featureIndex)) {
            const labelValue = properties?.[layer.labeling.field];
            const labelText =
              labelValue === null || labelValue === undefined ? "" : String(labelValue);
            if (labelText) {
              layerInstance.bindTooltip(escapeHtml(labelText), {
                permanent: true,
                direction: "center",
                className: "layer-feature-label",
              });
              layerInstance.once("tooltipopen", (e: L.LeafletEvent) => {
                const tooltipEl = (e as unknown as { tooltip: L.Tooltip }).tooltip.getElement();
                if (tooltipEl) {
                  tooltipEl.style.fontSize = `${exportConfig.labelFontSize}px`;
                }
              });
            }
          }
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
    exportConfig.minZoom,
    exportConfig.maxZoom,
    exportConfig.featureDisplayMode,
    exportConfig.labelFontSize,
    layerVisibleFields,
  ]);

  return (
    <div className="export-preview-map-wrap">
      <div ref={containerRef} className="export-preview-map" />
      {card && (
        <div className="export-preview-feature-card">
          <div className="export-preview-feature-card-header">
            <div>
              <p className="export-preview-feature-card-title">Feature Information</p>
              <p className="export-preview-feature-card-subtitle">{card.layerName}</p>
            </div>
            <button type="button" onClick={() => setCard(null)}>&times;</button>
          </div>
          <table className="feature-popup-table">
            <tbody>
              {card.rows.length === 0 ? (
                <tr><td>Tidak ada atribut.</td></tr>
              ) : (
                card.rows.map((r) => (
                  <tr key={r.key}><th>{r.key}</th><td>{r.value}</td></tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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

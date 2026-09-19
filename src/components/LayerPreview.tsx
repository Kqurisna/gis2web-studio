import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { getCachedGeojson, fetchLayerGeojson } from "../lib/layerGeojsonCache";
import { styleForLayer, resolveFeatureColor } from "../lib/layerStyle";
import type { LayerInfo } from "./ProjectPanel";

interface LayerPreviewProps {
  projectPath: string;
  datasource: string;
  layer: LayerInfo;
  fallbackColor: string;
  categoryColorOverrides?: Record<string, string>;
  name: string;
  visible: boolean;
}

function LayerPreview({
  projectPath,
  datasource,
  layer,
  fallbackColor,
  categoryColorOverrides,
  name,
  visible,
}: LayerPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const vectorLayerRef = useRef<L.GeoJSON | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Buat instance Leaflet map hanya SEKALI selama komponen ini hidup (tidak
  // pernah di-unmount oleh parent lagi), supaya tile basemap tidak perlu
  // dimuat ulang dari nol setiap kali user hover ke layer lain.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      boxZoom: false,
      keyboard: false,
    });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Setiap datasource/layer/fallbackColor/categoryColorOverrides berganti,
  // cukup ganti layer vektornya saja di atas map yang sudah ada (bukan
  // membuat map baru), lalu re-style per-feature memakai logic yang sama
  // dengan map utama (resolveFeatureColor + styleForLayer).
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    const hasCategories = !!layer.categories && layer.categories.length > 0;

    function applyData(text: string) {
      if (cancelled || !mapRef.current) return;
      const data = JSON.parse(text);

      if (vectorLayerRef.current) {
        mapRef.current.removeLayer(vectorLayerRef.current);
        vectorLayerRef.current = null;
      }

      const style: L.StyleFunction = (feature) => {
        const resolvedColor = hasCategories
          ? resolveFeatureColor(layer, categoryColorOverrides, feature, fallbackColor)
          : fallbackColor;
        return styleForLayer(resolvedColor, false, 0.5);
      };

      const geoLayer = L.geoJSON(data, {
        style,
        pointToLayer: (feature, latlng) => {
          const resolvedColor = hasCategories
            ? resolveFeatureColor(layer, categoryColorOverrides, feature, fallbackColor)
            : fallbackColor;
          return L.circleMarker(latlng, { radius: 4, color: resolvedColor, fillOpacity: 0.7 });
        },
      }).addTo(mapRef.current);
      vectorLayerRef.current = geoLayer;

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        mapRef.current.fitBounds(bounds, { padding: [12, 12] });
      } else {
        mapRef.current.setView([0, 0], 2);
      }
      setLoading(false);
    }

    const cached = getCachedGeojson(projectPath, datasource);
    if (cached !== null) {
      applyData(cached);
    } else {
      fetchLayerGeojson(projectPath, datasource)
        .then((text) => {
          if (!cancelled) applyData(text);
        })
        .catch((err) => {
          if (!cancelled) {
            setError(String(err));
            setLoading(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [projectPath, datasource, layer, fallbackColor, categoryColorOverrides]);

  return (
    <div className={"layer-preview-thumb" + (visible ? " layer-preview-thumb--visible" : "")}>
      <div className="layer-preview-header">
        <span className="layer-preview-color-dot" style={{ backgroundColor: fallbackColor }} />
        <span className="layer-preview-name">{name}</span>
      </div>
      <div className="layer-preview-map-wrap">
        {loading && (
          <div className="layer-preview-status">
            <span className="layer-preview-spinner" />
            Memuat preview...
          </div>
        )}
        {error && (
          <div className="layer-preview-status layer-preview-status--error">
            Gagal memuat preview
          </div>
        )}
        <div ref={containerRef} className="layer-preview-map" />
      </div>
    </div>
  );
}

export default LayerPreview;

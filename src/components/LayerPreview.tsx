import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import { getCachedGeojson, fetchLayerGeojson } from "../lib/layerGeojsonCache";

interface LayerPreviewProps {
  projectPath: string;
  datasource: string;
  color: string;
  x: number;
  y: number;
}

function LayerPreview({ projectPath, datasource, color, x, y }: LayerPreviewProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    function renderMap(text: string) {
      if (cancelled || !containerRef.current) return;
      const data = JSON.parse(text);

      const map = L.map(containerRef.current, {
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      });
      mapRef.current = map;

      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

      const geoLayer = L.geoJSON(data, {
        style: { color, weight: 2.5, fillOpacity: 0.12 },
        pointToLayer: (_f, latlng) =>
          L.circleMarker(latlng, { radius: 4, color, fillOpacity: 0.7 }),
      }).addTo(map);

      const bounds = geoLayer.getBounds();
      if (bounds.isValid()) {
        map.fitBounds(bounds, { padding: [12, 12] });
      } else {
        map.setView([0, 0], 2);
      }
      setLoading(false);
    }

    const cached = getCachedGeojson(projectPath, datasource);
    if (cached !== null) {
      setLoading(false);
      renderMap(cached);
      return () => {
        cancelled = true;
        if (mapRef.current) {
          mapRef.current.remove();
          mapRef.current = null;
        }
      };
    }

    setLoading(true);
    setError(null);

    fetchLayerGeojson(projectPath, datasource)
      .then((text) => {
        if (!cancelled) renderMap(text);
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [projectPath, datasource, color]);

  return (
    <div className="layer-preview-thumb" style={{ left: x, top: y }}>
      {loading && <div className="layer-preview-status">Memuat preview...</div>}
      {error && <div className="layer-preview-status layer-preview-status--error">Gagal memuat preview</div>}
      <div ref={containerRef} className="layer-preview-map" />
    </div>
  );
}

export default LayerPreview;

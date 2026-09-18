import { useEffect, useMemo, useState } from "react";
import { parseGeojsonForAttributeTable, type GeojsonFeatureLike } from "../lib/geojsonFields";
import { fetchLayerGeojson, getCachedGeojson } from "../lib/layerGeojsonCache";
import type { LayerInfo } from "./ProjectPanel";

interface FeatureInfoCardProps {
  projectPath: string | null;
  layers: LayerInfo[];
  activeFeature: { layerIndex: number; featureIndex: number } | null;
  onClose: () => void;
  onOpenFullTable: () => void;
}

function FeatureInfoCard({
  projectPath,
  layers,
  activeFeature,
  onClose,
  onOpenFullTable,
}: FeatureInfoCardProps) {
  const layer = activeFeature ? layers[activeFeature.layerIndex] : undefined;
  const [fetchedText, setFetchedText] = useState<string | null>(null);

  useEffect(() => {
    setFetchedText(null);
    if (!projectPath || !layer) return;

    const cached = getCachedGeojson(projectPath, layer.datasource);
    if (cached !== null) {
      setFetchedText(cached);
      return;
    }

    let cancelled = false;
    fetchLayerGeojson(projectPath, layer.datasource)
      .then((text) => {
        if (!cancelled) setFetchedText(text);
      })
      .catch(() => {
        if (!cancelled) setFetchedText(null);
      });

    return () => {
      cancelled = true;
    };
  }, [projectPath, layer]);

  const feature = useMemo<GeojsonFeatureLike | null>(() => {
    if (!activeFeature || !fetchedText) return null;
    const parsed = parseGeojsonForAttributeTable(fetchedText);
    return parsed.features[activeFeature.featureIndex] ?? null;
  }, [activeFeature, fetchedText]);

  if (!activeFeature || !layer || !feature) return null;

  const properties = feature.properties ?? {};
  const entries = Object.entries(properties);

  return (
    <div className="feature-info-card">
      <div className="feature-info-card-header">
        <div className="feature-info-card-header-text">
          <span className="feature-info-card-title">Feature Information</span>
          <span className="feature-info-card-subtitle">{layer.name}</span>
        </div>
        <button
          type="button"
          className="feature-info-card-close"
          onClick={onClose}
          title="Tutup"
        >
          {"\u2715"}
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="feature-info-card-empty">
          Tidak ada data atribut pada feature ini.
        </div>
      ) : (
        <div className="feature-info-card-body">
          <table className="feature-info-card-table">
            <tbody>
              {entries.map(([key, value]) => (
                <tr key={key}>
                  <th>{key}</th>
                  <td>
                    {value === null || value === undefined ? "-" : String(value)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="feature-info-card-footer">
        <button
          type="button"
          className="feature-info-card-full-table-btn"
          onClick={onOpenFullTable}
        >
          Lihat tabel penuh
        </button>
      </div>
    </div>
  );
}

export default FeatureInfoCard;

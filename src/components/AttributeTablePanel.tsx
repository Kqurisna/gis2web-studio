import { useEffect, useMemo, useState } from "react";
import { fetchLayerGeojson, getCachedGeojson } from "../lib/layerGeojsonCache";
import { parseGeojsonForAttributeTable, type ParsedGeojsonLayer } from "../lib/geojsonFields";
import type { LayerInfo } from "./ProjectPanel";

interface AttributeTablePanelProps {
  projectPath: string | null;
  layers: LayerInfo[];
  enabledLayerIndexes: number[];
  activeFeature: { layerIndex: number; featureIndex: number } | null;
  onFocusFeature: (layerIndex: number, featureIndex: number) => void;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
}

function AttributeTablePanel({
  projectPath,
  layers,
  enabledLayerIndexes,
  activeFeature,
  onFocusFeature,
  collapsed,
  onCollapsedChange,
}: AttributeTablePanelProps) {
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(
    enabledLayerIndexes[0] ?? null
  );
  const [parsed, setParsed] = useState<ParsedGeojsonLayer>({ fields: [], features: [] });
  const [loading, setLoading] = useState(false);

  // Saat panel dibuka (mis. lewat tombol "Lihat tabel penuh" pada Feature
  // Info Card) dan ada feature aktif, pastikan layer milik feature tersebut
  // tetap muncul di daftar pilihan meskipun belum di-toggle "Tampilkan".
  const effectiveLayerIndexes = useMemo(() => {
    if (
      !collapsed &&
      activeFeature &&
      !enabledLayerIndexes.includes(activeFeature.layerIndex)
    ) {
      return [...enabledLayerIndexes, activeFeature.layerIndex];
    }
    return enabledLayerIndexes;
  }, [enabledLayerIndexes, activeFeature, collapsed]);

  const enabledKey = effectiveLayerIndexes.join(",");

  useEffect(() => {
    if (selectedLayerIndex === null || !effectiveLayerIndexes.includes(selectedLayerIndex)) {
      setSelectedLayerIndex(effectiveLayerIndexes[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledKey]);

  // Saat panel dibuka, langsung fokuskan pilihan layer ke layer milik
  // feature yang sedang aktif (mis. dari "Lihat tabel penuh").
  useEffect(() => {
    if (!collapsed && activeFeature && effectiveLayerIndexes.includes(activeFeature.layerIndex)) {
      setSelectedLayerIndex(activeFeature.layerIndex);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed]);

  useEffect(() => {
    if (!projectPath || selectedLayerIndex === null) {
      setParsed({ fields: [], features: [] });
      return;
    }
    const layer = layers[selectedLayerIndex];
    if (!layer) return;

    let cancelled = false;

    const cached = getCachedGeojson(projectPath, layer.datasource);
    if (cached !== null) {
      setParsed(parseGeojsonForAttributeTable(cached));
      setLoading(false);
    } else {
      setLoading(true);
      fetchLayerGeojson(projectPath, layer.datasource)
        .then((text) => {
          if (!cancelled) {
            setParsed(parseGeojsonForAttributeTable(text));
            setLoading(false);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setParsed({ fields: [], features: [] });
            setLoading(false);
          }
        });
    }

    return () => {
      cancelled = true;
    };
  }, [projectPath, selectedLayerIndex, layers]);

  const enabledLayerOptions = useMemo(
    () => effectiveLayerIndexes.map((idx) => ({ idx, name: layers[idx]?.name ?? `Layer ${idx}` })),
    [effectiveLayerIndexes, layers]
  );

  if (effectiveLayerIndexes.length === 0) return null;

  return (
    <div className="attribute-table-panel">
      <div className="attribute-table-header">
        <div className="attribute-table-header-left">
          <span className="attribute-table-title">
            <svg
              className="attribute-table-title-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 4v16" />
            </svg>
            Attribute Table
          </span>
          {enabledLayerOptions.length > 1 && (
            <select
              className="attribute-table-layer-select"
              value={selectedLayerIndex ?? ""}
              onChange={(e) => setSelectedLayerIndex(Number(e.target.value))}
            >
              {enabledLayerOptions.map((opt) => (
                <option key={opt.idx} value={opt.idx}>
                  {opt.name}
                </option>
              ))}
            </select>
          )}
          {enabledLayerOptions.length === 1 && (
            <span className="attribute-table-layer-name">{enabledLayerOptions[0].name}</span>
          )}
          {!loading && (
            <span className="attribute-table-count">{parsed.features.length} fitur</span>
          )}
        </div>
        <button
          type="button"
          className="attribute-table-toggle-btn"
          onClick={() => onCollapsedChange(!collapsed)}
          title={collapsed ? "Buka Attribute Table" : "Tutup Attribute Table"}
        >
          {collapsed ? "\u25B2" : "\u25BC"}
        </button>
      </div>

      {!collapsed && (
        <div className="attribute-table-body">
          {loading && <div className="attribute-table-status">Memuat data atribut...</div>}
          {!loading && parsed.fields.length === 0 && (
            <div className="attribute-table-status">Tidak ada data atribut pada layer ini.</div>
          )}
          {!loading && parsed.fields.length > 0 && (
            <div className="attribute-table-scroll">
              <table className="attribute-data-table">
                <thead>
                  <tr>
                    {parsed.fields.map((field) => (
                      <th key={field}>{field}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.features.map((feature, featureIndex) => {
                    const isActive =
                      selectedLayerIndex !== null &&
                      activeFeature?.layerIndex === selectedLayerIndex &&
                      activeFeature?.featureIndex === featureIndex;
                    return (
                      <tr
                        key={featureIndex}
                        className={isActive ? "active-row" : undefined}
                        onClick={() =>
                          selectedLayerIndex !== null &&
                          onFocusFeature(selectedLayerIndex, featureIndex)
                        }
                      >
                        {parsed.fields.map((field) => {
                          const value = feature.properties?.[field];
                          return (
                            <td key={field}>
                              {value === null || value === undefined ? "-" : String(value)}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default AttributeTablePanel;

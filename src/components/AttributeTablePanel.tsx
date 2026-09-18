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
}

function AttributeTablePanel({
  projectPath,
  layers,
  enabledLayerIndexes,
  activeFeature,
  onFocusFeature,
}: AttributeTablePanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(
    enabledLayerIndexes[0] ?? null
  );
  const [parsed, setParsed] = useState<ParsedGeojsonLayer>({ fields: [], features: [] });
  const [loading, setLoading] = useState(false);

  const enabledKey = enabledLayerIndexes.join(",");

  useEffect(() => {
    if (selectedLayerIndex === null || !enabledLayerIndexes.includes(selectedLayerIndex)) {
      setSelectedLayerIndex(enabledLayerIndexes[0] ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabledKey]);

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
    () => enabledLayerIndexes.map((idx) => ({ idx, name: layers[idx]?.name ?? `Layer ${idx}` })),
    [enabledLayerIndexes, layers]
  );

  if (enabledLayerIndexes.length === 0) return null;

  return (
    <div className="attribute-table-panel">
      <div className="attribute-table-header">
        <div className="attribute-table-header-left">
          <span className="attribute-table-title">{"\uD83D\uDCCB"} Attribute Table</span>
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
          onClick={() => setCollapsed((c) => !c)}
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

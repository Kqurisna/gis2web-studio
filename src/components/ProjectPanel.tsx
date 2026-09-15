import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

export interface LayerInfo {
  name: string;
  geometry_type: "Point" | "Line" | "Polygon" | "NoGeometry" | "Unknown";
  datasource: string;
}

interface ProjectPanelProps {
  layers: LayerInfo[];
  onLayersLoaded: (layers: LayerInfo[]) => void;
  selectedLayerIndexes: number[];
  onSelectedLayerIndexesChange: (indexes: number[]) => void;
  boundaryLayerIndex: number | null;
  onBoundaryLayerIndexChange: (index: number | null) => void;
  projectPath: string | null;
  onProjectPathChange: (path: string | null) => void;
  layerColors: Record<number, string>;
  onLayerColorChange: (index: number, color: string) => void;
}

function ProjectPanel({
  layers,
  onLayersLoaded,
  selectedLayerIndexes,
  onSelectedLayerIndexesChange,
  boundaryLayerIndex,
  onBoundaryLayerIndexChange,
  projectPath,
  onProjectPathChange,
  layerColors,
  onLayerColorChange,
}: ProjectPanelProps) {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  async function handleImport() {
    setError(null);
    const selected = await open({
      multiple: false,
      filters: [{ name: "QGIS Project", extensions: ["qgz", "qgs"] }],
    });

    if (!selected || Array.isArray(selected)) return;

    onProjectPathChange(selected);
    setLoading(true);
    try {
      const result = await invoke<LayerInfo[]>("parse_qgis_project", {
        path: selected,
      });
      onLayersLoaded(result);
      onSelectedLayerIndexesChange([]);
      onBoundaryLayerIndexChange(null);
    } catch (err) {
      setError(String(err));
      onLayersLoaded([]);
    } finally {
      setLoading(false);
    }
  }

  function toggleLayerSelected(index: number) {
    if (selectedLayerIndexes.includes(index)) {
      onSelectedLayerIndexesChange(
        selectedLayerIndexes.filter((i) => i !== index)
      );
    } else {
      onSelectedLayerIndexesChange([...selectedLayerIndexes, index]);
    }
  }

  return (
    <div className={"layer-overlay-panel" + (collapsed ? " collapsed" : " expanded")}>
      <div className="layer-overlay-header">
        {!collapsed && <span className="layer-overlay-title">Layers</span>}
        <button
          type="button"
          className="layer-overlay-toggle-btn"
          onClick={() => setCollapsed((c) => !c)}
          title={collapsed ? "Buka panel layer" : "Tutup panel layer"}
        >
          {collapsed ? "\u2630" : "\u2715"}
        </button>
      </div>
      {!collapsed && (
      <div className="layer-overlay-body">
      <div className="project-panel">
      <button type="button" onClick={handleImport} disabled={loading}>
        {loading ? "Membaca project..." : "Import Project"}
      </button>

      {projectPath && <p className="project-path">Project: {projectPath}</p>}

      {error && <p className="project-error">Error: {error}</p>}

      {layers.length > 0 && (
        <div className="layer-list">
          <h3>Layer ditemukan ({layers.length})</h3>
          <table className="layer-table">
            <thead>
              <tr>
                <th>Publikasikan</th>
                <th>Boundary</th>
                <th>Nama Layer</th>
                <th>Tipe Geometri</th>
                <th>Warna</th>
              </tr>
            </thead>
            <tbody>
              {layers.map((layer, index) => {
                const isPolygon = layer.geometry_type === "Polygon";
                const color = layerColors[index] ?? "#2563eb";
                return (
                  <tr key={index}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selectedLayerIndexes.includes(index)}
                        onChange={() => toggleLayerSelected(index)}
                      />
                    </td>
                    <td>
                      <input
                        type="radio"
                        name="boundary-layer"
                        disabled={!isPolygon}
                        checked={boundaryLayerIndex === index}
                        onChange={() => onBoundaryLayerIndexChange(index)}
                        title={
                          isPolygon
                            ? "Jadikan Boundary Layer"
                            : "Hanya layer polygon yang bisa dijadikan Boundary Layer"
                        }
                      />
                    </td>
                    <td>{layer.name}</td>
                    <td>
                      {layer.geometry_type}
                      {!isPolygon && (
                        <span className="layer-note"> (bukan polygon)</span>
                      )}
                    </td>
                    <td>
                      <input
                        type="color"
                        value={color}
                        onChange={(e) => onLayerColorChange(index, e.target.value)}
                        title="Pilih warna layer"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <div className="layer-summary">
            <p>Layer dipilih untuk dipublikasikan: {selectedLayerIndexes.length}</p>
            <p>
              Boundary Layer:{" "}
              {boundaryLayerIndex !== null
                ? layers[boundaryLayerIndex].name
                : "(belum dipilih)"}
            </p>
          </div>
        </div>
      )}
    </div>
      </div>
      )}
    </div>
  );
}

export default ProjectPanel;

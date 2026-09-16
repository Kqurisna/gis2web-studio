import { useState } from "react";

export interface LayerInfo {
  name: string;
  geometry_type: "Point" | "Line" | "Polygon" | "NoGeometry" | "Unknown";
  datasource: string;
}

interface ProjectPanelProps {
  layers: LayerInfo[];
  hasProject: boolean;
  selectedLayerIndexes: number[];
  onSelectedLayerIndexesChange: (indexes: number[]) => void;
  boundaryLayerIndex: number | null;
  onBoundaryLayerIndexChange: (index: number | null) => void;
  layerColors: Record<number, string>;
  onLayerColorChange: (index: number, color: string) => void;
  activeLayerIndex: number | null;
  onFocusLayer: (index: number) => void;
}

function ProjectPanel({
  layers,
  hasProject,
  selectedLayerIndexes,
  onSelectedLayerIndexesChange,
  boundaryLayerIndex,
  onBoundaryLayerIndexChange,
  layerColors,
  onLayerColorChange,
  activeLayerIndex,
  onFocusLayer,
}: ProjectPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

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
      {collapsed ? (
        <button
          type="button"
          className="layer-overlay-toggle-btn layer-overlay-toggle-btn--collapsed"
          onClick={() => setCollapsed(false)}
          title="Buka panel layer"
        >
          {"\u2630"}
        </button>
      ) : (
        <div className="layer-overlay-header">
          <span className="layer-overlay-title">
            <span className="layer-overlay-title-icon">{"\uD83D\uDDFA\uFE0F"}</span>
            Layers
          </span>
          <button
            type="button"
            className="layer-overlay-toggle-btn"
            onClick={() => setCollapsed(true)}
            title="Tutup panel layer"
          >
            {"\u2715"}
          </button>
        </div>
      )}

      {!collapsed && (
        <div className="layer-overlay-body">
          <div className="project-panel">
            {!hasProject && (
              <div className="project-empty-state">
                <div className="project-empty-icon">{"\uD83D\uDCC1"}</div>
                <p className="project-empty-title">Belum ada project</p>
                <p className="project-empty-text">
                  Klik "Import Project" di toolbar atas untuk mulai memilih
                  layer yang ingin dipublikasikan ke Web GIS.
                </p>
              </div>
            )}

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
                      const isActive = activeLayerIndex === index;
                      return (
                        <tr
                          key={index}
                          className={isActive ? "active-row" : undefined}
                          onClick={() => onFocusLayer(index)}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedLayerIndexes.includes(index)}
                              onChange={() => toggleLayerSelected(index)}
                            />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
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
                          <td onClick={(e) => e.stopPropagation()}>
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

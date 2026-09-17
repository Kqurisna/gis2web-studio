import { useRef, useState } from "react";
import LayerPreview from "./LayerPreview";

export interface LayerInfo {
  name: string;
  geometry_type: "Point" | "Line" | "Polygon" | "NoGeometry" | "Unknown";
  datasource: string;
}

interface ProjectPanelProps {
  projectPath: string | null;
  layers: LayerInfo[];
  hasProject: boolean;
  selectedLayerIndexes: number[];
  onSelectedLayerIndexesChange: (indexes: number[]) => void;
  boundaryLayerIndex: number | null;
  onBoundaryLayerIndexChange: (index: number | null) => void;
  layerColors: Record<number, string>;
  onLayerColorChange: (index: number, color: string) => void;
  layerOpacities: Record<number, number>;
  onLayerOpacityChange: (index: number, opacity: number) => void;
  layerOrder: number[];
  onLayerOrderChange: (order: number[]) => void;
  activeLayerIndex: number | null;
  onFocusLayer: (index: number) => void;
}

type PanelTab = "layers" | "order";

function ProjectPanel({
  projectPath,
  layers,
  hasProject,
  selectedLayerIndexes,
  onSelectedLayerIndexesChange,
  boundaryLayerIndex,
  onBoundaryLayerIndexChange,
  layerColors,
  onLayerColorChange,
  layerOpacities,
  onLayerOpacityChange,
  layerOrder,
  onLayerOrderChange,
  activeLayerIndex,
  onFocusLayer,
}: ProjectPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [panelTab, setPanelTab] = useState<PanelTab>("layers");
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ index: number; x: number; y: number } | null>(null);
  const hoverTimeoutRef = useRef<number | null>(null);

  function toggleLayerSelected(index: number) {
    if (selectedLayerIndexes.includes(index)) {
      onSelectedLayerIndexesChange(
        selectedLayerIndexes.filter((i) => i !== index)
      );
    } else {
      onSelectedLayerIndexesChange([...selectedLayerIndexes, index]);
    }
  }

  function scheduleShowPreview(index: number, rect: DOMRect) {
    if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      setPreview({ index, x: rect.right + 12, y: rect.top });
    }, 300);
  }

  function cancelPreview() {
    if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = null;
    setPreview(null);
  }

  function handleDragStart(pos: number) {
    setDragIndex(pos);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  function handleDrop(pos: number) {
    if (dragIndex === null || dragIndex === pos) {
      setDragIndex(null);
      return;
    }
    const newOrder = [...layerOrder];
    const [moved] = newOrder.splice(dragIndex, 1);
    newOrder.splice(pos, 0, moved);
    onLayerOrderChange(newOrder);
    setDragIndex(null);
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
                <div className="project-panel-tabs">
                  <button
                    type="button"
                    className={"project-panel-tab-btn" + (panelTab === "layers" ? " active" : "")}
                    onClick={() => setPanelTab("layers")}
                  >
                    Layers
                  </button>
                  <button
                    type="button"
                    className={"project-panel-tab-btn" + (panelTab === "order" ? " active" : "")}
                    onClick={() => setPanelTab("order")}
                  >
                    Urutan
                  </button>
                </div>

                {panelTab === "layers" && (
                  <>
                    <h3>Layer ditemukan ({layers.length})</h3>
                    <table className="layer-table">
                      <thead>
                        <tr>
                          <th>Publikasikan</th>
                          <th>Boundary</th>
                          <th>Nama Layer</th>
                          <th>Tipe Geometri</th>
                          <th>Warna</th>
                          <th>Opacity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {layers.map((layer, index) => {
                          const isPolygon = layer.geometry_type === "Polygon";
                          const color = layerColors[index] ?? "#2563eb";
                          const opacity = layerOpacities[index] ?? (isPolygon ? 0.35 : 0.7);
                          const isActive = activeLayerIndex === index;
                          return (
                            <tr
                              key={index}
                              className={isActive ? "active-row" : undefined}
                              onClick={() => onFocusLayer(index)}
                              onMouseEnter={(e) =>
                                scheduleShowPreview(index, e.currentTarget.getBoundingClientRect())
                              }
                              onMouseLeave={cancelPreview}
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
                              <td onClick={(e) => e.stopPropagation()} className="opacity-cell">
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.05}
                                  value={opacity}
                                  onChange={(e) =>
                                    onLayerOpacityChange(index, Number(e.target.value))
                                  }
                                  title="Atur opacity layer"
                                />
                                <span className="opacity-value">
                                  {Math.round(opacity * 100)}%
                                </span>
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
                  </>
                )}

                {panelTab === "order" && (
                  <>
                    <h3>Urutan Tumpukan Layer</h3>
                    <p className="order-hint">
                      Tarik untuk mengatur layer mana yang tampil paling depan (atas)
                      atau paling belakang (bawah) di peta.
                    </p>
                    <div className="order-list">
                      {layerOrder.map((layerIdx, pos) => {
                        const layer = layers[layerIdx];
                        if (!layer) return null;
                        return (
                          <div
                            key={layerIdx}
                            className={
                              "order-list-item" + (dragIndex === pos ? " dragging" : "")
                            }
                            draggable
                            onDragStart={() => handleDragStart(pos)}
                            onDragOver={handleDragOver}
                            onDrop={() => handleDrop(pos)}
                            onMouseEnter={(e) =>
                              scheduleShowPreview(layerIdx, e.currentTarget.getBoundingClientRect())
                            }
                            onMouseLeave={cancelPreview}
                          >
                            <span className="order-drag-handle">{"\u2630"}</span>
                            <span
                              className="order-color-dot"
                              style={{ backgroundColor: layerColors[layerIdx] ?? "#2563eb" }}
                            />
                            <span className="order-item-name">{layer.name}</span>
                            {pos === 0 && <span className="order-item-badge">Paling depan</span>}
                            {pos === layerOrder.length - 1 && layerOrder.length > 1 && (
                              <span className="order-item-badge order-item-badge--back">
                                Paling belakang
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {preview && projectPath && layers[preview.index] && (
        <LayerPreview
          key={preview.index}
          projectPath={projectPath}
          datasource={layers[preview.index].datasource}
          color={layerColors[preview.index] ?? "#2563eb"}
          x={preview.x}
          y={preview.y}
        />
      )}
    </div>
  );
}

export default ProjectPanel;

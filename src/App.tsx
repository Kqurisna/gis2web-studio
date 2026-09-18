import { useState } from "react";
import "./App.css";
import MapView from "./components/MapView";
import ProjectPanel, { type LayerInfo } from "./components/ProjectPanel";
import ImportToolbar from "./components/ImportToolbar";
import ConfigurationPanel, {
  type WebGisConfig,
} from "./components/ConfigurationPanel";
import ExportPanel from "./components/ExportPanel";

type MenuKey = "project" | "configuration" | "export";

const MENU_ITEMS: { key: MenuKey; label: string; icon: string }[] = [
  { key: "project", label: "Project", icon: "\uD83D\uDDFA\uFE0F" },
  { key: "configuration", label: "Configuration", icon: "\u2699\uFE0F" },
  { key: "export", label: "Export", icon: "\u2B07\uFE0F" },
];

function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("project");

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [selectedLayerIndexes, setSelectedLayerIndexes] = useState<number[]>([]);
  const [boundaryLayerIndex, setBoundaryLayerIndex] = useState<number | null>(null);
  const [layerColors, setLayerColors] = useState<Record<number, string>>({});
  const [layerCategoryColors, setLayerCategoryColors] = useState<Record<number, Record<string, string>>>({});
  const [layerOpacities, setLayerOpacities] = useState<Record<number, number>>({});
  const [layerOrder, setLayerOrder] = useState<number[]>([]);
  const [activeLayerIndex, setActiveLayerIndex] = useState<number | null>(null);

  const [config, setConfig] = useState<WebGisConfig>({
    basemap: "osm",
    minZoom: 5,
    maxZoom: 18,
  });

  function handleLayersLoaded(newLayers: LayerInfo[]) {
    setLayers(newLayers);

    const initialColors: Record<number, string> = {};
    const initialCategoryColors: Record<number, Record<string, string>> = {};
    newLayers.forEach((layer, index) => {
      if (layer.color) {
        initialColors[index] = layer.color;
      }
      if (layer.categories && layer.categories.length > 0) {
        const catMap: Record<string, string> = {};
        layer.categories.forEach((cat) => {
          catMap[cat.value] = cat.color;
        });
        initialCategoryColors[index] = catMap;
      }
    });
    setLayerColors(initialColors);
    setLayerCategoryColors(initialCategoryColors);

    setLayerOrder(newLayers.map((_, i) => i));
    setActiveLayerIndex(null);
  }

  function handleLayerColorChange(index: number, color: string) {
    setLayerColors((prev) => ({ ...prev, [index]: color }));
  }

  function handleLayerCategoryColorChange(index: number, categoryValue: string, color: string) {
    setLayerCategoryColors((prev) => ({
      ...prev,
      [index]: { ...(prev[index] ?? {}), [categoryValue]: color },
    }));
  }

  function handleLayerOpacityChange(index: number, opacity: number) {
    setLayerOpacities((prev) => ({ ...prev, [index]: opacity }));
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">GIS2Web Studio</span>
        <button className="settings-button" type="button">
          Settings
        </button>
      </header>

      <div className="app-body">
        <nav className="app-sidebar">
          {MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                "sidebar-item" + (activeMenu === item.key ? " active" : "")
              }
              onClick={() => setActiveMenu(item.key)}
            >
              <span className="sidebar-item-icon">{item.icon}</span>
              <span className="sidebar-item-label">{item.label}</span>
            </button>
          ))}
        </nav>

        <main className={"app-main" + (activeMenu === "project" ? " app-main--full-bleed" : "")}>
          {activeMenu === "project" ? (
            <div className="project-view">
              <ImportToolbar
                projectPath={projectPath}
                onProjectPathChange={setProjectPath}
                onLayersLoaded={handleLayersLoaded}
                onSelectedLayerIndexesChange={setSelectedLayerIndexes}
                onBoundaryLayerIndexChange={setBoundaryLayerIndex}
              />
              <div className="project-map-layout">
                <MapView
                  projectPath={projectPath}
                  layers={layers}
                  selectedLayerIndexes={selectedLayerIndexes}
                  boundaryLayerIndex={boundaryLayerIndex}
                  config={config}
                  layerColors={layerColors}
                  layerCategoryColors={layerCategoryColors}
                  layerOpacities={layerOpacities}
                  layerOrder={layerOrder}
                  activeLayerIndex={activeLayerIndex}
                  onFocusLayer={setActiveLayerIndex}
                />
                <ProjectPanel
                  projectPath={projectPath}
                  layers={layers}
                  hasProject={projectPath !== null}
                  selectedLayerIndexes={selectedLayerIndexes}
                  onSelectedLayerIndexesChange={setSelectedLayerIndexes}
                  boundaryLayerIndex={boundaryLayerIndex}
                  onBoundaryLayerIndexChange={setBoundaryLayerIndex}
                  layerColors={layerColors}
                  onLayerColorChange={handleLayerColorChange}
                  layerCategoryColors={layerCategoryColors}
                  onLayerCategoryColorChange={handleLayerCategoryColorChange}
                  layerOpacities={layerOpacities}
                  onLayerOpacityChange={handleLayerOpacityChange}
                  layerOrder={layerOrder}
                  onLayerOrderChange={setLayerOrder}
                  activeLayerIndex={activeLayerIndex}
                  onFocusLayer={setActiveLayerIndex}
                />
              </div>
            </div>
          ) : activeMenu === "configuration" ? (
            <ConfigurationPanel config={config} onConfigChange={setConfig} />
          ) : activeMenu === "export" ? (
            <ExportPanel
              projectPath={projectPath}
              layers={layers}
              selectedLayerIndexes={selectedLayerIndexes}
              boundaryLayerIndex={boundaryLayerIndex}
              layerColors={layerColors}
              layerOpacities={layerOpacities}
              config={config}
            />
          ) : (
            <>
              <h2>{MENU_ITEMS.find((m) => m.key === activeMenu)?.label}</h2>
              <p>This section is a placeholder for the "{activeMenu}" panel.</p>
            </>
          )}
        </main>
      </div>

      <footer className="app-status-bar">
        <span>Status: Ready</span>
      </footer>
    </div>
  );
}

export default App;

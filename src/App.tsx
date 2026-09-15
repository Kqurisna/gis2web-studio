import { useState } from "react";
import "./App.css";
import MapView from "./components/MapView";
import ProjectPanel, { type LayerInfo } from "./components/ProjectPanel";
import ConfigurationPanel, {
  type WebGisConfig,
} from "./components/ConfigurationPanel";
import ExportPanel from "./components/ExportPanel";

type MenuKey = "project" | "configuration" | "export";

const MENU_ITEMS: { key: MenuKey; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "configuration", label: "Configuration" },
  { key: "export", label: "Export" },
];

function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("project");

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [selectedLayerIndexes, setSelectedLayerIndexes] = useState<number[]>([]);
  const [boundaryLayerIndex, setBoundaryLayerIndex] = useState<number | null>(null);
  const [layerColors, setLayerColors] = useState<Record<number, string>>({});

  const [config, setConfig] = useState<WebGisConfig>({
    basemap: "osm",
    minZoom: 5,
    maxZoom: 18,
  });

  function handleLayersLoaded(newLayers: LayerInfo[]) {
    setLayers(newLayers);
    setLayerColors({});
  }

  function handleLayerColorChange(index: number, color: string) {
    setLayerColors((prev) => ({ ...prev, [index]: color }));
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
              {item.label}
            </button>
          ))}
        </nav>

        <main className={"app-main" + (activeMenu === "project" ? " app-main--full-bleed" : "")}>
          {activeMenu === "project" ? (
            <div className="project-map-layout">
              <MapView
                projectPath={projectPath}
                layers={layers}
                selectedLayerIndexes={selectedLayerIndexes}
                boundaryLayerIndex={boundaryLayerIndex}
                config={config}
                layerColors={layerColors}
              />
              <ProjectPanel
                layers={layers}
                onLayersLoaded={handleLayersLoaded}
                selectedLayerIndexes={selectedLayerIndexes}
                onSelectedLayerIndexesChange={setSelectedLayerIndexes}
                boundaryLayerIndex={boundaryLayerIndex}
                onBoundaryLayerIndexChange={setBoundaryLayerIndex}
                projectPath={projectPath}
                onProjectPathChange={setProjectPath}
                layerColors={layerColors}
                onLayerColorChange={handleLayerColorChange}
              />
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

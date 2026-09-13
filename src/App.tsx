import { useState } from "react";
import "./App.css";
import MapView from "./components/MapView";
import ProjectPanel, { type LayerInfo } from "./components/ProjectPanel";

type MenuKey = "project" | "layers" | "configuration" | "export";

const MENU_ITEMS: { key: MenuKey; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "layers", label: "Layers" },
  { key: "configuration", label: "Configuration" },
  { key: "export", label: "Export" },
];

function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("project");

  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [selectedLayerIndexes, setSelectedLayerIndexes] = useState<number[]>([]);
  const [boundaryLayerIndex, setBoundaryLayerIndex] = useState<number | null>(null);

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

        <main className="app-main">
          {activeMenu === "layers" ? (
            <MapView />
          ) : activeMenu === "project" ? (
            <ProjectPanel
              layers={layers}
              onLayersLoaded={setLayers}
              selectedLayerIndexes={selectedLayerIndexes}
              onSelectedLayerIndexesChange={setSelectedLayerIndexes}
              boundaryLayerIndex={boundaryLayerIndex}
              onBoundaryLayerIndexChange={setBoundaryLayerIndex}
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

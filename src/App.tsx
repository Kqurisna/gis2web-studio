import { useState } from "react";
import "./App.css";
import MapView from "./components/MapView";
import ProjectPanel, { type LayerInfo } from "./components/ProjectPanel";
import ImportToolbar from "./components/ImportToolbar";
import ConfigurationPanel, {
  type WebGisConfig,
} from "./components/ConfigurationPanel";
import ExportPanel from "./components/ExportPanel";
import AttributeTablePanel from "./components/AttributeTablePanel";
import FeatureInfoCard from "./components/FeatureInfoCard";

type MenuKey = "project" | "configuration" | "export";

type MenuIconKey = "project" | "configuration" | "export";

const MENU_ITEMS: { key: MenuKey; label: string; icon: MenuIconKey }[] = [
  { key: "project", label: "Project", icon: "project" },
  { key: "configuration", label: "Configuration", icon: "configuration" },
  { key: "export", label: "Export", icon: "export" },
];

function MenuIcon({ icon }: { icon: MenuIconKey }) {
  if (icon === "project") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 7l6-3 6 3 6-3v13l-6 3-6-3-6 3V7z" />
        <path d="M9 4v13M15 7v13" />
      </svg>
    );
  }
  if (icon === "configuration") {
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
      </svg>
    );
  }
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v12" />
      <path d="M7 10l5 5 5-5" />
      <path d="M4 20h16" />
    </svg>
  );
}

function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>("project");

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [layers, setLayers] = useState<LayerInfo[]>([]);
  const [selectedLayerIndexes, setSelectedLayerIndexes] = useState<number[]>([]);
  const [boundaryLayerIndex, setBoundaryLayerIndex] = useState<number | null>(null);
  const [layerColors, setLayerColors] = useState<Record<number, string>>({});
  const [layerCategoryColors, setLayerCategoryColors] = useState<Record<number, Record<string, string>>>({});
  const [layerAttributeTableEnabled, setLayerAttributeTableEnabled] = useState<Record<number, boolean>>({});
  const [layerOpacities, setLayerOpacities] = useState<Record<number, number>>({});
  const [layerOrder, setLayerOrder] = useState<number[]>([]);
  const [activeLayerIndex, setActiveLayerIndex] = useState<number | null>(null);
  const [activeFeature, setActiveFeature] = useState<
    { layerIndex: number; featureIndex: number } | null
  >(null);
  const [attributeTableCollapsed, setAttributeTableCollapsed] = useState(true);
  const [layerVisibleFields, setLayerVisibleFields] = useState<Record<number, string[]>>({});

  function handleVisibleFieldsChange(layerIndex: number, fields: string[] | null) {
    setLayerVisibleFields((prev) => {
      if (fields === null) {
        const next = { ...prev };
        delete next[layerIndex];
        return next;
      }
      return { ...prev, [layerIndex]: fields };
    });
  }

  const [config, setConfig] = useState<WebGisConfig>({
    basemap: "osm",
    minZoom: 5,
    maxZoom: 18,
    featureDisplayMode: "card",
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
    setLayerAttributeTableEnabled({});

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

  function handleAttributeTableToggle(index: number, enabled: boolean) {
    setLayerAttributeTableEnabled((prev) => ({ ...prev, [index]: enabled }));
  }

  function handleLayerOpacityChange(index: number, opacity: number) {
    setLayerOpacities((prev) => ({ ...prev, [index]: opacity }));
  }

  function handleFocusFeature(layerIndex: number, featureIndex: number) {
    setActiveFeature({ layerIndex, featureIndex });
  }

  const enabledAttributeTableLayerIndexes = layers
    .map((_, i) => i)
    .filter(
      (i) =>
        layerAttributeTableEnabled[i] &&
        (selectedLayerIndexes.includes(i) || boundaryLayerIndex === i)
    );

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
              <span className="sidebar-item-icon">
                <MenuIcon icon={item.icon} />
              </span>
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
                  activeFeature={activeFeature}
                  onFocusFeature={handleFocusFeature}
                  visibleFields={layerVisibleFields}
                  featureDisplayMode={config.featureDisplayMode}
                />
                {config.featureDisplayMode !== "popup" && (
                  <FeatureInfoCard
                    projectPath={projectPath}
                    layers={layers}
                    activeFeature={activeFeature}
                    onClose={() => setActiveFeature(null)}
                    onOpenFullTable={() => setAttributeTableCollapsed(false)}
                    visibleFields={layerVisibleFields}
                    onVisibleFieldsChange={handleVisibleFieldsChange}
                  />
                )}
                <AttributeTablePanel
                  projectPath={projectPath}
                  layers={layers}
                  enabledLayerIndexes={enabledAttributeTableLayerIndexes}
                  activeFeature={activeFeature}
                  onFocusFeature={handleFocusFeature}
                  collapsed={attributeTableCollapsed}
                  onCollapsedChange={setAttributeTableCollapsed}
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
                  layerAttributeTableEnabled={layerAttributeTableEnabled}
                  onAttributeTableToggle={handleAttributeTableToggle}
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

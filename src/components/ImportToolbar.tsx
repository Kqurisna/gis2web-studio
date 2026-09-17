import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { LayerInfo } from "./ProjectPanel";
import { clearLayerGeojsonCache, prefetchAllLayers } from "../lib/layerGeojsonCache";

interface ImportToolbarProps {
  projectPath: string | null;
  onProjectPathChange: (path: string | null) => void;
  onLayersLoaded: (layers: LayerInfo[]) => void;
  onSelectedLayerIndexesChange: (indexes: number[]) => void;
  onBoundaryLayerIndexChange: (index: number | null) => void;
}

function ImportToolbar({
  projectPath,
  onProjectPathChange,
  onLayersLoaded,
  onSelectedLayerIndexesChange,
  onBoundaryLayerIndexChange,
}: ImportToolbarProps) {
  const [loading, setLoading] = useState(false);
  const [loadingLabel, setLoadingLabel] = useState("Membaca project...");
  const [error, setError] = useState<string | null>(null);

  async function handleImport() {
    setError(null);
    const selected = await open({
      multiple: false,
      filters: [{ name: "QGIS Project", extensions: ["qgz", "qgs"] }],
    });

    if (!selected || Array.isArray(selected)) return;

    onProjectPathChange(selected);
    setLoading(true);
    setLoadingLabel("Membaca project...");
    clearLayerGeojsonCache();

    try {
      const result = await invoke<LayerInfo[]>("parse_qgis_project", {
        path: selected,
      });
      onLayersLoaded(result);
      onSelectedLayerIndexesChange([]);
      onBoundaryLayerIndexChange(null);

      if (result.length > 0) {
        setLoadingLabel(`Menyiapkan preview ${result.length} layer...`);
        await prefetchAllLayers(
          selected,
          result.map((l) => l.datasource)
        );
      }
    } catch (err) {
      setError(String(err));
      onLayersLoaded([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="top-toolbar">
      <button
        type="button"
        className="top-toolbar-import-btn"
        onClick={handleImport}
        disabled={loading}
      >
        {loading ? loadingLabel : "\u{1F4C1} Import Project"}
      </button>

      {projectPath && (
        <span className="top-toolbar-path" title={projectPath}>
          {projectPath}
        </span>
      )}

      {error && <span className="top-toolbar-error">Error: {error}</span>}
    </div>
  );
}

export default ImportToolbar;

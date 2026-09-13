import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

function ProjectPanel() {
  const [layerNames, setLayerNames] = useState<string[]>([]);
  const [projectPath, setProjectPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleImport() {
    setError(null);
    const selected = await open({
      multiple: false,
      filters: [{ name: "QGIS Project", extensions: ["qgz", "qgs"] }],
    });

    if (!selected || Array.isArray(selected)) return;

    setProjectPath(selected);
    setLoading(true);
    try {
      const layers = await invoke<string[]>("parse_qgis_project", {
        path: selected,
      });
      setLayerNames(layers);
    } catch (err) {
      setError(String(err));
      setLayerNames([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="project-panel">
      <button type="button" onClick={handleImport} disabled={loading}>
        {loading ? "Membaca project..." : "Import Project"}
      </button>

      {projectPath && (
        <p className="project-path">Project: {projectPath}</p>
      )}

      {error && <p className="project-error">Error: {error}</p>}

      {layerNames.length > 0 && (
        <div className="layer-list">
          <h3>Layer ditemukan ({layerNames.length})</h3>
          <ul>
            {layerNames.map((name, index) => (
              <li key={`${name}-${index}`}>{name}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default ProjectPanel;

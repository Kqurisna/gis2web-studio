import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { LayerInfo } from "./ProjectPanel";
import type { BasemapCandidateInfo } from "./ConfigurationPanel";
import { clearLayerGeojsonCache, prefetchAllLayers } from "../lib/layerGeojsonCache";

interface ImportToolbarProps {
  projectPath: string | null;
  onProjectPathChange: (path: string | null) => void;
  onLayersLoaded: (layers: LayerInfo[]) => void;
  onSelectedLayerIndexesChange: (indexes: number[]) => void;
  onBoundaryLayerIndexChange: (index: number | null) => void;
  onBasemapCandidatesLoaded?: (candidates: BasemapCandidateInfo[]) => void;
  onGdalAvailabilityChecked?: (available: boolean) => void;
}

function ImportToolbar({
  projectPath,
  onProjectPathChange,
  onLayersLoaded,
  onSelectedLayerIndexesChange,
  onBoundaryLayerIndexChange,
  onBasemapCandidatesLoaded,
  onGdalAvailabilityChecked,
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

      // Basemap candidates & GDAL check bersifat pelengkap (bukan syarat
      // import berhasil). Kalau gagal, cukup kosongkan/anggap tidak
      // tersedia, jangan gagalkan proses import utama.
      try {
        const candidates = await invoke<BasemapCandidateInfo[]>(
          "parse_qgis_basemap_candidates",
          { path: selected }
        );
        onBasemapCandidatesLoaded?.(candidates);
      } catch {
        onBasemapCandidatesLoaded?.([]);
      }

      try {
        const gdalAvailable = await invoke<boolean>("check_gdal_available");
        onGdalAvailabilityChecked?.(gdalAvailable);
      } catch {
        onGdalAvailabilityChecked?.(false);
      }

      // Panel Layers (dan preview-nya) baru ditampilkan setelah SEMUA data
      // geojson layer selesai dimuat ke cache, supaya begitu panel muncul,
      // user bisa langsung preview tanpa menunggu fetch lagi. Konsekuensinya
      // tombol Import tetap loading lebih lama, tapi itu memang tujuannya.
      if (result.length > 0) {
        setLoadingLabel(`Menyiapkan preview ${result.length} layer...`);
        await prefetchAllLayers(
          selected,
          result.map((l) => l.datasource)
        );
      }

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

import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import type { LayerInfo } from "./ProjectPanel";
import type { WebGisConfig } from "./ConfigurationPanel";
import { BASEMAP_TILE_INFO } from "./ConfigurationPanel";

interface ExportPanelProps {
  projectPath: string | null;
  layers: LayerInfo[];
  selectedLayerIndexes: number[];
  boundaryLayerIndex: number | null;
  layerColors: Record<number, string>;
  config: WebGisConfig;
}

interface ExportLayerInput {
  name: string;
  datasource: string;
  color: string;
  is_boundary: boolean;
}

function ExportPanel({
  projectPath,
  layers,
  selectedLayerIndexes,
  boundaryLayerIndex,
  layerColors,
  config,
}: ExportPanelProps) {
  const [outputDir, setOutputDir] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canExport =
    projectPath !== null &&
    selectedLayerIndexes.length > 0 &&
    boundaryLayerIndex !== null &&
    outputDir !== null;

  async function handleChooseFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (!selected || Array.isArray(selected)) return;
    setOutputDir(selected);
  }

  async function handleExport() {
    if (!projectPath || !outputDir) return;

    setExporting(true);
    setResultMessage(null);
    setErrorMessage(null);

    const indexesToExport = Array.from(
      new Set([
        ...selectedLayerIndexes,
        ...(boundaryLayerIndex !== null ? [boundaryLayerIndex] : []),
      ])
    );

    const exportLayers: ExportLayerInput[] = indexesToExport
      .map((index) => layers[index])
      .filter((l): l is LayerInfo => Boolean(l))
      .map((layer, i) => {
        const index = indexesToExport[i];
        return {
          name: layer.name,
          datasource: layer.datasource,
          color: layerColors[index] ?? (index === boundaryLayerIndex ? "#f97316" : "#2563eb"),
          is_boundary: index === boundaryLayerIndex,
        };
      });

    try {
      const message = await invoke<string>("export_web_gis", {
        projectPath,
        outputDir,
        layers: exportLayers,
        config: {
          basemap: config.basemap,
          min_zoom: config.minZoom,
          max_zoom: config.maxZoom,
          tile_url: BASEMAP_TILE_INFO[config.basemap].url,
          attribution: BASEMAP_TILE_INFO[config.basemap].attribution,
        },
      });
      setResultMessage(message);
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="export-panel">
      <section className="config-section">
        <h3>Ringkasan</h3>
        <p>Project: {projectPath ?? "(belum ada project diimport)"}</p>
        <p>Layer dipublikasikan: {selectedLayerIndexes.length}</p>
        <p>
          Boundary Layer:{" "}
          {boundaryLayerIndex !== null
            ? layers[boundaryLayerIndex]?.name
            : "(belum dipilih)"}
        </p>
      </section>

      <section className="config-section">
        <h3>Folder Output</h3>
        <button type="button" onClick={handleChooseFolder}>
          Pilih Folder Output
        </button>
        {outputDir && <p className="project-path">Output: {outputDir}</p>}
      </section>

      <section className="config-section">
        <button
          type="button"
          onClick={handleExport}
          disabled={!canExport || exporting}
        >
          {exporting ? "Mengekspor..." : "Export Web GIS"}
        </button>
        {!canExport && (
          <p className="config-static-value">
            Pastikan project sudah diimport, minimal 1 layer dipilih untuk
            dipublikasikan, boundary layer sudah ditentukan, dan folder output
            sudah dipilih.
          </p>
        )}
      </section>

      {resultMessage && (
        <p className="export-success">{resultMessage}</p>
      )}
      {errorMessage && <p className="project-error">Error: {errorMessage}</p>}
    </div>
  );
}

export default ExportPanel;

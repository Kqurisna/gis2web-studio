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
  layerCategoryColors: Record<number, Record<string, string>>;
  layerOpacities: Record<number, number>;
  layerPointSizes: Record<number, number>;
  layerOrder: number[];
  layerVisibleFields: Record<number, string[]>;
  layerAttributeTableEnabled: Record<number, boolean>;
  config: WebGisConfig;
}

interface ExportCategoryInput {
  value: string;
  color: string;
}

interface ExportLayerInput {
  layer_index: number;
  name: string;
  datasource: string;
  geometry_type: string;
  color: string;
  opacity: number;
  point_size: number;
  category_field: string | null;
  categories: ExportCategoryInput[] | null;
  visible_fields: string[] | null;
  is_boundary: boolean;
  show_attribute_table: boolean;
}

function ExportPanel({
  projectPath,
  layers,
  selectedLayerIndexes,
  boundaryLayerIndex,
  layerColors,
  layerCategoryColors,
  layerOpacities,
  layerPointSizes,
  layerOrder,
  layerVisibleFields,
  layerAttributeTableEnabled,
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

    // Gabungkan layer yang dipilih + boundary, lalu urutkan sesuai layerOrder
    // (urutan stacking yang sudah diatur user di GIS2Web Studio), supaya
    // urutan render di hasil export identik dengan yang terlihat di aplikasi.
    const indexesToExportSet = new Set([
      ...selectedLayerIndexes,
      ...(boundaryLayerIndex !== null ? [boundaryLayerIndex] : []),
    ]);
    const indexesToExport = [
      ...layerOrder.filter((idx) => indexesToExportSet.has(idx)),
      ...Array.from(indexesToExportSet).filter((idx) => !layerOrder.includes(idx)),
    ];

    const exportLayers: ExportLayerInput[] = indexesToExport
      .map((index) => ({ index, layer: layers[index] }))
      .filter((entry): entry is { index: number; layer: LayerInfo } => Boolean(entry.layer))
      .map(({ index, layer }) => {
        const isBoundary = index === boundaryLayerIndex;
        const categoryOverrides = layerCategoryColors[index];
        const categories: ExportCategoryInput[] | null =
          layer.categories && layer.categories.length > 0
            ? layer.categories.map((cat) => ({
                value: cat.value,
                color: categoryOverrides?.[cat.value] ?? cat.color,
              }))
            : null;

        return {
          layer_index: index,
          name: layer.name,
          datasource: layer.datasource,
          geometry_type: layer.geometry_type,
          color: layerColors[index] ?? (isBoundary ? "#f97316" : "#2563eb"),
          opacity: layerOpacities[index] ?? 0.35,
          point_size: layerPointSizes[index] ?? 5,
          category_field: layer.category_field,
          categories,
          visible_fields: layerVisibleFields[index] ?? null,
          is_boundary: isBoundary,
          show_attribute_table: layerAttributeTableEnabled[index] ?? false,
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
          feature_display_mode: config.featureDisplayMode,
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

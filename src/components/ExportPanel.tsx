import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import ExportPreviewMap from "./ExportPreviewMap";
import { invoke } from "@tauri-apps/api/core";
import type { LayerInfo } from "./ProjectPanel";
import type { WebGisConfig } from "./ConfigurationPanel";
import { BASEMAP_TILE_INFO, BASEMAP_OPTIONS, FEATURE_DISPLAY_OPTIONS } from "./ConfigurationPanel";

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

interface ExportRangeInput {
  lower: number;
  upper: number;
  label: string;
  color: string;
}

interface ExportLabelingInput {
  field: string;
  group_by_field: string | null;
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
  ranges: ExportRangeInput[] | null;
  labeling: ExportLabelingInput | null;
  visible_fields: string[] | null;
  is_boundary: boolean;
  show_attribute_table: boolean;
}

async function resolveExportBasemap(
  config: WebGisConfig,
  outputDir: string
): Promise<{ tile_url: string; attribution: string }> {
  if (config.basemap !== "custom" || !config.customBasemap) {
    return {
      tile_url: BASEMAP_TILE_INFO[config.basemap].url,
      attribution: BASEMAP_TILE_INFO[config.basemap].attribution,
    };
  }

  const candidate = config.customBasemap;

  if (candidate.kind === "external_tile") {
    const match = candidate.datasource.match(/url=([^&]+)/);
    if (!match) {
      throw new Error(
        `Tidak dapat membaca URL basemap dari datasource QGIS: ${candidate.datasource}`
      );
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(match[1]);
    } catch {
      throw new Error(`URL basemap tidak valid pada datasource: ${candidate.datasource}`);
    }
    return { tile_url: decoded, attribution: `Custom: ${candidate.name}` };
  }

  // local_raster: generate tile pyramid via GDAL sebelum export dilanjutkan.
  await invoke<string>("generate_tile_pyramid", {
    rasterPath: candidate.datasource,
    outputDir,
    minZoom: config.minZoom,
    maxZoom: config.maxZoom,
  });

  return {
    tile_url: "./tiles/{z}/{x}/{y}.png",
    attribution: `Custom raster: ${candidate.name}`,
  };
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
  const [previewMode, setPreviewMode] = useState<"ringkasan" | "peta">("ringkasan");

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

  function buildExportLayers(): ExportLayerInput[] {
    const indexesToExportSet = new Set([
      ...selectedLayerIndexes,
      ...(boundaryLayerIndex !== null ? [boundaryLayerIndex] : []),
    ]);
    const indexesToExport = [
      ...layerOrder.filter((idx) => indexesToExportSet.has(idx)),
      ...Array.from(indexesToExportSet).filter((idx) => !layerOrder.includes(idx)),
    ];

    return indexesToExport
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
        const ranges: ExportRangeInput[] | null =
          layer.ranges && layer.ranges.length > 0
            ? layer.ranges.map((range) => ({
                lower: range.lower,
                upper: range.upper,
                label: range.label,
                color: categoryOverrides?.[range.label] ?? range.color,
              }))
            : null;
        const labeling: ExportLabelingInput | null = layer.labeling
          ? { field: layer.labeling.field, group_by_field: layer.labeling.group_by_field }
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
          ranges,
          labeling,
          visible_fields: layerVisibleFields[index] ?? null,
          is_boundary: isBoundary,
          show_attribute_table: layerAttributeTableEnabled[index] ?? false,
        };
      });
  }

  async function handleExport() {
    if (!projectPath || !outputDir) return;

    setExporting(true);
    setResultMessage(null);
    setErrorMessage(null);

    const exportLayers = buildExportLayers();

    try {
      const basemapResolved = await resolveExportBasemap(config, outputDir);
      const message = await invoke<string>("export_web_gis", {
        projectPath,
        outputDir,
        layers: exportLayers,
        config: {
          basemap: config.basemap,
          min_zoom: config.minZoom,
          max_zoom: config.maxZoom,
          tile_url: basemapResolved.tile_url,
          attribution: basemapResolved.attribution,
          feature_display_mode: config.featureDisplayMode,
          label_font_size: config.labelFontSize,
        },
      });
      setResultMessage(message);
    } catch (err) {
      setErrorMessage(String(err));
    } finally {
      setExporting(false);
    }
  }

  const previewIndexesSet = new Set([
    ...selectedLayerIndexes,
    ...(boundaryLayerIndex !== null ? [boundaryLayerIndex] : []),
  ]);
  const previewLayerNames = [
    ...layerOrder.filter((idx) => previewIndexesSet.has(idx)),
    ...Array.from(previewIndexesSet).filter((idx) => !layerOrder.includes(idx)),
  ]
    .map((idx) => layers[idx])
    .filter((layer): layer is LayerInfo => Boolean(layer))
    .map((layer) => layer.name);

  const basemapLabel =
    config.basemap === "custom"
      ? config.customBasemap?.name ?? "Custom (belum dipilih)"
      : BASEMAP_OPTIONS.find((o) => o.value === config.basemap)?.label ?? config.basemap;

  const featureDisplayLabel =
    FEATURE_DISPLAY_OPTIONS.find((o) => o.value === config.featureDisplayMode)?.label ??
    config.featureDisplayMode;

  return (
    <div className="export-panel-layout">
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
        <h3>Preview Export</h3>
        {previewLayerNames.length > 0 ? (
          <>
            <p>Layer ({previewLayerNames.length}):</p>
            <ul className="export-preview-list">
              {previewLayerNames.map((name, i) => (
                <li key={i}>{name}</li>
              ))}
            </ul>
          </>
        ) : (
          <p className="config-static-value">Belum ada layer dipilih.</p>
        )}
        <p>Basemap: {basemapLabel}</p>
        <p>Zoom: {config.minZoom} — {config.maxZoom}</p>
        <p>Feature Display: {featureDisplayLabel}</p>
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

    <div className="export-preview-pane">
      <div className="export-preview-tabs">
        <button
          type="button"
          className={"export-preview-tab" + (previewMode === "ringkasan" ? " active" : "")}
          onClick={() => setPreviewMode("ringkasan")}
        >
          Preview Ringkasan
        </button>
        <button
          type="button"
          className={"export-preview-tab" + (previewMode === "peta" ? " active" : "")}
          onClick={() => setPreviewMode("peta")}
          disabled={!projectPath}
        >
          Preview Peta
        </button>
      </div>

      {previewMode === "ringkasan" && (
        <div className="export-preview-placeholder">
          <p>Preview ringkasan ditampilkan di panel kiri.</p>
          <p className="config-static-value">
            Klik "Preview Peta" untuk melihat tampilan layer terpilih di peta.
          </p>
        </div>
      )}

      {previewMode === "peta" && (
        <ExportPreviewMap
          projectPath={projectPath}
          layers={layers}
          selectedLayerIndexes={selectedLayerIndexes}
          boundaryLayerIndex={boundaryLayerIndex}
          layerColors={layerColors}
          layerCategoryColors={layerCategoryColors}
          layerOpacities={layerOpacities}
          layerPointSizes={layerPointSizes}
          layerOrder={layerOrder}
          layerVisibleFields={layerVisibleFields}
          config={config}
        />
      )}
    </div>
    </div>
  );
}

export default ExportPanel;

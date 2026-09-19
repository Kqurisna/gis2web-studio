export type BasemapOption = "osm" | "satellite" | "topo";

export const BASEMAP_TILE_INFO: Record<BasemapOption, { url: string; attribution: string }> = {
  osm: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: "&copy; OpenStreetMap contributors",
  },
  satellite: {
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
    attribution: "Tiles &copy; Esri &mdash; Source: Esri, Maxar, Earthstar Geographics",
  },
  topo: {
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: "Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap",
  },
};

export type FeatureDisplayMode = "both" | "card" | "popup";

export interface WebGisConfig {
  basemap: BasemapOption;
  minZoom: number;
  maxZoom: number;
  featureDisplayMode: FeatureDisplayMode;
}

interface ConfigurationPanelProps {
  config: WebGisConfig;
  onConfigChange: (config: WebGisConfig) => void;
}

const BASEMAP_OPTIONS: { value: BasemapOption; label: string }[] = [
  { value: "osm", label: "OpenStreetMap" },
  { value: "satellite", label: "Satellite (Esri World Imagery)" },
  { value: "topo", label: "Topographic (OpenTopoMap)" },
];

const FEATURE_DISPLAY_OPTIONS: { value: FeatureDisplayMode; label: string; hint: string }[] = [
  {
    value: "card",
    label: "Hanya Card",
    hint: "Feature Information card mengambang saja, tanpa popup di peta.",
  },
  {
    value: "popup",
    label: "Hanya Popup",
    hint: "Popup di peta saja, tanpa Feature Information card.",
  },
  {
    value: "both",
    label: "Keduanya",
    hint: "Tampilkan Feature Information card dan popup di peta.",
  },
];

const ZOOM_MIN_LIMIT = 5;
const ZOOM_MAX_LIMIT = 20;

function ConfigurationPanel({ config, onConfigChange }: ConfigurationPanelProps) {
  const zoomError = config.maxZoom < config.minZoom;

  function updateBasemap(basemap: BasemapOption) {
    onConfigChange({ ...config, basemap });
  }

  function updateMinZoom(value: number) {
    onConfigChange({ ...config, minZoom: value });
  }

  function updateMaxZoom(value: number) {
    onConfigChange({ ...config, maxZoom: value });
  }

  function updateFeatureDisplayMode(featureDisplayMode: FeatureDisplayMode) {
    onConfigChange({ ...config, featureDisplayMode });
  }

  return (
    <div className="config-panel">
      <section className="config-section">
        <h3>Basemap</h3>
        <div className="config-radio-group">
          {BASEMAP_OPTIONS.map((option) => (
            <label key={option.value} className="config-radio-item">
              <input
                type="radio"
                name="basemap"
                value={option.value}
                checked={config.basemap === option.value}
                onChange={() => updateBasemap(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
      </section>

      <section className="config-section">
        <h3>Map Configuration</h3>

        <div className="config-slider-block">
          <label className="config-slider-label">Minimum Zoom</label>
          <div className="config-slider-row">
            <span className="config-slider-bound">{ZOOM_MIN_LIMIT}</span>
            <input
              type="range"
              min={ZOOM_MIN_LIMIT}
              max={ZOOM_MAX_LIMIT}
              value={config.minZoom}
              onChange={(e) => updateMinZoom(Number(e.target.value))}
            />
            <span className="config-slider-bound">{ZOOM_MAX_LIMIT}</span>
          </div>
          <div className="config-slider-value">{config.minZoom}</div>
        </div>

        <div className="config-slider-block">
          <label className="config-slider-label">Maximum Zoom</label>
          <div className="config-slider-row">
            <span className="config-slider-bound">{ZOOM_MIN_LIMIT}</span>
            <input
              type="range"
              min={ZOOM_MIN_LIMIT}
              max={ZOOM_MAX_LIMIT}
              value={config.maxZoom}
              onChange={(e) => updateMaxZoom(Number(e.target.value))}
            />
            <span className="config-slider-bound">{ZOOM_MAX_LIMIT}</span>
          </div>
          <div className="config-slider-value">{config.maxZoom}</div>
        </div>

        {zoomError && (
          <p className="config-error">
            Maximum Zoom harus lebih besar atau sama dengan Minimum Zoom.
          </p>
        )}
      </section>

      <section className="config-section">
        <h3>Initial View</h3>
        <p className="config-static-value">Fit to Boundary (default)</p>
      </section>

      <section className="config-section">
        <h3>Tampilan Informasi Feature</h3>
        <div className="config-radio-group">
          {FEATURE_DISPLAY_OPTIONS.map((option) => (
            <label key={option.value} className="config-radio-item config-radio-item--stacked">
              <div className="config-radio-item-row">
                <input
                  type="radio"
                  name="feature-display-mode"
                  value={option.value}
                  checked={config.featureDisplayMode === option.value}
                  onChange={() => updateFeatureDisplayMode(option.value)}
                />
                {option.label}
              </div>
              <span className="config-radio-item-hint">{option.hint}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="config-summary">
        <h3>Ringkasan Konfigurasi</h3>
        <p>
          Basemap:{" "}
          {BASEMAP_OPTIONS.find((o) => o.value === config.basemap)?.label}
        </p>
        <p>
          Zoom: {config.minZoom} — {config.maxZoom}
        </p>
        <p>Initial View: Fit to Boundary</p>
        <p>
          Tampilan Feature:{" "}
          {FEATURE_DISPLAY_OPTIONS.find((o) => o.value === config.featureDisplayMode)?.label}
        </p>
      </section>
    </div>
  );
}

export default ConfigurationPanel;

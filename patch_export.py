import re, sys

# ---------- 1. lib.rs ----------
path = "src-tauri/src/lib.rs"
with open(path, "r") as f:
    content = f.read()

marker_use = "use serde::Serialize;"
if marker_use not in content:
    sys.exit("ABORT: marker 'use serde::Serialize;' tidak ditemukan di lib.rs")
content = content.replace(marker_use, "use serde::{Deserialize, Serialize};", 1)

marker_run = "#[cfg_attr(mobile, tauri::mobile_entry_point)]"
if marker_run not in content:
    sys.exit("ABORT: marker mobile_entry_point tidak ditemukan di lib.rs")

new_code = '''
fn slugify(name: &str) -> String {
    let mut result = String::new();
    let mut last_was_underscore = false;
    for c in name.chars() {
        if c.is_ascii_alphanumeric() {
            result.push(c.to_ascii_lowercase());
            last_was_underscore = false;
        } else if !last_was_underscore {
            result.push('_');
            last_was_underscore = true;
        }
    }
    let trimmed = result.trim_matches('_').to_string();
    if trimmed.is_empty() {
        "layer".to_string()
    } else {
        trimmed
    }
}

#[derive(Deserialize, Clone, Debug)]
struct ExportLayerInput {
    name: String,
    datasource: String,
    color: String,
    is_boundary: bool,
}

#[derive(Deserialize, Clone, Debug)]
struct ExportConfig {
    #[allow(dead_code)]
    basemap: String,
    min_zoom: u32,
    max_zoom: u32,
    tile_url: String,
    attribution: String,
}

fn build_index_html() -> String {
    r#"<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>GIS2Web Studio Export</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<link rel="stylesheet" href="css/style.css" />
</head>
<body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script src="js/app.js"></script>
</body>
</html>
"#.to_string()
}

fn build_style_css() -> String {
    r#"html, body, #map {
  height: 100%;
  width: 100%;
  margin: 0;
  padding: 0;
}
"#.to_string()
}

fn build_app_js(config_json: &str) -> String {
    format!(
        r#"const CONFIG = {config_json};

const map = L.map('map');

L.tileLayer(CONFIG.basemap.url, {{
  attribution: CONFIG.basemap.attribution,
  minZoom: CONFIG.minZoom,
  maxZoom: CONFIG.maxZoom,
}}).addTo(map);

let boundaryFitted = false;

CONFIG.layers.forEach((layer) => {{
  fetch(layer.file)
    .then((res) => res.json())
    .then((geojson) => {{
      const gLayer = L.geoJSON(geojson, {{
        style: {{
          color: layer.color,
          weight: 2,
          fillOpacity: layer.isBoundary ? 0.05 : 0.3,
        }},
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {{ radius: 5, color: layer.color, fillOpacity: 0.7 }}),
      }}).addTo(map);

      if (layer.isBoundary) {{
        map.fitBounds(gLayer.getBounds());
        boundaryFitted = true;
      }} else if (!boundaryFitted) {{
        map.fitBounds(gLayer.getBounds());
      }}
    }})
    .catch((err) => console.error('Gagal memuat layer:', layer.file, err));
}});
"#
    )
}

#[tauri::command]
fn export_web_gis(
    project_path: String,
    output_dir: String,
    layers: Vec<ExportLayerInput>,
    config: ExportConfig,
) -> Result<String, String> {
    let output_root = Path::new(&output_dir);
    let data_dir = output_root.join("data");
    let css_dir = output_root.join("css");
    let js_dir = output_root.join("js");

    std::fs::create_dir_all(&data_dir).map_err(|e| format!("Gagal membuat folder data: {e}"))?;
    std::fs::create_dir_all(&css_dir).map_err(|e| format!("Gagal membuat folder css: {e}"))?;
    std::fs::create_dir_all(&js_dir).map_err(|e| format!("Gagal membuat folder js: {e}"))?;

    let mut used_slugs: Vec<String> = Vec::new();
    let mut layer_entries: Vec<serde_json::Value> = Vec::new();

    for layer in &layers {
        let base_slug = slugify(&layer.name);
        let mut slug = base_slug.clone();
        let mut counter = 2;
        while used_slugs.contains(&slug) {
            slug = format!("{base_slug}_{counter}");
            counter += 1;
        }
        used_slugs.push(slug.clone());

        let file_name = format!("{slug}.geojson");
        let geojson_content = get_layer_geojson(project_path.clone(), layer.datasource.clone())?;

        std::fs::write(data_dir.join(&file_name), geojson_content)
            .map_err(|e| format!("Gagal menulis {file_name}: {e}"))?;

        layer_entries.push(serde_json::json!({
            "file": format!("data/{file_name}"),
            "name": layer.name,
            "color": layer.color,
            "isBoundary": layer.is_boundary,
        }));
    }

    let config_json = serde_json::json!({
        "layers": layer_entries,
        "basemap": {
            "url": config.tile_url,
            "attribution": config.attribution,
        },
        "minZoom": config.min_zoom,
        "maxZoom": config.max_zoom,
    });

    std::fs::write(output_root.join("index.html"), build_index_html())
        .map_err(|e| format!("Gagal menulis index.html: {e}"))?;
    std::fs::write(css_dir.join("style.css"), build_style_css())
        .map_err(|e| format!("Gagal menulis style.css: {e}"))?;
    std::fs::write(js_dir.join("app.js"), build_app_js(&config_json.to_string()))
        .map_err(|e| format!("Gagal menulis app.js: {e}"))?;

    Ok(format!("Export berhasil ke: {output_dir}"))
}

'''

content = content.replace(marker_run, new_code + marker_run, 1)

marker_handler = "tauri::generate_handler![\n            greet,\n            parse_qgis_project,\n            get_layer_geojson\n        ]"
if marker_handler not in content:
    sys.exit("ABORT: marker invoke_handler tidak ditemukan persis, cek manual")
content = content.replace(
    marker_handler,
    "tauri::generate_handler![\n            greet,\n            parse_qgis_project,\n            get_layer_geojson,\n            export_web_gis\n        ]",
    1,
)

with open(path, "w") as f:
    f.write(content)
print("OK: lib.rs terpatch")

# ---------- 2. ConfigurationPanel.tsx ----------
path2 = "src/components/ConfigurationPanel.tsx"
with open(path2, "r") as f:
    c2 = f.read()

marker2 = 'export interface WebGisConfig {'
if marker2 not in c2:
    sys.exit("ABORT: marker WebGisConfig tidak ditemukan di ConfigurationPanel.tsx")

tile_info = '''export const BASEMAP_TILE_INFO: Record<BasemapOption, { url: string; attribution: string }> = {
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

'''
c2 = c2.replace(marker2, tile_info + marker2, 1)

with open(path2, "w") as f:
    f.write(c2)
print("OK: ConfigurationPanel.tsx terpatch")

# ---------- 3. ExportPanel.tsx ----------
path3 = "src/components/ExportPanel.tsx"
with open(path3, "r") as f:
    c3 = f.read()

marker3a = 'import type { WebGisConfig } from "./ConfigurationPanel";'
if marker3a not in c3:
    sys.exit("ABORT: marker import WebGisConfig tidak ditemukan di ExportPanel.tsx")
c3 = c3.replace(
    marker3a,
    'import type { WebGisConfig } from "./ConfigurationPanel";\nimport { BASEMAP_TILE_INFO } from "./ConfigurationPanel";',
    1,
)

marker3b = '''        config: {
          basemap: config.basemap,
          min_zoom: config.minZoom,
          max_zoom: config.maxZoom,
        },'''
if marker3b not in c3:
    sys.exit("ABORT: marker config invoke tidak ditemukan persis di ExportPanel.tsx")
c3 = c3.replace(
    marker3b,
    '''        config: {
          basemap: config.basemap,
          min_zoom: config.minZoom,
          max_zoom: config.maxZoom,
          tile_url: BASEMAP_TILE_INFO[config.basemap].url,
          attribution: BASEMAP_TILE_INFO[config.basemap].attribution,
        },''',
    1,
)

with open(path3, "w") as f:
    f.write(c3)
print("OK: ExportPanel.tsx terpatch")

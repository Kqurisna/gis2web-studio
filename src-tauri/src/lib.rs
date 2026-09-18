use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;

#[derive(Serialize, Clone, Debug)]
struct LayerInfo {
    name: String,
    geometry_type: String,
    datasource: String,
    color: Option<String>,
}

fn rgba_string_to_hex(value: &str) -> Option<String> {
    let parts: Vec<&str> = value.split(',').collect();
    if parts.len() < 3 {
        return None;
    }
    let r: u8 = parts[0].trim().parse().ok()?;
    let g: u8 = parts[1].trim().parse().ok()?;
    let b: u8 = parts[2].trim().parse().ok()?;
    Some(format!("#{:02x}{:02x}{:02x}", r, g, b))
}

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

fn extract_qgs_content(path: &str) -> Result<String, String> {
    let file_path = Path::new(path);
    let extension = file_path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if extension == "qgs" {
        let mut content = String::new();
        File::open(file_path)
            .map_err(|e| format!("Gagal membuka file: {e}"))?
            .read_to_string(&mut content)
            .map_err(|e| format!("Gagal membaca file: {e}"))?;
        Ok(content)
    } else if extension == "qgz" {
        let file = File::open(file_path).map_err(|e| format!("Gagal membuka file: {e}"))?;
        let mut archive =
            zip::ZipArchive::new(file).map_err(|e| format!("Gagal membuka ZIP: {e}"))?;

        for i in 0..archive.len() {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("Gagal membaca entry ZIP: {e}"))?;
            let name = entry.name().to_string();
            if name.to_lowercase().ends_with(".qgs") {
                let mut content = String::new();
                entry
                    .read_to_string(&mut content)
                    .map_err(|e| format!("Gagal membaca isi .qgs: {e}"))?;
                return Ok(content);
            }
        }
        Err("Tidak ditemukan file .qgs di dalam .qgz".to_string())
    } else {
        Err(format!("Ekstensi file tidak didukung: {extension}"))
    }
}

fn normalize_geometry_type(raw: &str) -> String {
    let lower = raw.to_lowercase();
    if lower.contains("polygon") {
        "Polygon".to_string()
    } else if lower.contains("line") {
        "Line".to_string()
    } else if lower.contains("point") {
        "Point".to_string()
    } else if lower.contains("nogeometry") || lower.contains("none") {
        "NoGeometry".to_string()
    } else {
        "Unknown".to_string()
    }
}

fn parse_layers(xml_content: &str) -> Result<Vec<LayerInfo>, String> {
    let mut reader = Reader::from_str(xml_content);
    reader.config_mut().trim_text(true);

    let mut layers = Vec::new();
    let mut buf = Vec::new();

    let mut in_maplayer = false;
    let mut in_layername = false;
    let mut in_datasource = false;
    let mut in_renderer = false;
    let mut renderer_type: Option<String> = None;
    let mut in_symbol_sublayer = false;
    let mut color_found = false;
    let mut current_geometry = "Unknown".to_string();
    let mut current_name: Option<String> = None;
    let mut current_datasource = String::new();
    let mut current_color: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name().as_ref() == b"maplayer" => {
                in_maplayer = true;
                current_geometry = "Unknown".to_string();
                current_name = None;
                current_datasource = String::new();
                current_color = None;
                color_found = false;
                renderer_type = None;
                in_symbol_sublayer = false;

                for attr_result in e.attributes() {
                    if let Ok(attr) = attr_result {
                        if attr.key.as_ref() == b"geometry" {
                            if let Ok(value) = attr.unescape_value() {
                                current_geometry = normalize_geometry_type(&value);
                            }
                        }
                    }
                }
            }
            Ok(Event::Start(e)) if in_maplayer && e.name().as_ref() == b"layername" => {
                in_layername = true;
            }
            Ok(Event::Start(e)) if in_maplayer && e.name().as_ref() == b"datasource" => {
                in_datasource = true;
            }
            Ok(Event::Start(e)) if in_maplayer && e.name().as_ref() == b"renderer-v2" => {
                in_renderer = true;
                renderer_type = None;
                for attr_result in e.attributes() {
                    if let Ok(attr) = attr_result {
                        if attr.key.as_ref() == b"type" {
                            if let Ok(v) = attr.unescape_value() {
                                renderer_type = Some(v.to_string());
                            }
                        }
                    }
                }
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"renderer-v2" => {
                in_renderer = false;
                in_symbol_sublayer = false;
            }
            // Format QGIS lama (<=2.x): <prop k="color" v="r,g,b,a"/>
            Ok(Event::Empty(e)) if in_renderer && !color_found && e.name().as_ref() == b"prop" => {
                let mut prop_key: Option<String> = None;
                let mut prop_val: Option<String> = None;
                for attr_result in e.attributes() {
                    if let Ok(attr) = attr_result {
                        if attr.key.as_ref() == b"k" {
                            if let Ok(v) = attr.unescape_value() {
                                prop_key = Some(v.to_string());
                            }
                        } else if attr.key.as_ref() == b"v" {
                            if let Ok(v) = attr.unescape_value() {
                                prop_val = Some(v.to_string());
                            }
                        }
                    }
                }
                if prop_key.as_deref() == Some("color") {
                    if let Some(v) = prop_val {
                        if let Some(hex) = rgba_string_to_hex(&v) {
                            current_color = Some(hex);
                            color_found = true;
                        }
                    }
                }
            }
            // Format QGIS modern (>=3.x), khusus singleSymbol:
            // <layer class="SimpleFill"><Option type="Map">
            //   <Option type="QString" name="color" value="r,g,b,a,..."/>
            Ok(Event::Start(e)) | Ok(Event::Empty(e))
                if in_renderer
                    && !color_found
                    && renderer_type.as_deref() == Some("singleSymbol")
                    && e.name().as_ref() == b"layer" =>
            {
                in_symbol_sublayer = true;
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"layer" => {
                in_symbol_sublayer = false;
            }
            Ok(Event::Empty(e))
                if in_symbol_sublayer && !color_found && e.name().as_ref() == b"Option" =>
            {
                let mut opt_name: Option<String> = None;
                let mut opt_val: Option<String> = None;
                for attr_result in e.attributes() {
                    if let Ok(attr) = attr_result {
                        if attr.key.as_ref() == b"name" {
                            if let Ok(v) = attr.unescape_value() {
                                opt_name = Some(v.to_string());
                            }
                        } else if attr.key.as_ref() == b"value" {
                            if let Ok(v) = attr.unescape_value() {
                                opt_val = Some(v.to_string());
                            }
                        }
                    }
                }
                if opt_name.as_deref() == Some("color") {
                    if let Some(v) = opt_val {
                        if let Some(hex) = rgba_string_to_hex(&v) {
                            current_color = Some(hex);
                            color_found = true;
                        }
                    }
                }
            }
            Ok(Event::Text(e)) if in_layername => {
                let text = e
                    .unescape()
                    .map_err(|err| format!("Gagal parsing XML: {err}"))?
                    .to_string();
                if !text.trim().is_empty() {
                    current_name = Some(text.trim().to_string());
                }
            }
            Ok(Event::Text(e)) if in_datasource => {
                let text = e
                    .unescape()
                    .map_err(|err| format!("Gagal parsing XML: {err}"))?
                    .to_string();
                current_datasource = text.trim().to_string();
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"layername" => {
                in_layername = false;
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"datasource" => {
                in_datasource = false;
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"maplayer" => {
                if let Some(name) = current_name.take() {
                    layers.push(LayerInfo {
                        name,
                        geometry_type: current_geometry.clone(),
                        datasource: current_datasource.clone(),
                        color: current_color.take(),
                    });
                }
                in_maplayer = false;
            }
            Ok(Event::Eof) => break,
            Err(err) => return Err(format!("Gagal parsing XML: {err}")),
            _ => {}
        }
        buf.clear();
    }

    Ok(layers)
}

#[tauri::command]
fn parse_qgis_project(path: String) -> Result<Vec<LayerInfo>, String> {
    let xml_content = extract_qgs_content(&path)?;
    parse_layers(&xml_content)
}

fn find_file_by_basename(search_root: &Path, basename: &str) -> Option<PathBuf> {
    for entry in WalkDir::new(search_root)
        .max_depth(6)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        if entry.file_type().is_file() {
            if let Some(name) = entry.file_name().to_str() {
                if name == basename {
                    return Some(entry.path().to_path_buf());
                }
            }
        }
    }
    None
}

fn resolve_data_path(project_dir: &Path, raw_path: &str) -> Result<PathBuf, String> {
    let cleaned = raw_path.trim_start_matches("file:");
    let candidate = project_dir.join(cleaned);

    if candidate.exists() {
        return Ok(candidate);
    }

    let basename = Path::new(cleaned)
        .file_name()
        .and_then(|n| n.to_str())
        .ok_or_else(|| format!("Path data tidak valid: {raw_path}"))?;

    if let Some(found) = find_file_by_basename(project_dir, basename) {
        return Ok(found);
    }

    Err(format!(
        "File data tidak ditemukan: {basename} (path asli: {raw_path})"
    ))
}

fn run_ogr2ogr(args: &[String]) -> Result<String, String> {
    let candidates = ["ogr2ogr", "/opt/homebrew/bin/ogr2ogr", "/usr/local/bin/ogr2ogr"];

    let mut last_error = String::new();
    for bin in candidates {
        match Command::new(bin).args(args).output() {
            Ok(output) => {
                if output.status.success() {
                    return Ok(String::new());
                } else {
                    last_error = String::from_utf8_lossy(&output.stderr).to_string();
                }
            }
            Err(e) => {
                last_error = e.to_string();
                continue;
            }
        }
    }
    Err(format!("Gagal menjalankan ogr2ogr: {last_error}"))
}

fn unique_temp_geojson_path() -> PathBuf {
    let nanos = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    std::env::temp_dir().join(format!("gis2web_{nanos}.geojson"))
}

#[tauri::command]
fn get_layer_geojson(project_path: String, datasource: String) -> Result<String, String> {
    if datasource.trim().is_empty() {
        return Err("Layer tidak memiliki sumber data (kosong)".to_string());
    }
    if datasource.contains("type=xyz") || datasource.starts_with("crs=") {
        return Err("Layer ini adalah basemap/tile, bukan data vektor".to_string());
    }

    let project_dir = Path::new(&project_path)
        .parent()
        .ok_or("Tidak dapat menentukan folder project")?
        .to_path_buf();

    let output_path = unique_temp_geojson_path();
    let output_path_str = output_path.to_string_lossy().to_string();

    let source_args: Vec<String>;

    if datasource.starts_with("/vsizip/") {
        // Format: /vsizip/<path ke .zip>/<file di dalam zip>|layername=<nama>
        let without_prefix = datasource.trim_start_matches("/vsizip/");
        let (inner_path, layer_name) = match without_prefix.split_once("|layername=") {
            Some((p, l)) => (p.to_string(), l.to_string()),
            None => (without_prefix.to_string(), String::new()),
        };

        // Pisahkan path ZIP dan file di dalamnya (dipisah setelah ".zip")
        let zip_marker = ".zip";
        let zip_pos = inner_path
            .find(zip_marker)
            .ok_or_else(|| format!("Format vsizip tidak dikenali: {datasource}"))?;
        let zip_path_raw = &inner_path[..zip_pos + zip_marker.len()];
        let file_inside_zip = inner_path[zip_pos + zip_marker.len()..]
            .trim_start_matches('/')
            .to_string();

        let resolved_zip = resolve_data_path(&project_dir, zip_path_raw)?;
        let vsizip_path = format!(
            "/vsizip/{}/{}",
            resolved_zip.to_string_lossy(),
            file_inside_zip
        );

        let mut args = vec![
            "-f".to_string(),
            "GeoJSON".to_string(),
            "-t_srs".to_string(),
            "EPSG:4326".to_string(),
            output_path_str.clone(),
            vsizip_path,
        ];
        if !layer_name.is_empty() {
            args.push(layer_name);
        }
        source_args = args;
    } else if datasource.contains(".gpkg|layername=") {
        let parts: Vec<&str> = datasource.splitn(2, "|layername=").collect();
        let raw_path = parts[0];
        let layer_name = parts.get(1).unwrap_or(&"").to_string();
        let resolved = resolve_data_path(&project_dir, raw_path)?;
        source_args = vec![
            "-f".to_string(),
            "GeoJSON".to_string(),
            "-t_srs".to_string(),
            "EPSG:4326".to_string(),
            output_path_str.clone(),
            resolved.to_string_lossy().to_string(),
            layer_name,
        ];
    } else if datasource.starts_with("file:") && datasource.contains(".csv") {
        let path_part = datasource
            .trim_start_matches("file:")
            .split('?')
            .next()
            .unwrap_or("")
            .to_string();
        let query_part = datasource.split('?').nth(1).unwrap_or("");

        let mut x_field = "longitude".to_string();
        let mut y_field = "latitude".to_string();
        for kv in query_part.split('&') {
            if let Some((k, v)) = kv.split_once('=') {
                if k == "xField" {
                    x_field = v.to_string();
                } else if k == "yField" {
                    y_field = v.to_string();
                }
            }
        }

        let resolved = resolve_data_path(&project_dir, &path_part)?;
        source_args = vec![
            "-f".to_string(),
            "GeoJSON".to_string(),
            "-t_srs".to_string(),
            "EPSG:4326".to_string(),
            output_path_str.clone(),
            resolved.to_string_lossy().to_string(),
            "-oo".to_string(),
            format!("X_POSSIBLE_NAMES={x_field}"),
            "-oo".to_string(),
            format!("Y_POSSIBLE_NAMES={y_field}"),
        ];
    } else {
        let resolved = resolve_data_path(&project_dir, &datasource)?;
        source_args = vec![
            "-f".to_string(),
            "GeoJSON".to_string(),
            "-t_srs".to_string(),
            "EPSG:4326".to_string(),
            output_path_str.clone(),
            resolved.to_string_lossy().to_string(),
        ];
    }

    run_ogr2ogr(&source_args)?;

    let mut geojson_content = String::new();
    File::open(&output_path)
        .map_err(|e| format!("Gagal membuka hasil konversi: {e}"))?
        .read_to_string(&mut geojson_content)
        .map_err(|e| format!("Gagal membaca hasil konversi: {e}"))?;

    let _ = std::fs::remove_file(&output_path);

    Ok(geojson_content)
}


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
    opacity: f64,
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
          fillOpacity: layer.isBoundary ? 0 : layer.opacity,
        }},
        pointToLayer: (feature, latlng) =>
          L.circleMarker(latlng, {{ radius: 5, color: layer.color, fillOpacity: layer.opacity }}),
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
            "opacity": layer.opacity,
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            parse_qgis_project,
            get_layer_geojson,
            export_web_gis
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

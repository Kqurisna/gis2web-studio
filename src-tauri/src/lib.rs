use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::Serialize;
use walkdir::WalkDir;

#[derive(Serialize, Clone, Debug)]
struct LayerInfo {
    name: String,
    geometry_type: String,
    datasource: String,
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
    let mut current_geometry = "Unknown".to_string();
    let mut current_name: Option<String> = None;
    let mut current_datasource = String::new();

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name().as_ref() == b"maplayer" => {
                in_maplayer = true;
                current_geometry = "Unknown".to_string();
                current_name = None;
                current_datasource = String::new();

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            parse_qgis_project,
            get_layer_geojson
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

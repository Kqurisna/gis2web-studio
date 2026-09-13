use std::fs::File;
use std::io::Read;
use std::path::Path;

use quick_xml::events::Event;
use quick_xml::reader::Reader;
use serde::Serialize;

#[derive(Serialize, Clone, Debug)]
struct LayerInfo {
    name: String,
    geometry_type: String,
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

/// Normalisasi nilai atribut geometry dari QGIS jadi salah satu:
/// "Point", "Line", "Polygon", "NoGeometry", atau "Unknown".
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
    let mut current_geometry = "Unknown".to_string();
    let mut current_name: Option<String> = None;

    loop {
        match reader.read_event_into(&mut buf) {
            Ok(Event::Start(e)) | Ok(Event::Empty(e)) if e.name().as_ref() == b"maplayer" => {
                in_maplayer = true;
                current_geometry = "Unknown".to_string();
                current_name = None;

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
            Ok(Event::Text(e)) if in_layername => {
                let text = e
                    .unescape()
                    .map_err(|err| format!("Gagal parsing XML: {err}"))?
                    .to_string();
                if !text.trim().is_empty() {
                    current_name = Some(text.trim().to_string());
                }
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"layername" => {
                in_layername = false;
            }
            Ok(Event::End(e)) if e.name().as_ref() == b"maplayer" => {
                if let Some(name) = current_name.take() {
                    layers.push(LayerInfo {
                        name,
                        geometry_type: current_geometry.clone(),
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![greet, parse_qgis_project])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

# GIS2Web Studio

GIS2Web Studio is a desktop application that turns QGIS projects and vector GIS data into interactive, deployable Web GIS applications.

It provides a visual workflow to import a QGIS project, configure how each layer looks, preview the result, and export a static web map (HTML, CSS, JavaScript, and GeoJSON) that can be hosted anywhere without a server-side GIS stack.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Workflow](#workflow)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [How to Use](#how-to-use)
- [Configuration vs Export Settings](#configuration-vs-export-settings)
- [Project Settings File](#project-settings-file)
- [Export Output](#export-output)
- [Project Structure](#project-structure)
- [Development Commands](#development-commands)
- [Troubleshooting](#troubleshooting)
- [Limitations](#limitations)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

GIS2Web Studio bridges desktop GIS and web mapping. Instead of hand-writing a Leaflet page, you work with your existing QGIS project:

- Your original QGIS data and project file are **never modified**.
- Geometry is **never altered**; only presentation (color, opacity, point size, labels) is configured.
- The exported Web GIS is a plain static site that you can open locally or deploy to any static hosting.

---

## Features

### Import and layers

- Import QGIS projects (`.qgs` / `.qgz`).
- Detect vector layers and convert them to GeoJSON using GDAL (`ogr2ogr`).
- Choose which layers are published, and set one **Boundary Layer** used as the map's focus area.
- Reorder layers (stacking order is kept in the preview and the export).

### Layer styling

- Layer color and opacity.
- Category and range coloring read from the QGIS project, with per-category color overrides.
- Point size for point layers.
- Feature labels based on the QGIS labeling settings.
- Choose which attribute fields are visible in Feature Information.

### Main map (workspace)

- Interactive Leaflet map for arranging and inspecting layers.
- **Feature Information** card with attribute display.
- **Attribute Table** panel for layers where it is enabled.
- **Smart hover and hit-test**: points are prioritized over lines, and lines over polygons, so small features inside a buffer remain selectable.
- **Click-cycle**: clicking repeatedly at the same spot cycles through overlapping features.
- Feature highlighting for hover and selection.
- One-click **focus to Boundary Layer** button.
- Zoom-out is limited to a single world view; there is no manual min/max zoom limit.

### Basemaps

- Built-in basemaps: OpenStreetMap, Satellite (Esri World Imagery), Topographic (OpenTopoMap).
- Basemaps detected in the QGIS project: external tile (XYZ) URLs, and local rasters (tile pyramid generated with GDAL when available).

### Export Preview

- Preview the final Web GIS before exporting, using the same configuration that the export will use.
- Switch between **Desktop** and **Mobile** preview sizes.
- Smart hover, click-cycle, selection highlight, and the focus-to-boundary button are available in the preview.

### Web GIS export

- Generates a static site: `index.html`, CSS, JavaScript, and layer data.
- Applies the Export Configuration (zoom range, label size, feature display mode).
- Includes a focus-to-boundary button in the generated map.

### Saved settings

- Basemap and export settings are saved automatically per project and restored when the same project is imported again.

---

## Workflow

```text
QGIS Project (.qgs / .qgz)
        │
        ▼
Project Parser (Rust)
        │
        ▼
Vector Layer Detection
        │
        ▼
GDAL / ogr2ogr
        │
        ▼
GeoJSON
        │
        ▼
Layer Configuration (color, order, point size, labels, boundary)
        │
        ▼
Interactive Map Preview
        │
        ▼
Export Configuration (zoom, label size, feature display)
        │
        ▼
Web GIS Export
        │
        ▼
HTML + CSS + JavaScript + GeoJSON
```

---

## Tech Stack

| Area               | Technology                                   |
| ------------------ | -------------------------------------------- |
| Desktop shell      | Tauri 2                                      |
| Backend            | Rust                                         |
| Frontend           | React + TypeScript (Vite)                    |
| Mapping            | Leaflet                                      |
| Geometry utilities | Turf.js (point-in-polygon, distance)         |
| GIS conversion     | GDAL (`ogr2ogr`, optionally `gdal2tiles.py`) |

---

## Prerequisites

- **Node.js** and **npm**
- **Rust** toolchain (via [rustup](https://rustup.rs))
- **Tauri 2 system dependencies** for your OS (see the [Tauri prerequisites guide](https://tauri.app/start/prerequisites/))
- **GDAL** with `ogr2ogr` available on your `PATH` (required to convert vector layers to GeoJSON)
- `gdal2tiles.py` (optional, only needed for local raster basemaps)

Check that GDAL is available:

```bash
ogr2ogr --version
```

---

## Getting Started

```bash
# 1. Clone the repository
git clone <repository-url>
cd gis2web-studio

# 2. Install dependencies
npm install

# 3. Run in development mode
npm run tauri dev
```

To create a production build of the desktop app:

```bash
npm run tauri build
```

---

## How to Use

1. **Project**: click **Import Project** and select a `.qgs` or `.qgz` file. Layers are loaded and shown on the map.
2. **Select layers**: choose which layers to publish and set the **Boundary Layer**.
3. **Style layers**: adjust color, opacity, point size, order, visible fields, and attribute table options.
4. **Configuration**: choose the **Basemap**.
5. **Export**: set the Export Configuration and check the **Preview** (Desktop or Mobile).
6. Choose an **output folder** and click **Export Web GIS**.
7. Open the generated `index.html` in a browser, or deploy the folder to any static host.

---

## Configuration vs Export Settings

Settings are split by where they apply:

| Where                             | Setting                               | Applies to                              |
| --------------------------------- | ------------------------------------- | --------------------------------------- |
| **Configuration** (project-level) | Basemap                               | Main map, Preview, and exported Web GIS |
| **Export**                        | Minimum Zoom                          | Preview and exported Web GIS only       |
| **Export**                        | Maximum Zoom                          | Preview and exported Web GIS only       |
| **Export**                        | Label Font Size                       | Preview and exported Web GIS only       |
| **Export**                        | Feature Display (Card / Popup / Both) | Preview and exported Web GIS only       |

The main map is a workspace for arranging and inspecting layers. The Preview simulates the Web GIS, and the Export produces it. Preview and Export read the same configuration, so they stay consistent.

---

## Project Settings File

Basemap and Export settings are saved next to your QGIS project file:

```text
MyProject.qgz
MyProject.qgz.gis2web.json
```

The file is created and updated automatically and loaded when you import the same project again. Invalid values (for example, a zoom level out of range) are clamped to valid limits. It is safe to delete; defaults are used when it is missing.

---

## Export Output

The export writes a static site into the folder you choose:

```text
output-folder/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
└── ...            (layer data as GeoJSON, and tiles if a local raster basemap is used)
```

All export settings are embedded in the generated JavaScript, so the site works without any backend.

---

## Project Structure

```text
gis2web-studio/
├── src/                      # React + TypeScript frontend
│   ├── App.tsx               # App state and layout
│   ├── components/
│   │   ├── MapView.tsx           # Main map (workspace)
│   │   ├── ProjectPanel.tsx      # Layer list and styling
│   │   ├── ConfigurationPanel.tsx# Basemap configuration
│   │   ├── ExportPanel.tsx       # Export settings and output
│   │   ├── ExportPreviewMap.tsx  # Web GIS preview
│   │   ├── FeatureInfoCard.tsx
│   │   └── AttributeTablePanel.tsx
│   └── lib/                  # Shared logic (hit-test, styling, GeoJSON cache)
├── src-tauri/
│   └── src/lib.rs            # Rust commands: parsing, GDAL calls, export generator
├── public/
└── package.json
```

---

## Development Commands

| Purpose                         | Command                       |
| ------------------------------- | ----------------------------- |
| Run the desktop app in dev mode | `npm run tauri dev`           |
| Build the frontend              | `npm run build`               |
| TypeScript check                | `npx tsc --noEmit`            |
| Rust check                      | `cd src-tauri && cargo check` |
| Production desktop build        | `npm run tauri build`         |

---

## Troubleshooting

**Layers fail to load or convert**
Make sure `ogr2ogr` is installed and on your `PATH` (`ogr2ogr --version`).

**Local raster basemap is disabled**
`gdal2tiles.py` was not found. Install GDAL with its Python tools, or use an external tile basemap instead.

**Preview shows no layers**
Select at least one layer and a Boundary Layer, and wait until the layers finish loading after import.

**Exported map looks different from the Preview**
Re-export after changing settings. The export always uses the settings at the time you click **Export Web GIS**.

**Settings are not restored**
Settings are saved next to the project file. Check that the folder is writable and the project path has not changed.

---

## Limitations

- Only vector layers are converted to GeoJSON; raster layers are supported only as basemaps.
- Very large datasets can make the preview and the exported map slow, since data is rendered in the browser.
- QGIS styling is read partially (single color, categories, ranges, labels); advanced QGIS symbology is not reproduced.

---

## Contributing

Contributions and bug reports are welcome. Before opening a pull request, please run:

```bash
npx tsc --noEmit
cd src-tauri && cargo check
```

Commit messages follow [Conventional Commits](https://www.conventionalcommits.org/) (for example `feat(export): ...`, `fix(map): ...`).

---

## License

Add your license here.

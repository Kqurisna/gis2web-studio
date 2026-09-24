# GIS2Web Studio

GIS2Web Studio is a desktop application for transforming QGIS projects and vector GIS data into interactive, deployable Web GIS applications.

The application provides a visual workflow for importing QGIS projects, processing vector layers, configuring map presentation, previewing the resulting Web GIS, and exporting the configured map as a static web application.

---

## Overview

GIS2Web Studio bridges the workflow between desktop GIS and web mapping.

Users can import a QGIS project (`.qgs` / `.qgz`), inspect its vector layers, convert supported GIS data into GeoJSON, configure layer presentation, preview the map interactively, and generate a static Web GIS that can be deployed independently.

### Main Workflow

```text
QGIS Project
     │
     ▼
QGIS Project Parser
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
Layer Configuration
     │
     ▼
Interactive Map Preview
     │
     ▼
Web GIS Export
     │
     ▼
HTML + CSS + JavaScript + GeoJSON

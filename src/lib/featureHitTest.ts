import L from "leaflet";
import { booleanPointInPolygon } from "@turf/boolean-point-in-polygon";
import { point as turfPoint } from "@turf/helpers";
import { pointToLineDistance } from "@turf/point-to-line-distance";
import { polygonToLine } from "@turf/polygon-to-line";

// Modul bersama hit-test fitur (dipakai Map utama dan Preview Export).
// Logika dipindah dari MapView.tsx tanpa perubahan perilaku.

export const NEAREST_FEATURE_PIXEL_TOLERANCE = 18;

export interface FeatureCandidate {
  layerIndex: number;
  featureIndex: number;
  layerInstance: L.Layer;
}

export interface FeatureHitTestParams {
  map: L.Map;
  latlng: L.LatLng;
  layerOrder: number[];
  layerIndexes: Iterable<number>;
  isLayerVisible: (layerIndex: number) => boolean;
  getGeojson: (layerIndex: number) => GeoJSON.FeatureCollection | undefined;
  getFeatureLayer: (key: string) => L.Layer | undefined;
}

function geometryPriority(geomType: string | undefined): number {
  if (geomType === "Point" || geomType === "MultiPoint") return 0;
  if (geomType === "LineString" || geomType === "MultiLineString") return 1;
  if (geomType === "Polygon" || geomType === "MultiPolygon") return 2;
  return 3;
}

export function getFeatureCandidates(params: FeatureHitTestParams): FeatureCandidate[] {
  const { map, latlng, layerOrder, layerIndexes, isLayerVisible, getGeojson, getFeatureLayer } = params;

  const pt = turfPoint([latlng.lng, latlng.lat]);
  const candidates: {
    layerIndex: number;
    featureIndex: number;
    layerInstance: L.Layer;
    geomType: string | undefined;
  }[] = [];
  // Dipakai untuk fallback nearest-feature: jarak (meter) tiap kandidat ke titik klik/hover.
  const nearestByDistance: {
    layerIndex: number;
    featureIndex: number;
    layerInstance: L.Layer;
    geomType: string | undefined;
    distanceMeters: number;
  }[] = [];

  // Toleransi klik/hover dalam meter, dihitung dari toleransi piksel layar
  // pada zoom saat ini, supaya konsisten secara visual di semua level zoom.
  const clickPoint = map.latLngToContainerPoint(latlng);
  const toleranceProbePoint = L.point(clickPoint.x + NEAREST_FEATURE_PIXEL_TOLERANCE, clickPoint.y);
  const toleranceLatLng = map.containerPointToLatLng(toleranceProbePoint);
  const toleranceMeters = latlng.distanceTo(toleranceLatLng);

  const orderedLayerIndexes = [...layerOrder];
  for (const idx of layerIndexes) {
    if (!orderedLayerIndexes.includes(idx)) orderedLayerIndexes.push(idx);
  }

  for (const layerIndex of orderedLayerIndexes) {
    if (!isLayerVisible(layerIndex)) continue;

    const geojsonData = getGeojson(layerIndex);
    if (!geojsonData) continue;

    const features = geojsonData.features ?? [];
    const matchedInLayer: number[] = [];

    features.forEach((feature, featureIndex) => {
      const geomType = feature.geometry?.type;

      if (geomType === "Point" || geomType === "MultiPoint") {
        const coordsList =
          geomType === "Point"
            ? [(feature.geometry as GeoJSON.Point).coordinates]
            : (feature.geometry as GeoJSON.MultiPoint).coordinates;

        for (const [lng, lat] of coordsList) {
          const distanceMeters = latlng.distanceTo(L.latLng(lat, lng));
          if (distanceMeters <= toleranceMeters) {
            const key = `${layerIndex}:${featureIndex}`;
            const layerInstance = getFeatureLayer(key);
            if (layerInstance) {
              nearestByDistance.push({ layerIndex, featureIndex, layerInstance, geomType, distanceMeters });
            }
            break;
          }
        }
        return;
      }

      if (geomType === "LineString" || geomType === "MultiLineString") {
        try {
          const lineFeatures =
            geomType === "MultiLineString"
              ? (feature.geometry as GeoJSON.MultiLineString).coordinates.map((coords) => ({
                  type: "Feature" as const,
                  properties: {},
                  geometry: { type: "LineString" as const, coordinates: coords },
                }))
              : [feature as GeoJSON.Feature<GeoJSON.LineString>];

          for (const line of lineFeatures) {
            const distanceMeters = pointToLineDistance(pt, line, { units: "meters" });
            if (distanceMeters <= toleranceMeters) {
              const key = `${layerIndex}:${featureIndex}`;
              const layerInstance = getFeatureLayer(key);
              if (layerInstance) {
                nearestByDistance.push({ layerIndex, featureIndex, layerInstance, geomType, distanceMeters });
              }
              break;
            }
          }
        } catch {
          // geometry tidak valid, skip
        }
        return;
      }

      if (geomType !== "Polygon" && geomType !== "MultiPolygon") return;
      const typedFeature = feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>;

      try {
        if (booleanPointInPolygon(pt, typedFeature)) {
          matchedInLayer.push(featureIndex);
          return;
        }
      } catch {
        // geometry tidak valid, skip exact hit-test untuk feature ini
      }

      // Fallback: feature kecil (mis. buffer radius kecil) sering meleset
      // dari exact point-in-polygon. Hitung jarak titik klik ke garis luar
      // polygon; kalau masih dalam toleransi piksel, anggap "kena".
      try {
        const boundaryLine = polygonToLine(typedFeature);
        const lineFeatures =
          boundaryLine.type === "FeatureCollection" ? boundaryLine.features : [boundaryLine];

        // pointToLineDistance hanya menerima LineString tunggal; pecah
        // setiap MultiLineString menjadi beberapa LineString terpisah.
        const singleLines: GeoJSON.Feature<GeoJSON.LineString>[] = [];
        lineFeatures.forEach((lf) => {
          if (lf.geometry.type === "LineString") {
            singleLines.push(lf as GeoJSON.Feature<GeoJSON.LineString>);
          } else if (lf.geometry.type === "MultiLineString") {
            lf.geometry.coordinates.forEach((coords) => {
              singleLines.push({
                type: "Feature",
                properties: {},
                geometry: { type: "LineString", coordinates: coords },
              });
            });
          }
        });

        for (const line of singleLines) {
          const distanceMeters = pointToLineDistance(pt, line, { units: "meters" });
          if (distanceMeters <= toleranceMeters) {
            const key = `${layerIndex}:${featureIndex}`;
            const layerInstance = getFeatureLayer(key);
            if (layerInstance) {
              nearestByDistance.push({ layerIndex, featureIndex, layerInstance, geomType, distanceMeters });
            }
            break;
          }
        }
      } catch {
        // geometry tidak valid untuk fallback juga, skip
      }
    });

    matchedInLayer
      .sort((a, b) => b - a)
      .forEach((featureIndex) => {
        const key = `${layerIndex}:${featureIndex}`;
        const layerInstance = getFeatureLayer(key);
        if (layerInstance) {
          const geomType = geojsonData.features[featureIndex]?.geometry?.type;
          candidates.push({ layerIndex, featureIndex, layerInstance, geomType });
        }
      });
  }

  // PENTING: exact hit (candidates, biasanya Polygon) dan fallback jarak
  // (nearestByDistance, tempat Point/Line masuk) HARUS digabung sebelum
  // sorting priority. Kalau tidak, Point yang berada di dalam Buffer
  // (exact hit Polygon selalu true) tidak akan pernah dibandingkan dengan
  // Point sama sekali, karena dulu exact-hit langsung di-return duluan
  // tanpa mempertimbangkan nearestByDistance.
  type MergedCandidate = {
    layerIndex: number;
    featureIndex: number;
    layerInstance: L.Layer;
    geomType: string | undefined;
    distanceMeters: number;
  };

  const merged: MergedCandidate[] = [
    ...candidates.map((c) => ({ ...c, distanceMeters: 0 })),
    ...nearestByDistance,
  ];

  if (merged.length === 0) return [];

  merged.sort((a, b) => {
    const priorityDiff = geometryPriority(a.geomType) - geometryPriority(b.geomType);
    if (priorityDiff !== 0) return priorityDiff;
    return a.distanceMeters - b.distanceMeters;
  });

  return merged.map(({ layerIndex, featureIndex, layerInstance }) => ({
    layerIndex,
    featureIndex,
    layerInstance,
  }));
}

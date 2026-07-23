import { readFile } from 'node:fs/promises';

const files = [
  {
    label: 'NEA no-smoking zone',
    path: process.env.NO_SMOKING_ZONE_FILE ?? new URL('../src/data/no-smoking-zones.geojson', import.meta.url),
  },
  {
    label: 'NParks no-smoking',
    path: process.env.NPARKS_NO_SMOKING_FILE ?? new URL('../src/data/nparks-no-smoking.geojson', import.meta.url),
  },
];

function validatePosition(position, label, featureIndex) {
  if (!Array.isArray(position) || position.length < 2) throw new Error(`${label}: invalid position at feature ${featureIndex}`);
  const [longitude, latitude] = position;
  if (typeof longitude !== 'number' || typeof latitude !== 'number' || longitude < 103.5 || longitude > 104.1 || latitude < 1.1 || latitude > 1.6) {
    throw new Error(`${label}: coordinates outside Singapore at feature ${featureIndex}`);
  }
}

function validatePolygonCoordinates(coordinates, label, featureIndex) {
  if (!Array.isArray(coordinates) || coordinates.length === 0) throw new Error(`${label}: empty polygon at feature ${featureIndex}`);
  for (const ring of coordinates) {
    if (!Array.isArray(ring) || ring.length < 4) throw new Error(`${label}: invalid ring at feature ${featureIndex}`);
    for (const position of ring) validatePosition(position, label, featureIndex);
  }
}

for (const file of files) {
  const data = JSON.parse(await readFile(file.path, 'utf8'));
  if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length === 0) {
    throw new Error(`${file.label}: expected a non-empty FeatureCollection`);
  }

  const ids = new Set();
  for (const [index, feature] of data.features.entries()) {
    const { geometry, properties } = feature ?? {};
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) throw new Error(`${file.label}: invalid geometry at feature ${index}`);
    if (geometry.type === 'Polygon') validatePolygonCoordinates(geometry.coordinates, file.label, index);
    else {
      if (!Array.isArray(geometry.coordinates) || geometry.coordinates.length === 0) throw new Error(`${file.label}: empty multipolygon at feature ${index}`);
      for (const polygon of geometry.coordinates) validatePolygonCoordinates(polygon, file.label, index);
    }

    if (properties?.OBJECTID === undefined || properties.OBJECTID === null) throw new Error(`${file.label}: missing OBJECTID at feature ${index}`);
    if (ids.has(properties.OBJECTID)) throw new Error(`${file.label}: duplicate OBJECTID ${properties.OBJECTID}`);
    ids.add(properties.OBJECTID);
  }

  console.log(`Validated ${data.features.length} ${file.label} polygon features.`);
}

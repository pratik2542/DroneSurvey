import shp from 'shpjs';
import { KmlLayer, KmlFeature, GeometryType } from '../types';

// Helper to convert GeoJSON geometry coordinates ([lng, lat]) to Leaflet ([lat, lng]) format
function convertGeoJsonGeometry(geometry: any): { type: GeometryType; coords: any } {
  if (!geometry) {
    return { type: 'Unknown', coords: null };
  }

  const { type, coordinates } = geometry;

  switch (type) {
    case 'Point': {
      if (Array.isArray(coordinates) && coordinates.length >= 2) {
        return { type: 'Point', coords: [coordinates[1], coordinates[0]] };
      }
      break;
    }
    case 'LineString': {
      if (Array.isArray(coordinates)) {
        const coords = coordinates.map((pt: any) => [pt[1], pt[0]]);
        return { type: 'LineString', coords };
      }
      break;
    }
    case 'Polygon': {
      if (Array.isArray(coordinates)) {
        const coords = coordinates.map((ring: any) => 
          ring.map((pt: any) => [pt[1], pt[0]])
        );
        return { type: 'Polygon', coords };
      }
      break;
    }
    case 'MultiPoint': {
      if (Array.isArray(coordinates)) {
        const geoms = coordinates.map((pt: any) => ({
          type: 'Point',
          coords: [pt[1], pt[0]]
        }));
        return { type: 'MultiGeometry', coords: geoms };
      }
      break;
    }
    case 'MultiLineString': {
      if (Array.isArray(coordinates)) {
        const geoms = coordinates.map((line: any) => ({
          type: 'LineString',
          coords: line.map((pt: any) => [pt[1], pt[0]])
        }));
        return { type: 'MultiGeometry', coords: geoms };
      }
      break;
    }
    case 'MultiPolygon': {
      if (Array.isArray(coordinates)) {
        const geoms = coordinates.map((poly: any) => ({
          type: 'Polygon',
          coords: poly.map((ring: any) => 
            ring.map((pt: any) => [pt[1], pt[0]])
          )
        }));
        return { type: 'MultiGeometry', coords: geoms };
      }
      break;
    }
    case 'GeometryCollection': {
      if (Array.isArray(geometry.geometries)) {
        const geoms = geometry.geometries.map((g: any) => convertGeoJsonGeometry(g))
          .filter((g: any) => g.type !== 'Unknown');
        return { type: 'MultiGeometry', coords: geoms };
      }
      break;
    }
  }

  return { type: 'Unknown', coords: null };
}

// Calculate bounding box for a feature without stack overflow risk
function calculateFeatureBounds(geometryType: GeometryType, coords: any): [number, number, number, number] | undefined {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let hasCoords = false;
  
  const collect = (type: string, c: any) => {
    if (type === 'Point' && Array.isArray(c) && c.length === 2) {
      const lat = c[0];
      const lng = c[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      hasCoords = true;
    } else if (type === 'LineString' && Array.isArray(c)) {
      c.forEach((point: any) => {
        if (Array.isArray(point) && point.length === 2) {
          const lat = point[0];
          const lng = point[1];
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          hasCoords = true;
        }
      });
    } else if (type === 'Polygon' && Array.isArray(c)) {
      const outerRing = c[0];
      if (Array.isArray(outerRing)) {
        outerRing.forEach((point: any) => {
          if (Array.isArray(point) && point.length === 2) {
            const lat = point[0];
            const lng = point[1];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            hasCoords = true;
          }
        });
      }
    } else if (type === 'MultiGeometry' && Array.isArray(c)) {
      c.forEach((geom: any) => {
        collect(geom.type, geom.coords);
      });
    }
  };
  
  collect(geometryType, coords);
  
  if (!hasCoords) return undefined;
  
  return [minLat, minLng, maxLat, maxLng];
}

// Parses zipped shapefile buffer and returns KmlLayer representations
export async function parseShapefile(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  fileSize: string
): Promise<KmlLayer[]> {
  const geojson = await shp(arrayBuffer);
  
  // shpjs can return a single FeatureCollection or an array of FeatureCollections
  const collections = Array.isArray(geojson) ? geojson : [geojson];
  const layers: KmlLayer[] = [];
  
  const baseColors = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
  ];

  collections.forEach((collection: any, idx: number) => {
    const shpName = collection.fileName || fileName.replace(/\.zip$/i, '');
    const layerName = collections.length > 1 ? `${shpName} - Part ${idx + 1}` : shpName;
    const layerId = `layer-shp-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 9)}`;
    const color = baseColors[idx % baseColors.length];
    
    const features: KmlFeature[] = [];
    
    if (collection && Array.isArray(collection.features)) {
      collection.features.forEach((feature: any, fIdx: number) => {
        const { type: geometryType, coords } = convertGeoJsonGeometry(feature.geometry);
        if (geometryType === 'Unknown') return;
        
        // Extract properties and stringify them
        const properties: Record<string, string> = {};
        if (feature.properties) {
          Object.entries(feature.properties).forEach(([key, val]) => {
            if (val !== null && val !== undefined) {
              properties[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
            }
          });
        }
        
        // Name picker heuristics
        const nameKeys = ['name', 'Name', 'id', 'ID', 'label', 'Label', 'title', 'Title'];
        let featureName = '';
        for (const k of nameKeys) {
          if (properties[k]) {
            featureName = properties[k];
            break;
          }
        }
        if (!featureName) {
          const firstVal = Object.values(properties)[0];
          featureName = firstVal ? String(firstVal) : `${geometryType} #${fIdx + 1}`;
        }
        
        const bounds = calculateFeatureBounds(geometryType, coords);
        
        features.push({
          id: `feature-shp-${layerId}-${fIdx}-${Math.random().toString(36).substr(2, 9)}`,
          name: featureName,
          description: properties.description || properties.Desc || '',
          geometryType,
          coordinates: coords,
          properties,
          bounds
        });
      });
    }
    
    // Compute layer-wide bounds
    let layerMinLat = Infinity;
    let layerMaxLat = -Infinity;
    let layerMinLng = Infinity;
    let layerMaxLng = -Infinity;
    let hasLayerCoords = false;
    
    features.forEach(f => {
      if (f.bounds) {
        const [minLat, minLng, maxLat, maxLng] = f.bounds;
        if (minLat < layerMinLat) layerMinLat = minLat;
        if (minLng < layerMinLng) layerMinLng = minLng;
        if (maxLat > layerMaxLat) layerMaxLat = maxLat;
        if (maxLng > layerMaxLng) layerMaxLng = maxLng;
        hasLayerCoords = true;
      }
    });
    
    const layerBounds: [number, number, number, number] | undefined = hasLayerCoords
      ? [layerMinLat, layerMinLng, layerMaxLat, layerMaxLng]
      : undefined;
      
    layers.push({
      id: layerId,
      name: layerName,
      fileName,
      fileSize,
      features,
      visible: true,
      color,
      bounds: layerBounds
    });
  });
  
  return layers;
}

<<<<<<< HEAD
export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiGeometry' | 'GroundOverlay' | 'Unknown';
=======
export type GeometryType = 'Point' | 'LineString' | 'Polygon' | 'MultiGeometry' | 'Unknown';
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1

export interface FeatureStyle {
  color?: string;       // Hex color #RRGGBB
  opacity?: number;     // 0 to 1
  fillColor?: string;   // Hex color #RRGGBB
  fillOpacity?: number; // 0 to 1
  weight?: number;      // Line width
  iconUrl?: string;     // URL to custom icon (can be blob URL)
}

export interface KmlFeature {
  id: string;
  name: string;
  description: string;
  geometryType: GeometryType;
  // Leaflet uses [lat, lng] for coordinates.
  // Point: [lat, lng]
  // LineString: [lat, lng][]
  // Polygon: [lat, lng][][] (first array is outer ring, subsequent are holes)
  // MultiGeometry: array of nested geometries
<<<<<<< HEAD
  // GroundOverlay: [[south, west], [north, east]]
=======
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
  coordinates: any; 
  properties: Record<string, string>;
  style?: FeatureStyle;
  bounds?: [number, number, number, number]; // [minLat, minLng, maxLat, maxLng]
}

export interface KmlLayer {
  id: string;
  name: string;
  fileName: string;
  fileSize: string;
  features: KmlFeature[];
  visible: boolean;
  color: string; // Base color representation for the entire layer
<<<<<<< HEAD
  tileUrl?: string; // URL template for custom tile layers
  bounds?: [number, number, number, number]; // Optional bounding box for the entire layer
}

export type BasemapType = 'osm' | 'satellite' | 'light' | 'dark' | 'terrain' | 'none';
=======
}

export type BasemapType = 'osm' | 'satellite' | 'light' | 'dark' | 'terrain';
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1

export interface BasemapOption {
  id: BasemapType;
  name: string;
  url: string;
  attribution: string;
}

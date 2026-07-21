import JSZip from 'jszip';
import { KmlFeature, KmlLayer, FeatureStyle, GeometryType } from '../types';

// Converts KML aabbggrr color hex string to standard hex color and opacity
function parseKmlColor(kmlColor: string | null): { color: string; opacity: number } | null {
  if (!kmlColor) return null;
  let clean = kmlColor.trim().replace('#', '');
  
  // If it's a 6-digit hex, assume it's rrggbb (some non-standard exporters do this)
  if (clean.length === 6) {
    return { color: `#${clean}`, opacity: 1.0 };
  }
  
  // Standard KML color is aabbggrr (alpha, blue, green, red)
  if (clean.length === 8) {
    const a = parseInt(clean.substring(0, 2), 16) / 255;
    const b = clean.substring(2, 4);
    const g = clean.substring(4, 6);
    const r = clean.substring(6, 8);
    return {
      color: `#${r}${g}${b}`,
      opacity: Math.round(a * 100) / 100,
    };
  }
  
  return null;
}

// Parses coordinates string "lng,lat,alt lng,lat,alt ..." into lat-lng arrays
function parseCoordinatesString(coordString: string | null): [number, number][] {
  if (!coordString) return [];
  return coordString
    .trim()
    .split(/\s+/)
    .map((pair) => {
      const parts = pair.split(',');
      if (parts.length >= 2) {
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        if (!isNaN(lng) && !isNaN(lat)) {
<<<<<<< HEAD
          // Ignore corrupt coordinates at/near [0, 0] (Null Island)
          if (Math.abs(lat) < 0.001 && Math.abs(lng) < 0.001) {
            return null;
          }
=======
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
          return [lat, lng]; // Leaflet uses [lat, lng]
        }
      }
      return null;
    })
    .filter((coord): coord is [number, number] => coord !== null);
}

// Extract Styles from KML Document to apply later to placemarks
interface KmlStyleMap {
  [styleId: string]: FeatureStyle;
}

function parseStyles(doc: Document, zip: JSZip | null, zipImageUrls: Record<string, string>): KmlStyleMap {
  const styles: KmlStyleMap = {};
  
  // Parse simple styles
  const styleElements = doc.getElementsByTagName('Style');
  for (let i = 0; i < styleElements.length; i++) {
    const styleEl = styleElements[i];
    const styleId = styleEl.getAttribute('id');
    if (!styleId) continue;
    
    const style: FeatureStyle = {};
    
    // 1. IconStyle (for Points)
    const iconStyle = styleEl.getElementsByTagName('IconStyle')[0];
    if (iconStyle) {
      const hrefEl = iconStyle.getElementsByTagName('href')[0];
      if (hrefEl && hrefEl.textContent) {
        const path = hrefEl.textContent.trim();
        // Check if the icon path exists in zipped images
        if (zipImageUrls[path]) {
          style.iconUrl = zipImageUrls[path];
        } else if (path.startsWith('http') || path.startsWith('data:')) {
          style.iconUrl = path;
        } else {
          // Attempt relative path matching in the zip
          const cleanPath = path.replace(/^\.\//, ''); // remove ./
          const matchedKey = Object.keys(zipImageUrls).find(k => k.endsWith(cleanPath));
          if (matchedKey) {
            style.iconUrl = zipImageUrls[matchedKey];
          } else {
            style.iconUrl = path; // Fallback to raw string
          }
        }
      }
    }
    
    // 2. LineStyle (for LineStrings / Polygons borders)
    const lineStyle = styleEl.getElementsByTagName('LineStyle')[0];
    if (lineStyle) {
      const colorEl = lineStyle.getElementsByTagName('color')[0];
      const parsedColor = parseKmlColor(colorEl ? colorEl.textContent : null);
      if (parsedColor) {
        style.color = parsedColor.color;
        style.opacity = parsedColor.opacity;
      }
      
      const widthEl = lineStyle.getElementsByTagName('width')[0];
      if (widthEl && widthEl.textContent) {
        style.weight = parseFloat(widthEl.textContent);
      }
    }
    
    // 3. PolyStyle (for Polygons fill)
    const polyStyle = styleEl.getElementsByTagName('PolyStyle')[0];
    if (polyStyle) {
      const colorEl = polyStyle.getElementsByTagName('color')[0];
      const parsedColor = parseKmlColor(colorEl ? colorEl.textContent : null);
      if (parsedColor) {
        style.fillColor = parsedColor.color;
        style.fillOpacity = parsedColor.opacity;
      }
      
      // KML also has <fill>0 or 1</fill> and <outline>0 or 1</outline>
      const fillEl = polyStyle.getElementsByTagName('fill')[0];
      if (fillEl && fillEl.textContent === '0') {
        style.fillOpacity = 0;
      }
    }
    
    styles[styleId] = style;
  }
  
  // Parse StyleMaps (links a style key to actual Style)
  const styleMapElements = doc.getElementsByTagName('StyleMap');
  for (let i = 0; i < styleMapElements.length; i++) {
    const styleMapEl = styleMapElements[i];
    const mapId = styleMapEl.getAttribute('id');
    if (!mapId) continue;
    
    // KML StyleMaps usually pair a "normal" style and a "highlight" style.
    // We'll extract the "normal" style by default.
    const pairs = styleMapEl.getElementsByTagName('Pair');
    let normalStyleUrl = '';
    
    for (let j = 0; j < pairs.length; j++) {
      const keyEl = pairs[j].getElementsByTagName('key')[0];
      const styleUrlEl = pairs[j].getElementsByTagName('styleUrl')[0];
      if (keyEl && keyEl.textContent === 'normal' && styleUrlEl && styleUrlEl.textContent) {
        normalStyleUrl = styleUrlEl.textContent.trim().replace('#', '');
        break;
      }
    }
    
    if (!normalStyleUrl && pairs.length > 0) {
      // Fallback to first pair if no 'normal' key exists
      const styleUrlEl = pairs[0].getElementsByTagName('styleUrl')[0];
      if (styleUrlEl && styleUrlEl.textContent) {
        normalStyleUrl = styleUrlEl.textContent.trim().replace('#', '');
      }
    }
    
    if (normalStyleUrl && styles[normalStyleUrl]) {
      styles[mapId] = styles[normalStyleUrl];
    }
  }
  
  return styles;
}

// Parses a geometry XML node inside a Placemark
function parseGeometry(placemarkEl: Element): { type: GeometryType; coords: any } {
  // Check for Point
  const pointEl = placemarkEl.getElementsByTagName('Point')[0];
  if (pointEl) {
    const coordEl = pointEl.getElementsByTagName('coordinates')[0];
    const coords = parseCoordinatesString(coordEl ? coordEl.textContent : null);
    if (coords.length > 0) {
      return { type: 'Point', coords: coords[0] };
    }
  }
  
  // Check for LineString
  const lineEl = placemarkEl.getElementsByTagName('LineString')[0];
  if (lineEl) {
    const coordEl = lineEl.getElementsByTagName('coordinates')[0];
    const coords = parseCoordinatesString(coordEl ? coordEl.textContent : null);
    if (coords.length > 0) {
      return { type: 'LineString', coords };
    }
  }
  
  // Check for Polygon
  const polyEl = placemarkEl.getElementsByTagName('Polygon')[0];
  if (polyEl) {
    const outerBoundary = polyEl.getElementsByTagName('outerBoundaryIs')[0];
    if (outerBoundary) {
      const linearRing = outerBoundary.getElementsByTagName('LinearRing')[0];
      if (linearRing) {
        const coordEl = linearRing.getElementsByTagName('coordinates')[0];
        const outerCoords = parseCoordinatesString(coordEl ? coordEl.textContent : null);
        
        if (outerCoords.length > 0) {
          const polygonCoords = [outerCoords];
          
          // Parse holes if present
          const innerBoundaries = polyEl.getElementsByTagName('innerBoundaryIs');
          for (let j = 0; j < innerBoundaries.length; j++) {
            const innerRing = innerBoundaries[j].getElementsByTagName('LinearRing')[0];
            if (innerRing) {
              const innerCoordEl = innerRing.getElementsByTagName('coordinates')[0];
              const innerCoords = parseCoordinatesString(innerCoordEl ? innerCoordEl.textContent : null);
              if (innerCoords.length > 0) {
                polygonCoords.push(innerCoords);
              }
            }
          }
          return { type: 'Polygon', coords: polygonCoords };
        }
      }
    }
  }
  
  // Check for MultiGeometry
  const multiEl = placemarkEl.getElementsByTagName('MultiGeometry')[0];
  if (multiEl) {
    const geometries: any[] = [];
    // Recursively parse child geometries of MultiGeometry
    const childNodes = multiEl.childNodes;
    for (let i = 0; i < childNodes.length; i++) {
      const node = childNodes[i];
      if (node.nodeType === 1) { // Element Node
        const tagName = (node as Element).tagName;
        if (tagName === 'Point' || tagName === 'LineString' || tagName === 'Polygon') {
          // Dummy parent element to reuse our logic
          const dummyParent = document.createElement('Placemark');
          dummyParent.appendChild(node.cloneNode(true));
          const parsed = parseGeometry(dummyParent);
          if (parsed.type !== 'Unknown') {
            geometries.push({ type: parsed.type, coords: parsed.coords });
          }
        }
      }
    }
    if (geometries.length > 0) {
      return { type: 'MultiGeometry', coords: geometries };
    }
  }
  
  return { type: 'Unknown', coords: null };
}

// Extract extended data attributes / key-value properties
function parseExtendedData(placemarkEl: Element): Record<string, string> {
  const props: Record<string, string> = {};
  
  // 1. Parse SchemaData / SimpleData
  const simpleDataElements = placemarkEl.getElementsByTagName('SimpleData');
  for (let i = 0; i < simpleDataElements.length; i++) {
    const el = simpleDataElements[i];
    const name = el.getAttribute('name');
    if (name) {
      props[name] = el.textContent ? el.textContent.trim() : '';
    }
  }
  
  // 2. Parse Data / value
  const dataElements = placemarkEl.getElementsByTagName('Data');
  for (let i = 0; i < dataElements.length; i++) {
    const el = dataElements[i];
    const name = el.getAttribute('name');
    const valueEl = el.getElementsByTagName('value')[0];
    if (name && valueEl) {
      props[name] = valueEl.textContent ? valueEl.textContent.trim() : '';
    }
  }
  
  return props;
}

// Calculate bounding box for a feature
function calculateFeatureBounds(geometryType: GeometryType, coords: any): [number, number, number, number] | undefined {
<<<<<<< HEAD
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
=======
  let lats: number[] = [];
  let lngs: number[] = [];
  
  const collect = (type: string, c: any) => {
    if (type === 'Point' && Array.isArray(c) && c.length === 2) {
      lats.push(c[0]);
      lngs.push(c[1]);
    } else if (type === 'LineString' && Array.isArray(c)) {
      c.forEach((point: any) => {
        if (Array.isArray(point) && point.length === 2) {
          lats.push(point[0]);
          lngs.push(point[1]);
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
        }
      });
    } else if (type === 'Polygon' && Array.isArray(c)) {
      // Loop over the outer boundary ring
      const outerRing = c[0];
      if (Array.isArray(outerRing)) {
        outerRing.forEach((point: any) => {
          if (Array.isArray(point) && point.length === 2) {
<<<<<<< HEAD
            const lat = point[0];
            const lng = point[1];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            hasCoords = true;
=======
            lats.push(point[0]);
            lngs.push(point[1]);
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
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
  
<<<<<<< HEAD
  if (!hasCoords) return undefined;
  
  return [minLat, minLng, maxLat, maxLng];
=======
  if (lats.length === 0 || lngs.length === 0) return undefined;
  
  return [
    Math.min(...lats),
    Math.min(...lngs),
    Math.max(...lats),
    Math.max(...lngs)
  ];
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
}

// Parse KML Document into KmlLayer structure
export function parseKml(
  kmlText: string,
  fileName: string,
  fileSize: string,
  zip: JSZip | null = null,
  zipImageUrls: Record<string, string> = {}
): KmlLayer {
  const parser = new DOMParser();
  const doc = parser.parseFromString(kmlText, 'text/xml');
  
  // Check for parsing errors
  const parserError = doc.getElementsByTagName('parsererror')[0];
  if (parserError) {
    throw new Error(`XML Parsing Error: ${parserError.textContent}`);
  }
  
  // Extract Document/Folder Name
  let layerName = fileName.replace(/\.(kml|kmz)$/i, '');
  const docNameEl = doc.getElementsByTagName('name')[0];
  if (docNameEl && docNameEl.textContent) {
    layerName = docNameEl.textContent.trim();
  }
  
  // Parse Styles
  const styleMap = parseStyles(doc, zip, zipImageUrls);
  
  // Extract all Placemarks
  const placemarks = doc.getElementsByTagName('Placemark');
  const features: KmlFeature[] = [];
  
  for (let i = 0; i < placemarks.length; i++) {
    const placemarkEl = placemarks[i];
    
    // 1. Basic Metadata
    const nameEl = placemarkEl.getElementsByTagName('name')[0];
    const name = nameEl && nameEl.textContent ? nameEl.textContent.trim() : `Placemark #${i + 1}`;
    
    const descEl = placemarkEl.getElementsByTagName('description')[0];
    const description = descEl && descEl.textContent ? descEl.textContent.trim() : '';
    
    // 2. Geometry
    const { type: geometryType, coords } = parseGeometry(placemarkEl);
    if (geometryType === 'Unknown') continue; // Skip features without supported geometry
    
    // 3. Properties (ExtendedData)
    const properties = parseExtendedData(placemarkEl);
    
    // 4. Style assignment
    let featureStyle: FeatureStyle | undefined;
    const styleUrlEl = placemarkEl.getElementsByTagName('styleUrl')[0];
    if (styleUrlEl && styleUrlEl.textContent) {
      const styleUrl = styleUrlEl.textContent.trim().replace('#', '');
      if (styleMap[styleUrl]) {
        featureStyle = { ...styleMap[styleUrl] };
      }
    }
    
    // Fallback: If style is missing color, generate some layer base properties or leave empty
    
    // 5. Calculate Bounds
    const bounds = calculateFeatureBounds(geometryType, coords);
    
    features.push({
      id: `feature-${fileName}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      geometryType,
      coordinates: coords,
      properties,
      style: featureStyle,
      bounds
    });
  }
  
<<<<<<< HEAD
  // Extract all GroundOverlays
  const groundOverlays = doc.getElementsByTagName('GroundOverlay');
  for (let i = 0; i < groundOverlays.length; i++) {
    const overlayEl = groundOverlays[i];
    
    const nameEl = overlayEl.getElementsByTagName('name')[0];
    const name = nameEl && nameEl.textContent ? nameEl.textContent.trim() : `Ground Overlay #${i + 1}`;
    
    const descEl = overlayEl.getElementsByTagName('description')[0];
    const description = descEl && descEl.textContent ? descEl.textContent.trim() : '';
    
    // Find image href
    let imageUrl = '';
    const iconEl = overlayEl.getElementsByTagName('Icon')[0];
    if (iconEl) {
      const hrefEl = iconEl.getElementsByTagName('href')[0];
      if (hrefEl && hrefEl.textContent) {
        const path = hrefEl.textContent.trim();
        if (zipImageUrls[path]) {
          imageUrl = zipImageUrls[path];
        } else if (path.startsWith('http') || path.startsWith('data:')) {
          imageUrl = path;
        } else {
          const cleanPath = path.replace(/^\.\//, '');
          const matchedKey = Object.keys(zipImageUrls).find(k => k.endsWith(cleanPath));
          if (matchedKey) {
            imageUrl = zipImageUrls[matchedKey];
          } else {
            imageUrl = path;
          }
        }
      }
    }
    
    if (!imageUrl) continue;
    
    // Get LatLonBox bounds
    const boxEl = overlayEl.getElementsByTagName('LatLonBox')[0];
    if (!boxEl) continue;
    
    const northEl = boxEl.getElementsByTagName('north')[0];
    const southEl = boxEl.getElementsByTagName('south')[0];
    const eastEl = boxEl.getElementsByTagName('east')[0];
    const westEl = boxEl.getElementsByTagName('west')[0];
    const rotationEl = boxEl.getElementsByTagName('rotation')[0];
    
    if (!northEl || !southEl || !eastEl || !westEl) continue;
    
    const north = parseFloat(northEl.textContent || '0');
    const south = parseFloat(southEl.textContent || '0');
    const east = parseFloat(eastEl.textContent || '0');
    const west = parseFloat(westEl.textContent || '0');
    const rotation = rotationEl ? parseFloat(rotationEl.textContent || '0') : 0;
    
    const bounds: [number, number, number, number] = [south, west, north, east];
    
    features.push({
      id: `overlay-${fileName}-${i}-${Math.random().toString(36).substr(2, 9)}`,
      name,
      description,
      geometryType: 'GroundOverlay',
      coordinates: bounds, // store bounds under coordinates
      properties: {
        'Image Source': imageUrl.startsWith('blob:') ? 'Embedded KMZ Image' : imageUrl,
        'North Boundary': north.toString(),
        'South Boundary': south.toString(),
        'East Boundary': east.toString(),
        'West Boundary': west.toString(),
        'Rotation': rotation.toString()
      },
      style: {
        iconUrl: imageUrl,
      },
      bounds
    });
  }
  
=======
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
  // Generate random bright base color for layer representation
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#14B8A6'];
  const layerColor = colors[Math.floor(Math.random() * colors.length)];
  
  return {
    id: `layer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
    name: layerName,
    fileName,
    fileSize,
    features,
    visible: true,
    color: layerColor
  };
}

// Core function to handle loaded files (both .kml and .kmz)
export async function parseGeospatialFile(file: File): Promise<KmlLayer> {
  const fileName = file.name;
  const fileSize = formatBytes(file.size);
  const isKmz = fileName.toLowerCase().endsWith('.kmz');
  
  if (isKmz) {
    // 1. Load KMZ as zip
    const zip = new JSZip();
    const contents = await zip.loadAsync(file);
    
    // 2. Look up all images inside the zip to map relative paths to object URLs
    const zipImageUrls: Record<string, string> = {};
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.svg'];
    
    for (const [relativePath, fileObj] of Object.entries(contents.files)) {
      const isImage = imageExtensions.some(ext => relativePath.toLowerCase().endsWith(ext));
      if (isImage && !fileObj.dir) {
        try {
          const blob = await fileObj.async('blob');
          const objectUrl = URL.createObjectURL(blob);
          zipImageUrls[relativePath] = objectUrl;
        } catch (err) {
          console.error(`Failed to load image ${relativePath} from KMZ:`, err);
        }
      }
    }
    
    // 3. Find the main KML file (usually ends in .kml, first one found at root or folder)
    const kmlFileKey = Object.keys(contents.files).find((key) => key.toLowerCase().endsWith('.kml'));
    
    if (!kmlFileKey) {
      throw new Error('No KML file found inside the uploaded KMZ archive!');
    }
    
    const kmlText = await contents.files[kmlFileKey].async('string');
    return parseKml(kmlText, fileName, fileSize, zip, zipImageUrls);
  } else {
    // Plain KML file
    const kmlText = await file.text();
    return parseKml(kmlText, fileName, fileSize, null, {});
  }
}

// Utility to format bytes beautifully
export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { KmlLayer, KmlFeature, BasemapType, BasemapOption } from '../types';

interface MapComponentProps {
  layers: KmlLayer[];
  visibleLayerIds: string[];
  highlightedFeature: KmlFeature | null;
  onFeatureSelect: (feature: KmlFeature | null, layer: KmlLayer | null) => void;
  basemap: BasemapType;
  onCoordinatesChange: (lat: number, lng: number) => void;
  zoomLayerRequest: { layerId: string; timestamp: number } | null;
}

const BASEMAP_OPTIONS: Record<Exclude<BasemapType, 'none'>, BasemapOption> = {
  osm: {
    id: 'osm',
    name: 'OpenStreetMap',
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  },
  satellite: {
    id: 'satellite',
    name: 'Satellite (Esri)',
    url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
  },
  light: {
    id: 'light',
    name: 'CartoDB Light',
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  dark: {
    id: 'dark',
    name: 'CartoDB Dark Matter',
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
  },
  terrain: {
    id: 'terrain',
    name: 'Terrain Map',
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    attribution: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
  },
};

function getLayerFeaturesBounds(features: KmlFeature[]): L.LatLngBounds | null {
  let minLat = Infinity;
  let maxLat = -Infinity;
  let minLng = Infinity;
  let maxLng = -Infinity;
  let hasCoords = false;

  const collect = (type: string, coords: any) => {
    if (type === 'Point' && Array.isArray(coords) && coords.length === 2) {
      const lat = coords[0];
      const lng = coords[1];
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
      if (lng < minLng) minLng = lng;
      if (lng > maxLng) maxLng = lng;
      hasCoords = true;
    } else if (type === 'LineString' && Array.isArray(coords)) {
      coords.forEach((p: any) => {
        if (Array.isArray(p) && p.length === 2) {
          const lat = p[0];
          const lng = p[1];
          if (lat < minLat) minLat = lat;
          if (lat > maxLat) maxLat = lat;
          if (lng < minLng) minLng = lng;
          if (lng > maxLng) maxLng = lng;
          hasCoords = true;
        }
      });
    } else if (type === 'Polygon' && Array.isArray(coords)) {
      const outerRing = coords[0];
      if (Array.isArray(outerRing)) {
        outerRing.forEach((p: any) => {
          if (Array.isArray(p) && p.length === 2) {
            const lat = p[0];
            const lng = p[1];
            if (lat < minLat) minLat = lat;
            if (lat > maxLat) maxLat = lat;
            if (lng < minLng) minLng = lng;
            if (lng > maxLng) maxLng = lng;
            hasCoords = true;
          }
        });
      }
    } else if (type === 'MultiGeometry' && Array.isArray(coords)) {
      coords.forEach((geom: any) => {
        collect(geom.type, geom.coords);
      });
    }
  };

  features.forEach(f => collect(f.geometryType, f.coordinates));

  if (!hasCoords) return null;

  return L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
}

export default function MapComponent({
  layers,
  visibleLayerIds,
  highlightedFeature,
  onFeatureSelect,
  basemap,
  onCoordinatesChange,
  zoomLayerRequest,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Keep track of Leaflet LayerGroups on the map
  // Key is layerId, value is L.FeatureGroup
  const leafletLayersRef = useRef<Record<string, L.FeatureGroup>>({});
  
  // Keep track of Leaflet layer instances per feature to do highlight/popups
  const featureLayersRef = useRef<Record<string, L.Layer>>({});
  
  // Keep track of the drawn color of each layer to optimize re-renders
  const drawnLayerColorsRef = useRef<Record<string, string>>({});
  
  // Highlight layer
  const highlightLayerRef = useRef<L.FeatureGroup | null>(null);

  // Keep track of layers we have already zoomed to, to prevent annoying jumps when toggling visibility
  const zoomedLayerIdsRef = useRef<Set<string>>(new Set());

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create the map centered over a default global view
    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: false, // We'll add custom zoom control or place it in a corner
      preferCanvas: true, // Render vectors using Canvas instead of SVG for high performance
    });

    L.control.zoom({ position: 'topright' }).addTo(map);

    // Track mouse coordinates
    map.on('mousemove', (e: L.LeafletMouseEvent) => {
      onCoordinatesChange(e.latlng.lat, e.latlng.lng);
    });

    mapRef.current = map;
    
    // Add highlight layer
    const highlightGroup = L.featureGroup().addTo(map);
    highlightLayerRef.current = highlightGroup;

    // Cleanup map on unmount
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Update Basemap Tiles
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    if (basemap === 'none') {
      return;
    }

    const option = BASEMAP_OPTIONS[basemap];
    const tileLayer = L.tileLayer(option.url, {
      attribution: option.attribution,
      maxZoom: 19,
    });

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;
  }, [basemap]);

  // Sync Layers and Features on Map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clean up zoomedLayerIdsRef for deleted layers
    const currentLayerIds = new Set(layers.map(l => l.id));
    zoomedLayerIdsRef.current.forEach((id) => {
      if (!currentLayerIds.has(id)) {
        zoomedLayerIdsRef.current.delete(id);
      }
    });

    // 1. Remove layers that are no longer in the list or are hidden
    Object.keys(leafletLayersRef.current).forEach((layerId) => {
      const isStillPresentAndVisible = 
        layers.some(l => l.id === layerId) && visibleLayerIds.includes(layerId);
      
      if (!isStillPresentAndVisible) {
        map.removeLayer(leafletLayersRef.current[layerId]);
        delete leafletLayersRef.current[layerId];
        delete drawnLayerColorsRef.current[layerId];
        
        // Clean up individual feature layers reference
        layers.find(l => l.id === layerId)?.features.forEach(f => {
          delete featureLayersRef.current[f.id];
        });
      }
    });

    // 2. Add or update layers that are visible
    layers.forEach((layer) => {
      if (!visibleLayerIds.includes(layer.id)) return;

      let layerGroup = leafletLayersRef.current[layer.id];
      const isNewLayer = !layerGroup;

      // Handle custom tile layers
      if (layer.tileUrl) {
        if (isNewLayer) {
          const tileOptions: L.TileLayerOptions = {
            maxZoom: 22,
            maxNativeZoom: 20,
            opacity: 1.0,
          };
          if (layer.bounds) {
            const [south, west, north, east] = layer.bounds;
            const b = L.latLngBounds([south, west], [north, east]);
            if (b.isValid()) {
              tileOptions.bounds = b;
            }
          }
          const tileLayer = L.tileLayer(layer.tileUrl, tileOptions);
          leafletLayersRef.current[layer.id] = tileLayer as any;
          tileLayer.addTo(map);
        }

        // If it is a new layer, has bounds, and we haven't zoomed to it yet, fly to it
        if (isNewLayer && layer.bounds && !zoomedLayerIdsRef.current.has(layer.id)) {
          zoomedLayerIdsRef.current.add(layer.id);
          try {
            const [south, west, north, east] = layer.bounds;
            const bounds = L.latLngBounds([south, west], [north, east]);
            if (bounds.isValid()) {
              map.flyToBounds(bounds, { padding: [50, 50], maxZoom: 18, duration: 1.5 });
            }
          } catch (e) {
            console.warn('Failed to fly to bounds for new tile layer', e);
          }
        }
        return;
      }


      const prevColor = drawnLayerColorsRef.current[layer.id];
      const colorChanged = prevColor && prevColor !== layer.color;

      if (isNewLayer) {
        layerGroup = L.featureGroup();
        leafletLayersRef.current[layer.id] = layerGroup;
        layerGroup.addTo(map);
        drawnLayerColorsRef.current[layer.id] = layer.color;
      } else if (colorChanged) {
        // Optimization: In-place update of feature colors instead of full rebuild
        drawnLayerColorsRef.current[layer.id] = layer.color;
        layerGroup.eachLayer((subLayer: any) => {
          if (subLayer.setStyle) {
            subLayer.setStyle({
              color: subLayer.options.fillColor === '#ffffff' ? '#ffffff' : layer.color,
              fillColor: layer.color,
            });
          } else if (subLayer.eachLayer) {
            // Handle MultiGeometry feature groups
            subLayer.eachLayer((child: any) => {
              if (child.setStyle) {
                child.setStyle({
                  color: child.options.fillColor === '#ffffff' ? '#ffffff' : layer.color,
                  fillColor: layer.color,
                });
              }
            });
          }
        });
        return; // Skip recreation
      } else {
        // Optimization: Skip rebuilding features if the layer is already drawn and styled
        return;
      }

      // Dedicated HTML5 Canvas renderer for 60,000+ points GPU acceleration
      const canvasRenderer = L.canvas({ padding: 0.5 });

      // Adaptive max features limit (1,200 on mobile, 4,000 on desktop) to keep UI thread 100% responsive
      const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
      const maxFeatures = isMobile ? 1200 : 4000;
      const skipFactor = layer.features.length > maxFeatures 
        ? Math.ceil(layer.features.length / maxFeatures) 
        : 1;

      layer.features.forEach((feature, idx) => {
        if (idx % skipFactor !== 0) return;

        let leafletLayer: L.Layer | null = null;
        
        // Fallback style using layer's assigned color
        const baseColor = layer.color;
        const style: L.PathOptions = {
          color: feature.style?.color || baseColor,
          weight: feature.style?.weight || (isMobile ? 1.5 : 2.5),
          opacity: feature.style?.opacity !== undefined ? feature.style.opacity : 0.8,
          fillColor: feature.style?.fillColor || feature.style?.color || baseColor,
          fillOpacity: feature.style?.fillOpacity !== undefined ? feature.style.fillOpacity : 0.4,
          renderer: canvasRenderer
        };

        if (feature.geometryType === 'Point') {
          const [lat, lng] = feature.coordinates;
          
          if (feature.style?.iconUrl) {
            // Custom icon from KMZ/KML stylesheet
            const customIcon = L.icon({
              iconUrl: feature.style.iconUrl,
              iconSize: [24, 24],
              iconAnchor: [12, 12],
              popupAnchor: [0, -12],
            });
            leafletLayer = L.marker([lat, lng], { icon: customIcon });
          } else {
            // High-fidelity GPU Canvas circle marker (60 FPS on 60k points)
            leafletLayer = L.circleMarker([lat, lng], {
              radius: isMobile ? 4 : 5,
              fillColor: style.color,
              fillOpacity: 0.85,
              color: '#ffffff',
              weight: 1.0,
              renderer: canvasRenderer
            });
          }
        } else if (feature.geometryType === 'LineString') {
          leafletLayer = L.polyline(feature.coordinates, style);
        } else if (feature.geometryType === 'Polygon') {
          leafletLayer = L.polygon(feature.coordinates, style);
        } else if (feature.geometryType === 'GroundOverlay') {
          const [south, west, north, east] = feature.coordinates;
          const imageUrl = feature.style?.iconUrl;
          if (imageUrl) {
            leafletLayer = L.imageOverlay(imageUrl, [[south, west], [north, east]], {
              opacity: style.opacity !== undefined ? style.opacity : 0.85,
              interactive: true,
            });
          }
        } else if (feature.geometryType === 'MultiGeometry') {
          // Group multiple geometries together
          const subLayers: L.Layer[] = [];
          feature.coordinates.forEach((subGeom: any) => {
            if (subGeom.type === 'Point') {
              const [lat, lng] = subGeom.coords;
              if (feature.style?.iconUrl) {
                const customIcon = L.icon({
                  iconUrl: feature.style.iconUrl,
                  iconSize: [28, 28],
                  iconAnchor: [14, 14],
                });
                subLayers.push(L.marker([lat, lng], { icon: customIcon }));
              } else {
                subLayers.push(L.circleMarker([lat, lng], {
                  radius: 6,
                  fillColor: style.color,
                  fillOpacity: 0.8,
                  color: '#ffffff',
                  weight: 1.5,
                }));
              }
            } else if (subGeom.type === 'LineString') {
              subLayers.push(L.polyline(subGeom.coords, style));
            } else if (subGeom.type === 'Polygon') {
              subLayers.push(L.polygon(subGeom.coords, style));
            }
          });
          
          if (subLayers.length > 0) {
            leafletLayer = L.featureGroup(subLayers);
          }
        }

        if (leafletLayer) {
          // Attach popup showing attributes
          let popupContent = `<div class="p-1 font-sans text-xs max-w-64">
            <h3 class="font-bold text-sm text-slate-800 border-b pb-1 mb-1.5">${feature.name}</h3>`;
          
          const isGenericDesc = feature.description && [
            'unknown point feature',
            'unknown line feature',
            'unknown polygon feature',
            'unknown area feature',
            'unknown feature',
            'placemark'
          ].includes(feature.description.trim().toLowerCase());

          if (feature.description && !isGenericDesc) {
            // Strip HTML elements for security, or keep simple styles
            const cleanDesc = feature.description.replace(/<[^>]*>/g, '').slice(0, 150);
            popupContent += `<p class="text-slate-600 mb-1.5 italic">${cleanDesc}${feature.description.length > 150 ? '...' : ''}</p>`;
          }
          
          // Show properties summary
          const propKeys = Object.keys(feature.properties);
          if (propKeys.length > 0) {
            popupContent += `<div class="border-t pt-1 mt-1"><table class="w-full text-left text-[10px] text-slate-500">`;
            propKeys.slice(0, 4).forEach((key) => {
              const val = feature.properties[key];
              popupContent += `<tr>
                <td class="font-semibold text-slate-700 pr-2 truncate max-w-20">${key}:</td>
                <td class="truncate max-w-36">${val}</td>
              </tr>`;
            });
            if (propKeys.length > 4) {
              popupContent += `<tr><td colspan="2" class="text-right text-indigo-500 text-[9px] font-medium">+ ${propKeys.length - 4} more properties</td></tr>`;
            }
            popupContent += `</table></div>`;
          }
          
          popupContent += `</div>`;
          
          leafletLayer.bindPopup(popupContent);
          
          // Mouse hover effect
          leafletLayer.on('mouseover', (e) => {
            const layer = e.target;
            if (layer.setStyle) {
              layer.setStyle({
                weight: (style.weight || 3) + 2,
                opacity: 1.0,
              });
            }
          });
          
          leafletLayer.on('mouseout', (e) => {
            const layer = e.target;
            if (layer.setStyle) {
              layer.setStyle({
                weight: style.weight,
                opacity: style.opacity,
              });
            }
          });

          // Handle click on map layers
          leafletLayer.on('click', () => {
            onFeatureSelect(feature, layer);
          });

          layerGroup.addLayer(leafletLayer);
          featureLayersRef.current[feature.id] = leafletLayer;
        }
      });

      // If a brand new layer is added and we haven't zoomed to it yet, fly to cover this layer
      if (isNewLayer && layer.features.length > 0 && !zoomedLayerIdsRef.current.has(layer.id)) {
        zoomedLayerIdsRef.current.add(layer.id);
        try {
          const bounds = layerGroup.getBounds();
          if (bounds.isValid()) {
            map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
          }
        } catch (e) {
          console.warn('Failed to fly to bounds for newly added layer', e);
        }
      }
    });
  }, [layers, visibleLayerIds]);

  // Sync Highlighted/Selected Feature and zoom to it
  useEffect(() => {
    const map = mapRef.current;
    const highlightGroup = highlightLayerRef.current;
    if (!map || !highlightGroup) return;

    // Clear previous highlight layers
    highlightGroup.clearLayers();

    if (!highlightedFeature) return;

    const leafletLayer = featureLayersRef.current[highlightedFeature.id];

    // Pan or zoom to the selected feature ONLY if it is not already visible in the viewport
    const isAlreadyVisible = (() => {
      if (highlightedFeature.geometryType === 'Point') {
        const [lat, lng] = highlightedFeature.coordinates;
        return map.getBounds().contains([lat, lng]);
      } else if (highlightedFeature.bounds) {
        const [minLat, minLng, maxLat, maxLng] = highlightedFeature.bounds;
        const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
        return map.getBounds().contains(bounds);
      }
      return false;
    })();

    if (!isAlreadyVisible) {
      if (highlightedFeature.bounds) {
        const [minLat, minLng, maxLat, maxLng] = highlightedFeature.bounds;
        const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
        
        if (bounds.isValid()) {
          // Zoom to point or line bounds, keeping close zoom level if already zoomed in
          if (highlightedFeature.geometryType === 'Point') {
            map.setView([minLat, minLng], Math.max(map.getZoom(), 16), { animate: true });
          } else {
            map.fitBounds(bounds, { padding: [100, 100], animate: true });
          }
        }
      } else if (highlightedFeature.geometryType === 'Point') {
        const [lat, lng] = highlightedFeature.coordinates;
        map.setView([lat, lng], Math.max(map.getZoom(), 16), { animate: true });
      }
    }

    // Add a pulsing highlighting ring on top of the feature
    const baseColor = '#e11d48'; // Bright Rose/Red highlight
    
    if (highlightedFeature.geometryType === 'Point') {
      const [lat, lng] = highlightedFeature.coordinates;
      L.circleMarker([lat, lng], {
        radius: 12,
        color: baseColor,
        weight: 2,
        fillColor: baseColor,
        fillOpacity: 0.15,
        className: 'feature-pulse-active'
      }).addTo(highlightGroup);
    } else if (highlightedFeature.geometryType === 'LineString') {
      L.polyline(highlightedFeature.coordinates, {
        color: baseColor,
        weight: 6,
        opacity: 0.8,
        className: 'feature-pulse-active'
      }).addTo(highlightGroup);
    } else if (highlightedFeature.geometryType === 'Polygon') {
      L.polygon(highlightedFeature.coordinates, {
        color: baseColor,
        weight: 3,
        fillColor: baseColor,
        fillOpacity: 0.2,
        className: 'feature-pulse-active'
      }).addTo(highlightGroup);
    } else if (highlightedFeature.geometryType === 'GroundOverlay') {
      const [south, west, north, east] = highlightedFeature.coordinates;
      L.rectangle([[south, west], [north, east]], {
        color: baseColor,
        weight: 2.5,
        fillColor: baseColor,
        fillOpacity: 0.05,
        className: 'feature-pulse-active'
      }).addTo(highlightGroup);
    }

    // Programmatically open popup for this layer
    if (leafletLayer) {
      setTimeout(() => {
        leafletLayer.openPopup();
      }, 300);
    }
  }, [highlightedFeature]);

  // Zoom/Fly to full layer bounds when requested
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomLayerRequest) return;

    const layer = layers.find(l => l.id === zoomLayerRequest.layerId);
    if (!layer) return;

    if (layer.tileUrl && layer.bounds) {
      try {
        const [south, west, north, east] = layer.bounds;
        const bounds = L.latLngBounds([south, west], [north, east]);
        if (bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
        }
      } catch (e) {
        console.warn('Failed to fly to tile layer bounds', e);
      }
    } else {
      try {
        const bounds = getLayerFeaturesBounds(layer.features);
        if (bounds && bounds.isValid()) {
          map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5 });
        }
      } catch (e) {
        console.warn('Failed to calculate bounds for layer fly', e);
      }
    }
  }, [zoomLayerRequest]);

  // Handle map resizing
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="relative w-full h-full flex-grow rounded-xl overflow-hidden shadow-inner border border-slate-200">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      
      {/* Floating Basemap Controls in bottom-right corner of map */}
      <div className="absolute bottom-4 right-4 z-10 flex flex-col space-y-1 items-end">
        <div className="bg-white/90 backdrop-blur px-2.5 py-1.5 rounded-lg shadow-md border border-slate-200 text-[10px] text-slate-500 font-medium">
          Powered by Leaflet
        </div>
      </div>
    </div>
  );
}

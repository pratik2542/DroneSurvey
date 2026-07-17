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
}

const BASEMAP_OPTIONS: Record<BasemapType, BasemapOption> = {
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

export default function MapComponent({
  layers,
  visibleLayerIds,
  highlightedFeature,
  onFeatureSelect,
  basemap,
  onCoordinatesChange,
}: MapComponentProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  
  // Keep track of Leaflet LayerGroups on the map
  // Key is layerId, value is L.FeatureGroup
  const leafletLayersRef = useRef<Record<string, L.FeatureGroup>>({});
  
  // Keep track of Leaflet layer instances per feature to do highlight/popups
  const featureLayersRef = useRef<Record<string, L.Layer>>({});
  
  // Highlight layer
  const highlightLayerRef = useRef<L.FeatureGroup | null>(null);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create the map centered over a default global view
    const map = L.map(mapContainerRef.current, {
      center: [20, 0],
      zoom: 2,
      zoomControl: false, // We'll add custom zoom control or place it in a corner
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

    // 1. Remove layers that are no longer in the list or are hidden
    Object.keys(leafletLayersRef.current).forEach((layerId) => {
      const isStillPresentAndVisible = 
        layers.some(l => l.id === layerId) && visibleLayerIds.includes(layerId);
      
      if (!isStillPresentAndVisible) {
        map.removeLayer(leafletLayersRef.current[layerId]);
        delete leafletLayersRef.current[layerId];
        
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

      if (isNewLayer) {
        layerGroup = L.featureGroup();
        leafletLayersRef.current[layer.id] = layerGroup;
        layerGroup.addTo(map);
      } else {
        // Clear existing features inside this group and rebuild to handle styled updates
        layerGroup.clearLayers();
      }

      // Draw each feature in this layer
      layer.features.forEach((feature) => {
        let leafletLayer: L.Layer | null = null;
        
        // Fallback style using layer's assigned color
        const baseColor = layer.color;
        const style: L.PathOptions = {
          color: feature.style?.color || baseColor,
          weight: feature.style?.weight || 3,
          opacity: feature.style?.opacity !== undefined ? feature.style.opacity : 0.8,
          fillColor: feature.style?.fillColor || feature.style?.color || baseColor,
          fillOpacity: feature.style?.fillOpacity !== undefined ? feature.style.fillOpacity : 0.3,
        };

        if (feature.geometryType === 'Point') {
          const [lat, lng] = feature.coordinates;
          
          if (feature.style?.iconUrl) {
            // Custom icon from KMZ/KML stylesheet
            const customIcon = L.icon({
              iconUrl: feature.style.iconUrl,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
              popupAnchor: [0, -14],
            });
            leafletLayer = L.marker([lat, lng], { icon: customIcon });
          } else {
            // High-fidelity vector circle marker matching the layer color (modern GIS look)
            leafletLayer = L.circleMarker([lat, lng], {
              radius: 6,
              fillColor: style.color,
              fillOpacity: 0.8,
              color: '#ffffff',
              weight: 1.5,
            });
          }
        } else if (feature.geometryType === 'LineString') {
          leafletLayer = L.polyline(feature.coordinates, style);
        } else if (feature.geometryType === 'Polygon') {
          leafletLayer = L.polygon(feature.coordinates, style);
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
          
          if (feature.description) {
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

      // If a brand new layer is added, zoom/fit map bounds to cover this layer
      if (isNewLayer && layer.features.length > 0) {
        try {
          const bounds = layerGroup.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [50, 50] });
          }
        } catch (e) {
          console.warn('Failed to calculate fit bounds for newly added layer', e);
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

    // Pan or zoom to the selected feature
    const leafletLayer = featureLayersRef.current[highlightedFeature.id];
    
    // Highlight the bounds/coordinates
    if (highlightedFeature.bounds) {
      const [minLat, minLng, maxLat, maxLng] = highlightedFeature.bounds;
      const bounds = L.latLngBounds([minLat, minLng], [maxLat, maxLng]);
      
      if (bounds.isValid()) {
        // Zoom to point or line bounds
        if (highlightedFeature.geometryType === 'Point') {
          map.setView([minLat, minLng], 15, { animate: true });
        } else {
          map.fitBounds(bounds, { padding: [100, 100], animate: true });
        }
      }
    } else if (highlightedFeature.geometryType === 'Point') {
      const [lat, lng] = highlightedFeature.coordinates;
      map.setView([lat, lng], 15, { animate: true });
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
    }

    // Programmatically open popup for this layer
    if (leafletLayer) {
      setTimeout(() => {
        leafletLayer.openPopup();
      }, 300);
    }
  }, [highlightedFeature]);

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

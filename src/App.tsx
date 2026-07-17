import React, { useState, useRef } from 'react';
import { parseGeospatialFile, parseKml } from './utils/kmlParser';
import { KmlLayer, KmlFeature, BasemapType } from './types';
import MapComponent from './components/MapComponent';
import LayersPanel from './components/LayersPanel';
import FeatureList from './components/FeatureList';
import FeatureDetails from './components/FeatureDetails';
import AttributeTable from './components/AttributeTable';
import { 
  Upload, 
  Map, 
  Info, 
  Layers, 
  Sparkles, 
  FileCode, 
  Globe, 
  Check, 
  AlertCircle,
  HelpCircle
} from 'lucide-react';

const SAMPLE_KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <name>San Francisco Tour Map</name>
    <description>A beautiful geospatial sample tour of famous locations in San Francisco.</description>
    <Style id="landmark-pin">
      <IconStyle>
        <scale>1.1</scale>
      </IconStyle>
    </Style>
    <Style id="route-line">
      <LineStyle>
        <color>ffdb2722</color> <!-- custom deep red-orange in aabbggrr -->
        <width>5</width>
      </LineStyle>
    </Style>
    <Style id="park-poly">
      <LineStyle>
        <color>ff059669</color>
        <width>2.5</width>
      </LineStyle>
      <PolyStyle>
        <color>4d059669</color> <!-- Emerald green with ~30% alpha -->
      </PolyStyle>
    </Style>
    
    <Placemark>
      <name>Golden Gate Bridge Vista</name>
      <description>One of the most photographed vistas of the Golden Gate Bridge.</description>
      <styleUrl>#landmark-pin</styleUrl>
      <ExtendedData>
        <Data name="Type"><value>Scenic Lookout</value></Data>
        <Data name="Elevation"><value>45m</value></Data>
        <Data name="Rating"><value>4.9/5</value></Data>
        <Data name="Year Opened"><value>1937</value></Data>
      </ExtendedData>
      <Point>
        <coordinates>-122.4782551,37.8077534,0</coordinates>
      </Point>
    </Placemark>

    <Placemark>
      <name>Alcatraz Island</name>
      <description>Former federal prison home to famous inmates like Al Capone.</description>
      <styleUrl>#landmark-pin</styleUrl>
      <ExtendedData>
        <Data name="Type"><value>Historic Island</value></Data>
        <Data name="Accessibility"><value>Ferry Access Only</value></Data>
        <Data name="Visitors Per Year"><value>1.4 Million</value></Data>
      </ExtendedData>
      <Point>
        <coordinates>-122.4229555,37.8267273,0</coordinates>
      </Point>
    </Placemark>

    <Placemark>
      <name>Lombard Street Crooked Route</name>
      <description>The famous crooked street route with 8 sharp hairpin turns.</description>
      <styleUrl>#route-line</styleUrl>
      <ExtendedData>
        <Data name="Feature Type"><value>Road Route</value></Data>
        <Data name="Speed Limit"><value>5 mph</value></Data>
        <Data name="Number of Turns"><value>8</value></Data>
      </ExtendedData>
      <LineString>
        <coordinates>
          -122.419139,37.802102,0
          -122.419262,37.802111,0
          -122.419332,37.802058,0
          -122.419412,37.802083,0
          -122.419488,37.802028,0
          -122.419579,37.802061,0
          -122.419643,37.802008,0
          -122.419745,37.802035,0
        </coordinates>
      </LineString>
    </Placemark>

    <Placemark>
      <name>Golden Gate Park Region</name>
      <description>A beautiful public park spanning over 1,000 acres, featuring museums, lakes, and botanical gardens.</description>
      <styleUrl>#park-poly</styleUrl>
      <ExtendedData>
        <Data name="Category"><value>Urban Park</value></Data>
        <Data name="Acreage"><value>1,017 Acres</value></Data>
        <Data name="Established"><value>1870</value></Data>
        <Data name="Annual Budget"><value>$20 Million</value></Data>
      </ExtendedData>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              -122.511111,37.769444,0
              -122.451944,37.772500,0
              -122.452778,37.764444,0
              -122.511944,37.761111,0
              -122.511111,37.769444,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>`;

export default function App() {
  const [layers, setLayers] = useState<KmlLayer[]>([]);
  const [visibleLayerIds, setVisibleLayerIds] = useState<string[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  
  const [selectedFeature, setSelectedFeature] = useState<KmlFeature | null>(null);
  const [selectedFeatureLayer, setSelectedFeatureLayer] = useState<KmlLayer | null>(null);
  
  const [basemap, setBasemap] = useState<BasemapType>('osm');
  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number }>({ lat: 0, lng: 0 });
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Computed state for active/selected layer
  const activeLayer = layers.find(l => l.id === selectedLayerId) || null;

  // Handle layer visibility toggle
  const handleToggleLayer = (layerId: string) => {
    setVisibleLayerIds(prev => 
      prev.includes(layerId) ? prev.filter(id => id !== layerId) : [...prev, layerId]
    );
  };

  // Handle Layer Deletion
  const handleDeleteLayer = (layerId: string) => {
    setLayers(prev => prev.filter(l => l.id !== layerId));
    setVisibleLayerIds(prev => prev.filter(id => id !== layerId));
    
    // Clear selections if deleted
    if (selectedLayerId === layerId) {
      setSelectedLayerId(null);
    }
    if (selectedFeatureLayer?.id === layerId) {
      setSelectedFeature(null);
      setSelectedFeatureLayer(null);
    }
  };

  // Handle Layer Rename
  const handleRenameLayer = (layerId: string, newName: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, name: newName } : l));
  };

  // Handle Layer Color Update
  const handleUpdateLayerColor = (layerId: string, color: string) => {
    setLayers(prev => prev.map(l => l.id === layerId ? { ...l, color } : l));
  };

  // Handle Zoom to full Layer bounds
  const handleZoomToLayer = (layer: KmlLayer) => {
    // Map handles zoom automatically when we trigger isNewLayer, 
    // to trigger it programmatically we toggle visibility off and on
    setVisibleLayerIds(prev => prev.filter(id => id !== layer.id));
    setTimeout(() => {
      setVisibleLayerIds(prev => [...prev, layer.id]);
    }, 50);
  };

  // Handle Feature selection (from map, list, or table)
  const handleFeatureSelect = (feature: KmlFeature | null, layer: KmlLayer | null) => {
    setSelectedFeature(feature);
    setSelectedFeatureLayer(layer);
    if (layer) {
      setSelectedLayerId(layer.id);
    }
  };

  // Handle file uploads (kmz, kml)
  const processUploadedFiles = async (files: FileList) => {
    setLoading(true);
    setErrorMsg(null);
    
    let loadedLayersCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (ext !== 'kml' && ext !== 'kmz') {
        setErrorMsg(`Unsupported file type: .${ext}. Please upload a valid .kml or .kmz file.`);
        continue;
      }

      try {
        const parsedLayer = await parseGeospatialFile(file);
        
        if (parsedLayer.features.length === 0) {
          setErrorMsg(`The file "${file.name}" has no renderable geographic shapes or placemarks.`);
          continue;
        }

        setLayers(prev => [...prev, parsedLayer]);
        setVisibleLayerIds(prev => [...prev, parsedLayer.id]);
        setSelectedLayerId(parsedLayer.id);
        loadedLayersCount++;
      } catch (err: any) {
        console.error(err);
        setErrorMsg(`Failed to parse file "${file.name}": ${err.message || err}`);
      }
    }
    
    setLoading(false);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processUploadedFiles(e.target.files);
    }
  };

  // Drag and drop event handlers
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processUploadedFiles(e.dataTransfer.files);
    }
  };

  // Load local sample dataset
  const loadSampleData = () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const parsedSample = parseKml(SAMPLE_KML, 'San Francisco Sample.kml', '4.2 KB');
      setLayers(prev => [...prev, parsedSample]);
      setVisibleLayerIds(prev => [...prev, parsedSample.id]);
      setSelectedLayerId(parsedSample.id);
    } catch (err: any) {
      setErrorMsg(`Failed to load sample dataset: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-high-bg text-high-text flex flex-col font-sans antialiased selection:bg-high-accent selection:text-high-bg">
      {/* 1. Header Bar */}
      <header className="bg-high-darker border-b border-high-border px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 z-10 shadow-lg">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-high-bg border border-high-border rounded-lg shadow-inner">
            <Globe className="w-5 h-5 text-high-accent" />
          </div>
          <div>
            <h1 className="text-sm font-extrabold tracking-widest text-high-text flex items-center space-x-1.5 uppercase">
              <span>Geospatial KMZ Viewer</span>
              <span className="text-[9px] bg-high-border text-high-accent border border-high-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Web GIS</span>
            </h1>
            <p className="text-[10px] text-high-teal font-semibold font-mono">Standalone spatial viewer & KML/KMZ parser workbench</p>
          </div>
        </div>

        {/* Quick controls */}
        <div className="flex items-center space-x-2">
          {layers.length === 0 && (
            <button
              onClick={loadSampleData}
              className="px-3 py-1.5 bg-high-bg hover:bg-high-border text-high-accent text-xs font-bold rounded-lg transition-all flex items-center space-x-1.5 border border-high-border shadow-sm group cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse" />
              <span>Load SF Sample</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-high-accent hover:bg-high-accent/80 text-high-bg text-xs font-extrabold rounded-lg transition-all flex items-center space-x-1.5 shadow-md shadow-high-accent/10 cursor-pointer border border-high-accent"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import Layers</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".kml,.kmz"
            className="hidden"
          />
        </div>
      </header>

      {/* 2. Main Workbench Area */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 w-full relative">
        {/* Left Control Rail */}
        <div className="w-full lg:w-80 flex flex-col p-4 space-y-4 border-r border-high-border bg-high-darker shrink-0 lg:overflow-y-auto">
          {/* Uploader / Dropzone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none ${
              isDragOver
                ? 'border-high-accent bg-high-border/20 shadow-md shadow-high-accent/5'
                : 'border-high-border hover:border-high-teal bg-high-bg/30 hover:bg-high-bg'
            }`}
          >
            <Upload className={`w-7 h-7 mb-2 stroke-[1.5] transition-transform ${isDragOver ? 'scale-110 text-high-accent' : 'text-high-teal/70'}`} />
            <span className="text-xs font-bold text-high-text">Drag & Drop KMZ / KML</span>
            <span className="text-[10px] text-high-teal mt-1 font-mono">or click to browse local files</span>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-lg p-3 flex items-start space-x-2.5 text-xs text-rose-300 font-mono">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-bold block mb-0.5 uppercase tracking-wider text-[10px]">Import Error</span>
                <p className="leading-relaxed opacity-90 break-words">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-[10px] text-high-teal hover:text-white font-bold px-1 py-0.5">Dismiss</button>
            </div>
          )}

          {/* Layers List Panel */}
          <div className="flex-1 min-h-[180px] lg:min-h-0">
            <LayersPanel
              layers={layers}
              visibleLayerIds={visibleLayerIds}
              onToggleVisibility={handleToggleLayer}
              onDeleteLayer={handleDeleteLayer}
              onRenameLayer={handleRenameLayer}
              onUpdateLayerColor={handleUpdateLayerColor}
              onZoomToLayer={handleZoomToLayer}
              selectedLayerId={selectedLayerId}
              onSelectLayer={setSelectedLayerId}
            />
          </div>

          {/* Features in Selected Layer */}
          <div className="flex-1 min-h-[180px] lg:min-h-0">
            <FeatureList
              layer={activeLayer}
              onFeatureSelect={handleFeatureSelect}
              selectedFeatureId={selectedFeature?.id || null}
            />
          </div>
        </div>

        {/* Center Mapping Area */}
        <div className="flex-1 flex flex-col min-w-0 p-4 bg-high-bg space-y-4">
          
          {/* Main Map with Toolbar */}
          <div className="flex-1 flex flex-col min-h-[350px] relative">
            
            {/* Map Header Toolbar */}
            <div className="bg-high-darker border border-high-border border-b-0 rounded-t-xl px-4 py-2.5 flex items-center justify-between gap-4">
              <div className="flex items-center space-x-2">
                <Map className="w-4 h-4 text-high-accent" />
                <span className="text-xs font-bold text-high-accent tracking-widest uppercase">Interactive GIS Canvas</span>
              </div>
              
              {/* Basemap Selection */}
              <div className="flex items-center space-x-1.5 text-xs">
                <span className="text-high-teal text-[10px] font-bold uppercase tracking-widest hidden sm:inline font-mono">Basemap:</span>
                <select
                  value={basemap}
                  onChange={(e) => setBasemap(e.target.value as BasemapType)}
                  className="bg-high-bg border border-high-border text-high-text rounded px-2 py-1 focus:outline-none focus:border-high-accent font-bold text-[11px]"
                >
                  <option value="osm">Standard Streets (OSM)</option>
                  <option value="satellite">High-Res Satellite (Esri)</option>
                  <option value="light">CartoDB Light Neutrals</option>
                  <option value="dark">CartoDB Dark Matter</option>
                  <option value="terrain">Topographic/Terrain</option>
                </select>
              </div>
            </div>

            {/* Map Canvas */}
            <div className="flex-1 min-h-0">
              <MapComponent
                layers={layers}
                visibleLayerIds={visibleLayerIds}
                highlightedFeature={selectedFeature}
                onFeatureSelect={handleFeatureSelect}
                basemap={basemap}
                onCoordinatesChange={(lat, lng) => setCursorCoords({ lat, lng })}
              />
            </div>

            {/* Status / Coordinate Bar */}
            <div className="bg-high-darker border border-high-border border-t-0 rounded-b-xl px-4 py-1.5 flex items-center justify-between text-[10px] text-high-teal select-none font-mono">
              <div className="flex items-center space-x-3.5 font-semibold">
                <span>Layers: {layers.length}</span>
                <span>Active: {visibleLayerIds.length}</span>
                <span>Features: {layers.reduce((acc, l) => acc + l.features.length, 0)}</span>
              </div>
              <div className="font-semibold">
                <span>Lat: {cursorCoords.lat.toFixed(5)}, Lng: {cursorCoords.lng.toFixed(5)}</span>
              </div>
            </div>
          </div>

          {/* Bottom Attribute Table (QGIS style) */}
          <div className="shrink-0">
            <AttributeTable
              layer={activeLayer}
              onFeatureSelect={handleFeatureSelect}
              selectedFeatureId={selectedFeature?.id || null}
            />
          </div>
        </div>

        {/* Right Info Drawer (Selected Feature details) */}
        <div className="w-full lg:w-80 p-4 border-l border-high-border bg-high-darker shrink-0 lg:overflow-y-auto">
          <FeatureDetails
            feature={selectedFeature}
            layer={selectedFeatureLayer}
            onClose={() => handleFeatureSelect(null, null)}
          />
        </div>
      </main>

      {/* Full Screen Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-high-darker/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
          <div className="bg-high-bg border border-high-border p-6 rounded-2xl flex flex-col items-center max-w-xs text-center shadow-2xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-high-accent mb-3.5"></div>
            <p className="text-xs font-bold text-high-text uppercase tracking-widest font-mono">Processing Spatial Layers</p>
            <p className="text-[10px] text-high-teal mt-1.5 leading-relaxed font-mono">Reading zip files, extracting coordinates, and mapping shapes to client-side memory...</p>
          </div>
        </div>
      )}
    </div>
  );
}

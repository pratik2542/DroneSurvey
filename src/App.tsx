import React, { useState, useRef, useEffect } from 'react';
import { parseGeospatialFile, parseKml } from './utils/kmlParser';
import { parseShapefile } from './utils/shpParser';
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
  HelpCircle,
  Link,
  FileText,
  X,
  ShieldCheck,
  Plus,
  Trash2,
  Folder
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

const getBackendUrl = (path: string): string => {
  const backendHost = import.meta.env.VITE_BACKEND_URL || '';
  if (backendHost) {
    const cleanHost = backendHost.endsWith('/') ? backendHost.slice(0, -1) : backendHost;
    return `${cleanHost}${path}`;
  }
  return `/tile-server-proxy${path}`;
};

const getBackendHeaders = (headers: Record<string, string> = {}): Record<string, string> => {
  const backendHost = import.meta.env.VITE_BACKEND_URL || '';
  if (!backendHost) {
    return {
      ...headers,
      'x-target-host': 'http://localhost:8000'
    };
  }
  return headers;
};

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
  const [zoomLayerRequest, setZoomLayerRequest] = useState<{ layerId: string; timestamp: number } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Custom Tile Server State
  const [tileLayerName, setTileLayerName] = useState('');
  const [tileUrlTemplate, setTileUrlTemplate] = useState('');
  const [tileBounds, setTileBounds] = useState({ north: '', south: '', east: '', west: '' });

  // Mobile UI States
  const [mobileLeftPanelOpen, setMobileLeftPanelOpen] = useState(false);
  const [mobileRightPanelOpen, setMobileRightPanelOpen] = useState(false);
  
  // Importer Tab & URL States
  const [uploadTab, setUploadTab] = useState<'local' | 'url' | 'admin' | 'help'>('local');
  const [urlInput, setUrlInput] = useState('');

  // Google Drive Folder KMZ Selector States
  const [folderFiles, setFolderFiles] = useState<Array<{ id: string; name: string; size?: number; mimeType?: string; downloadUrl?: string }>>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<Set<string>>(new Set());
  const [isFolderFetching, setIsFolderFetching] = useState(false);

  // Admin Panel States
  const [adminName, setAdminName] = useState('');
  const [adminUrl, setAdminUrl] = useState('');
  const [adminType, setAdminType] = useState<'raster' | 'vector'>('raster');
  const [adminDescription, setAdminDescription] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  // Hosted Surveys Catalog State
  const [catalog, setCatalog] = useState<any[]>([]);

  // Fetch Cloud Catalog on Mount
  useEffect(() => {
    const fetchCatalog = async () => {
      try {
        const response = await fetch(getBackendUrl('/api/surveys'), {
          headers: getBackendHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setCatalog(data);
          return;
        }
      } catch (e) {
        console.warn('Backend API offline, falling back to public/surveys.json:', e);
      }

      try {
        const response = await fetch('/surveys.json');
        if (response.ok) {
          const data = await response.json();
          setCatalog(data);
        }
      } catch (e) {
        console.warn('Failed to load surveys catalog:', e);
      }
    };
    fetchCatalog();
  }, []);

  // Auto-open Details Drawer on mobile when feature is selected
  useEffect(() => {
    if (selectedFeature) {
      setMobileRightPanelOpen(true);
    }
  }, [selectedFeature]);

  // Poll for background surveys if any are in progress
  useEffect(() => {
    const activeProcessing = catalog.some(
      (item) => item.status && item.status !== 'completed' && item.status !== 'failed'
    );
    if (!activeProcessing) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(getBackendUrl('/api/surveys'), {
          headers: getBackendHeaders()
        });
        if (response.ok) {
          const data = await response.json();
          setCatalog(data);
        }
      } catch (e) {
        console.warn('Failed to poll surveys:', e);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [catalog]);

  // Publish Survey Handler
  const handlePublishSurvey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminName.trim() || !adminUrl.trim()) return;
    
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const response = await fetch(getBackendUrl('/api/process-survey'), {
        method: 'POST',
        headers: getBackendHeaders({
          'Content-Type': 'application/json'
        }),
        body: JSON.stringify({
          name: adminName.trim(),
          url: adminUrl.trim(),
          type: adminType,
          description: adminDescription.trim()
        })
      });
      
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Failed with status: ${response.status}`);
      }
      
      const data = await response.json();
      setCatalog(prev => [...prev, data.survey]);
      setAdminName('');
      setAdminUrl('');
      setAdminDescription('');
      alert(`Survey "${adminName}" successfully published to the cloud catalog!`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to publish survey: ${err.message || err}`);
    } finally {
      setIsProcessing(false);
    }
  };

  // Delete Catalog Survey Handler
  const handleDeleteCatalogSurvey = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the survey "${name}"?`)) return;
    
    setLoading(true);
    setErrorMsg(null);
    try {
      const response = await fetch(getBackendUrl(`/api/surveys/${id}`), {
        method: 'DELETE',
        headers: getBackendHeaders()
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete survey (status ${response.status})`);
      }
      
      setCatalog(prev => prev.filter(s => s.id !== id));
      setLayers(prev => prev.filter(l => !l.id.includes(id)));
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to delete survey: ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Google Drive & Dropbox Link Rewriter and Proxy Helper
  const getDirectDownloadUrl = (urlStr: string): { url: string; headers?: Record<string, string>; fileName: string } | null => {
    try {
      const url = new URL(urlStr);
      let downloadUrl = urlStr;
      let fileName = 'imported_file';

      const pathParts = url.pathname.split('/');
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart && (lastPart.endsWith('.kml') || lastPart.endsWith('.kmz') || lastPart.endsWith('.zip') || lastPart.endsWith('.tif') || lastPart.endsWith('.tiff'))) {
        fileName = lastPart;
      }

      if (url.hostname.includes('drive.google.com')) {
        let fileId = '';
        if (url.pathname.includes('/file/d/')) {
          const parts = url.pathname.split('/');
          const dIndex = parts.indexOf('d');
          if (dIndex !== -1 && parts[dIndex + 1]) {
            fileId = parts[dIndex + 1];
          }
        } else {
          fileId = url.searchParams.get('id') || '';
        }
        
        if (fileId) {
          downloadUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
          fileName = `gdrive_${fileId}.kmz`;
        }
      }
      else if (url.hostname.includes('dropbox.com')) {
        downloadUrl = urlStr.replace('www.dropbox.com', 'dl.dropboxusercontent.com');
        const urlObj = new URL(downloadUrl);
        urlObj.searchParams.set('dl', '1');
        downloadUrl = urlObj.toString();
        
        if (fileName === 'imported_file') {
          fileName = 'dropbox_file.kmz';
        }
      }

      return {
        url: downloadUrl,
        fileName
      };
    } catch (e) {
      console.error('Invalid URL', e);
      return null;
    }
  };

  // URL Import Handler
  const handleUrlImport = async () => {
    if (!urlInput.trim()) return;
    setLoading(true);
    setErrorMsg(null);

    const input = urlInput.trim();

    // 1. Inspect if user pasted a Google Drive folder link or folder ID
    if (input.includes('/folders/') || (input.includes('drive.google.com') && !input.includes('/file/d/') && !input.includes('id=')) || (input.length > 20 && !input.includes('/') && !input.includes('.'))) {
      try {
        setIsFolderFetching(true);
        const param = `url=${encodeURIComponent(input)}`;
        
        const getConnectedHost = (): string => {
          try {
            if (tileUrlTemplate.trim()) {
              const u = new URL(tileUrlTemplate.trim());
              if (u.origin && (u.origin.startsWith('http://') || u.origin.startsWith('https://'))) {
                return u.origin.endsWith('/') ? u.origin.slice(0, -1) : u.origin;
              }
            }
          } catch (e) {}

          const saved = localStorage.getItem('connected_tile_host');
          if (saved && (saved.startsWith('http://') || saved.startsWith('https://'))) {
            return saved.endsWith('/') ? saved.slice(0, -1) : saved;
          }

          if (window.location.origin && (window.location.origin.startsWith('http://') || window.location.origin.startsWith('https://'))) {
            if (window.location.origin.includes(':8000') || window.location.origin.includes('trycloudflare.com')) {
              return window.location.origin.endsWith('/') ? window.location.origin.slice(0, -1) : window.location.origin;
            }
          }

          return '';
        };

        const activeHost = getConnectedHost();
        const candidates = [];
        if (activeHost) {
          candidates.push(`${activeHost}/api/gdrive-folder-files?${param}`);
        }
        candidates.push(`http://localhost:8000/api/gdrive-folder-files?${param}`);
        candidates.push(getBackendUrl(`/api/gdrive-folder-files?${param}`));

        let res: Response | null = null;
        for (const candidate of candidates) {
          try {
            const r = await fetch(candidate);
            if (r.ok) {
              res = r;
              break;
            }
          } catch (e) {}
        }

        if (!res) {
          throw new Error(
            activeHost
              ? `Could not reach server at ${activeHost}. Please verify that start_local_server.bat is running on your PC!`
              : 'No connected tile server host found. Please paste your server URL under CONNECT TILE SERVER first!'
          );
        }

        const data = await res.json();
        if (data.files && data.files.length > 0) {
          setFolderFiles(data.files);
          setSelectedFileIds(new Set(data.files.map((f: any) => f.id)));
        } else {
          setErrorMsg('No KMZ, KML, or GeoTIFF files found in this Google Drive folder.');
        }
      } catch (err: any) {
        console.error(err);
        setErrorMsg(`Failed to inspect Google Drive folder: ${err.message || err}`);
      } finally {
        setLoading(false);
        setIsFolderFetching(false);
      }
      return;
    }

    if (input.includes('drive.google.com') && (input.includes('.tif') || input.includes('_cog') || input.includes('orthomosaic'))) {
      setErrorMsg(
        'GeoTIFF rasters on Google Drive must be registered in the ADMIN tab so the tile server can process and stream map tiles!'
      );
      setLoading(false);
      return;
    }

    try {
      const config = getDirectDownloadUrl(input);
      if (!config) {
        throw new Error('Invalid URL format. Please paste a valid link.');
      }
      
      const response = await fetch(config.url, {
        headers: config.headers
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch file: ${response.statusText} (${response.status})`);
      }
      
      const blob = await response.blob();
      
      let finalFileName = config.fileName;
      const contentType = response.headers.get('content-type') || '';
      if (finalFileName === 'imported_file' || finalFileName === 'dropbox_file.kmz') {
        if (contentType.includes('kml')) {
          finalFileName = 'imported_layer.kml';
        } else if (contentType.includes('zip') || contentType.includes('octet-stream')) {
          if (urlInput.toLowerCase().includes('.zip')) {
            finalFileName = 'imported_shapefile.zip';
          } else {
            finalFileName = 'imported_layer.kmz';
          }
        } else if (contentType.includes('tiff') || contentType.includes('image/tiff')) {
          finalFileName = 'imported_raster.tif';
        } else {
          finalFileName = 'imported_layer.kmz';
        }
      }

      const file = new File([blob], finalFileName);
      await processUploadedFiles([file] as any);
      setUrlInput('');
      setUploadTab('local');
    } catch (err: any) {
      console.error(err);
      if (input.includes('drive.google.com')) {
        setErrorMsg('Google Drive blocks direct browser downloads due to CORS. Please use the ADMIN tab to publish your survey link to the Cloud Catalog!');
      } else {
        setErrorMsg(`Failed to import from link: ${err.message || err}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Batch Load Selected Files from Google Drive Folder
  const handleBatchLoadFolderFiles = async () => {
    if (selectedFileIds.size === 0) return;
    setLoading(true);
    setErrorMsg(null);

    let host = '';
    try {
      if (tileUrlTemplate.trim()) {
        host = new URL(tileUrlTemplate.trim()).origin;
      }
    } catch (e) {}

    const filesToLoad = folderFiles.filter((f) => selectedFileIds.has(f.id));
    let loadedCount = 0;
    let failCount = 0;

    for (const item of filesToLoad) {
      try {
        const candidates = [
          `https://lh3.googleusercontent.com/d/${item.id}`,
          `http://localhost:8000/api/gdrive-download/${item.id}?name=${encodeURIComponent(item.name)}`,
          `https://corsproxy.io/?https://drive.google.com/uc?id=${item.id}&export=download`
        ];
        if (host && host.startsWith('http')) {
          const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
          candidates.push(`${cleanHost}/api/gdrive-download/${item.id}?name=${encodeURIComponent(item.name)}`);
        }

        let response: Response | null = null;
        for (const candidate of candidates) {
          try {
            const r = await fetch(candidate);
            if (r.ok) {
              response = r;
              break;
            }
          } catch (e) {}
        }

        if (!response) {
          throw new Error(`Download failed for ${item.name}`);
        }

        const blob = await response.blob();
        Object.defineProperty(blob, 'name', { value: item.name, writable: false });
        await processUploadedFiles([blob as File]);
        loadedCount++;
      } catch (e: any) {
        console.error(`Failed to load KMZ file ${item.name}:`, e);
        failCount++;
      }
    }

    setLoading(false);
    if (loadedCount > 0) {
      setFolderFiles([]);
      setUrlInput('');
    }
    if (failCount > 0) {
      setErrorMsg(`Loaded ${loadedCount} file(s), but ${failCount} failed to load.`);
    }
  };

  // Load survey from Cloud Catalog
  const handleLoadCatalogSurvey = async (survey: any) => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 1. Check if backend cache is ready
      const cacheResponse = await fetch(getBackendUrl(`/api/surveys/cache-status/${survey.id}`), {
        headers: getBackendHeaders()
      });
      
      if (!cacheResponse.ok) {
        throw new Error(`Failed to check server cache status: ${cacheResponse.statusText}`);
      }
      
      const cacheData = await cacheResponse.json();
      
      if (!cacheData.cached) {
        let pollCount = 0;
        const maxPolls = 100; // ~5 mins maximum
        
        while (pollCount < maxPolls) {
          // Wait 3 seconds before checking again
          await new Promise(resolve => setTimeout(resolve, 3000));
          pollCount++;
          
          const checkResponse = await fetch(getBackendUrl(`/api/surveys/cache-status/${survey.id}`), {
            headers: getBackendHeaders()
          });
          
          if (checkResponse.ok) {
            const checkData = await checkResponse.json();
            if (checkData.cached) {
              survey = checkData.survey;
              break;
            }
          }
        }
        
        if (pollCount >= maxPolls) {
          throw new Error('Server cache request timed out. Please try again.');
        }
      }

      // 2. Load the cached survey
      if (survey.type === 'raster') {
        const newLayer: KmlLayer = {
          id: `catalog-raster-${survey.id}-${Date.now()}`,
          name: survey.name,
          fileName: 'Cloud Raster GeoTIFF',
          fileSize: 'N/A',
          features: [],
          visible: true,
          color: '#8B5CF6',
          tileUrl: getBackendUrl(survey.url),
          bounds: survey.bounds
        };
        
        setLayers(prev => [...prev, newLayer]);
        setVisibleLayerIds(prev => [...prev, newLayer.id]);
        setSelectedLayerId(newLayer.id);
        
        if (survey.bounds) {
          setZoomLayerRequest({ layerId: newLayer.id, timestamp: Date.now() });
        }
      } else {
        const config = getDirectDownloadUrl(survey.url);
        if (!config) {
          throw new Error('Invalid catalog URL.');
        }
        
        const response = await fetch(config.url, {
          headers: config.headers
        });
        
        if (!response.ok) {
          throw new Error(`Failed to fetch catalog file: ${response.statusText}`);
        }
        
        const blob = await response.blob();
        const file = new File([blob], survey.fileName || `${survey.name}.kmz`);
        await processUploadedFiles([file] as any);
      }
      setMobileLeftPanelOpen(false);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(`Failed to load catalog survey "${survey.name}": ${err.message || err}`);
    } finally {
      setLoading(false);
    }
  };

  // Close Feature Details Drawer
  const handleCloseDetails = () => {
    setMobileRightPanelOpen(false);
    setSelectedFeature(null);
    setSelectedFeatureLayer(null);
  };

  const handleConnectTileServer = async () => {
    if (!tileUrlTemplate.trim()) return;

    let parsedBounds: [number, number, number, number] | undefined;
    const { north, south, east, west } = tileBounds;
    
    if (north && south && east && west) {
      const n = parseFloat(north);
      const s = parseFloat(south);
      const e = parseFloat(east);
      const w = parseFloat(west);
      if (!isNaN(n) && !isNaN(s) && !isNaN(e) && !isNaN(w)) {
        parsedBounds = [s, w, n, e];
      }
    }

    const name = tileLayerName.trim() || 'Tile Server Layer';
    
    let urlStr = tileUrlTemplate.trim();
    let filename = '';
    let gdrive_id = '';
    let host = '';

    // Auto-detect and rewrite main page localtileserver URLs to Leaflet XYZ template format
    try {
      const urlObj = new URL(urlStr);
      filename = urlObj.searchParams.get('filename') || '';
      gdrive_id = urlObj.searchParams.get('gdrive_id') || '';
      host = urlObj.origin;
      
      if (host && (host.startsWith('http://') || host.startsWith('https://'))) {
        const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
        localStorage.setItem('connected_tile_host', cleanHost);
      }

      if ((urlObj.pathname === '/' || urlObj.pathname === '') && filename) {
        urlStr = `${host}/api/tiles/{z}/{x}/{y}.png?filename=${encodeURIComponent(filename)}`;
      }
    } catch (e) {
      console.warn('Failed to parse URL template', e);
    }

    // Auto-fetch bounds from tile server if no bounds are specified manually
    let boundsToUse = parsedBounds;
    if (!boundsToUse && (filename || gdrive_id)) {
      try {
        const param = filename ? `filename=${encodeURIComponent(filename)}` : `gdrive_id=${gdrive_id}`;
        let boundsUrl = '';
        if (host && (host.startsWith('http://') || host.startsWith('https://'))) {
          const cleanHost = host.endsWith('/') ? host.slice(0, -1) : host;
          boundsUrl = `${cleanHost}/api/bounds?${param}`;
        } else {
          boundsUrl = getBackendUrl(`/api/bounds?${param}`);
        }

        const response = await fetch(boundsUrl);
        if (response.ok) {
          const data = await response.json();
          const b = data.bounds || data;
          
          if (b.south !== undefined && b.west !== undefined && b.north !== undefined && b.east !== undefined) {
            boundsToUse = [
              parseFloat(b.south),
              parseFloat(b.west),
              parseFloat(b.north),
              parseFloat(b.east)
            ];
          } else if (b.left !== undefined && b.bottom !== undefined && b.right !== undefined && b.top !== undefined) {
            // localtileserver format: left, bottom, right, top -> [south, west, north, east]
            boundsToUse = [
              parseFloat(b.bottom),
              parseFloat(b.left),
              parseFloat(b.top),
              parseFloat(b.right)
            ];
          } else if (b.minlat !== undefined && b.minlon !== undefined && b.maxlat !== undefined && b.maxlon !== undefined) {
            boundsToUse = [
              parseFloat(b.minlat),
              parseFloat(b.minlon),
              parseFloat(b.maxlat),
              parseFloat(b.maxlon)
            ];
          }
        }
      } catch (e) {
        console.warn('Failed to auto-fetch bounds from tile server', e);
      }
    }
    
    const newLayer: KmlLayer = {
      id: `tile-layer-${Date.now()}`,
      name,
      fileName: 'Raster Tile Server',
      fileSize: 'N/A',
      features: [],
      visible: true,
      color: '#06B6D4', // Cyan representation
      tileUrl: urlStr,
      bounds: boundsToUse
    };

    setLayers(prev => [...prev, newLayer]);
    setVisibleLayerIds(prev => [...prev, newLayer.id]);
    setSelectedLayerId(newLayer.id);

    // Reset inputs
    setTileLayerName('');
    setTileUrlTemplate('');
    setTileBounds({ north: '', south: '', east: '', west: '' });
  };

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
    // Make sure layer is visible
    if (!visibleLayerIds.includes(layer.id)) {
      setVisibleLayerIds(prev => [...prev, layer.id]);
    }
    setZoomLayerRequest({ layerId: layer.id, timestamp: Date.now() });
  };

  // Handle Feature selection (from map, list, or table)
  const handleFeatureSelect = (feature: KmlFeature | null, layer: KmlLayer | null) => {
    setSelectedFeature(feature);
    setSelectedFeatureLayer(layer);
    if (layer) {
      setSelectedLayerId(layer.id);
    }
  };

  // Handle file uploads (kmz, kml, zip, tif, tiff)
  const processUploadedFiles = async (files: FileList) => {
    setLoading(true);
    setErrorMsg(null);
    
    let loadedLayersCount = 0;
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const ext = file.name.split('.').pop()?.toLowerCase();
      
      if (ext !== 'kml' && ext !== 'kmz' && ext !== 'zip' && ext !== 'tif' && ext !== 'tiff') {
        setErrorMsg(`Unsupported file type: .${ext}. Please upload a valid .kml, .kmz, .zip, or .tif file.`);
        continue;
      }

      try {
        if (ext === 'tif' || ext === 'tiff') {
          const formData = new FormData();
          formData.append('file', file);

           const response = await fetch(getBackendUrl('/api/upload-tif'), {
            method: 'POST',
            body: formData,
            headers: getBackendHeaders()
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error || `Upload failed with status: ${response.status}`);
          }

          const data = await response.json();
          const fullTileUrl = getBackendUrl(data.tileUrl);

          // Auto-fetch bounds from localtileserver proxy
          let boundsToUse: [number, number, number, number] | undefined;
          try {
            const boundsUrl = getBackendUrl(`/api/bounds?filename=${encodeURIComponent(data.filepath)}`);
            const boundsResponse = await fetch(boundsUrl, {
              headers: getBackendHeaders()
            });
            if (boundsResponse.ok) {
              const boundsData = await boundsResponse.json();
              const b = boundsData.bounds || boundsData;
              if (b.left !== undefined && b.bottom !== undefined && b.right !== undefined && b.top !== undefined) {
                boundsToUse = [
                  parseFloat(b.bottom),
                  parseFloat(b.left),
                  parseFloat(b.top),
                  parseFloat(b.right)
                ];
              }
            }
          } catch (e) {
            console.warn('Failed to fetch bounds for uploaded tif', e);
          }

          if (!boundsToUse && data.bounds) {
            boundsToUse = [
              parseFloat(data.bounds.south),
              parseFloat(data.bounds.west),
              parseFloat(data.bounds.north),
              parseFloat(data.bounds.east)
            ];
          }

          const newLayer: KmlLayer = {
            id: `tile-layer-${Date.now()}-${i}`,
            name: file.name,
            fileName: file.name,
            fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
            features: [],
            visible: true,
            color: '#06B6D4',
            tileUrl: fullTileUrl,
            bounds: boundsToUse
          };

          setLayers(prev => [...prev, newLayer]);
          setVisibleLayerIds(prev => [...prev, newLayer.id]);
          setSelectedLayerId(newLayer.id);
          loadedLayersCount++;
        } else if (ext === 'zip') {
          const buffer = await file.arrayBuffer();
          const parsedLayers = await parseShapefile(buffer, file.name, `${(file.size / 1024).toFixed(1)} KB`);
          
          if (parsedLayers.length === 0) {
            setErrorMsg(`The zip file "${file.name}" has no valid Shapefiles.`);
            continue;
          }
          
          setLayers(prev => [...prev, ...parsedLayers]);
          setVisibleLayerIds(prev => [...prev, ...parsedLayers.map(l => l.id)]);
          setSelectedLayerId(parsedLayers[parsedLayers.length - 1].id);
          loadedLayersCount += parsedLayers.length;
        } else {
          const parsedLayer = await parseGeospatialFile(file);
          
          if (parsedLayer.features.length === 0) {
            setErrorMsg(`The file "${file.name}" has no renderable geographic shapes or placemarks.`);
            continue;
          }

          setLayers(prev => [...prev, parsedLayer]);
          setVisibleLayerIds(prev => [...prev, parsedLayer.id]);
          setSelectedLayerId(parsedLayer.id);
          loadedLayersCount++;
        }
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
    <div className="h-screen overflow-hidden bg-high-bg text-high-text flex flex-col font-sans antialiased selection:bg-high-accent selection:text-high-bg">
      {/* 1. Header Bar */}
      <header className="bg-high-darker border-b border-high-border px-6 py-4 flex flex-row items-center justify-between gap-4 z-10 shadow-lg">
        <div className="flex items-center space-x-3">
          {/* Mobile menu trigger */}
          <button
            onClick={() => setMobileLeftPanelOpen(true)}
            className="lg:hidden p-2 bg-high-bg border border-high-border rounded-lg text-high-accent hover:bg-high-border transition-all"
            title="Open Sidebar"
          >
            <Layers className="w-5 h-5" />
          </button>

          <div className="flex items-center space-x-2">
            <div className="hidden sm:block p-2 bg-high-bg border border-high-border rounded-lg shadow-inner">
              <Globe className="w-5 h-5 text-high-accent" />
            </div>
            <div>
              <h1 className="text-xs sm:text-sm font-extrabold tracking-widest text-high-text flex items-center space-x-1.5 uppercase">
                <span>DroneSurvey GIS</span>
                <span className="text-[8px] sm:text-[9px] bg-high-border text-high-accent border border-high-accent px-1.5 py-0.5 rounded font-bold uppercase tracking-widest">Web GIS</span>
              </h1>
              <p className="hidden md:block text-[10px] text-high-teal font-semibold font-mono">Standalone spatial viewer & KML/KMZ/TIF parser workbench</p>
            </div>
          </div>
        </div>

        {/* Quick controls */}
        <div className="flex items-center space-x-2">
          {layers.length === 0 && (
            <button
              onClick={loadSampleData}
              className="px-2.5 py-1.5 bg-high-bg hover:bg-high-border text-high-accent text-xs font-bold rounded-lg transition-all flex items-center space-x-1 border border-high-border shadow-sm group cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 group-hover:animate-pulse" />
              <span className="hidden sm:inline">SF Sample</span>
            </button>
          )}

          <button
            onClick={() => fileInputRef.current?.click()}
            className="px-3 py-1.5 bg-high-accent hover:bg-high-accent/80 text-high-bg text-xs font-extrabold rounded-lg transition-all flex items-center space-x-1.5 shadow-md shadow-high-accent/10 cursor-pointer border border-high-accent"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import</span>
          </button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            multiple
            accept=".kml,.kmz,.zip,.tif,.tiff"
            className="hidden"
          />
        </div>
      </header>

      {/* 2. Main Workbench Area */}
      <main className="flex-1 flex flex-col lg:flex-row min-h-0 w-full relative overflow-hidden">
        
        {/* Left Control Rail (Responsive Drawer) */}
        <div className={`fixed inset-y-0 left-0 z-[1100] w-80 max-w-[85vw] flex flex-col p-4 space-y-4 border-r border-high-border bg-high-darker transition-transform duration-300 transform lg:relative lg:translate-x-0 lg:z-0 lg:shadow-none lg:w-80 lg:max-w-none lg:h-full lg:overflow-y-auto ${
          mobileLeftPanelOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          {/* Mobile Drawer Header */}
          <div className="flex lg:hidden justify-between items-center border-b border-high-border pb-2.5 mb-1 shrink-0">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-high-accent" />
              <span className="text-xs font-extrabold uppercase tracking-widest text-high-accent">Layers & Imports</span>
            </div>
            <button
              onClick={() => setMobileLeftPanelOpen(false)}
              className="p-1 text-high-teal hover:text-white rounded-lg"
              title="Close Panel"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Importer Tabbed Card */}
          <div className="bg-high-bg border border-high-border rounded-xl overflow-hidden shadow-lg flex flex-col shrink-0">
            {/* Tabs Header */}
            <div className="flex border-b border-high-border bg-high-darker">
              <button 
                onClick={() => setUploadTab('local')}
                className={`flex-1 py-2 text-[9px] font-extrabold uppercase tracking-wider flex items-center justify-center space-x-1 border-r border-high-border transition-colors ${
                  uploadTab === 'local' ? 'bg-high-bg text-high-accent' : 'text-high-teal/60 hover:text-high-accent'
                }`}
              >
                <Upload className="w-3 h-3" />
                <span>Local</span>
              </button>
              <button 
                onClick={() => setUploadTab('url')}
                className={`flex-1 py-2 text-[9px] font-extrabold uppercase tracking-wider flex items-center justify-center space-x-1 border-r border-high-border transition-colors ${
                  uploadTab === 'url' ? 'bg-high-bg text-high-accent' : 'text-high-teal/60 hover:text-high-accent'
                }`}
              >
                <Link className="w-3 h-3" />
                <span>Cloud</span>
              </button>
              <button 
                onClick={() => setUploadTab('admin')}
                className={`flex-1 py-2 text-[9px] font-extrabold uppercase tracking-wider flex items-center justify-center space-x-1 border-r border-high-border transition-colors ${
                  uploadTab === 'admin' ? 'bg-high-bg text-high-accent' : 'text-high-teal/60 hover:text-high-accent'
                }`}
              >
                <ShieldCheck className="w-3 h-3" />
                <span>Admin</span>
              </button>
              <button 
                onClick={() => setUploadTab('help')}
                className={`flex-1 py-2 text-[9px] font-extrabold uppercase tracking-wider flex items-center justify-center space-x-1 transition-colors ${
                  uploadTab === 'help' ? 'bg-high-bg text-high-accent' : 'text-high-teal/60 hover:text-high-accent'
                }`}
              >
                <HelpCircle className="w-3 h-3" />
                <span>Guide</span>
              </button>
            </div>

            {/* Tab Panels */}
            <div className="p-3 bg-high-bg/30">
              {uploadTab === 'local' && (
                <div
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                  className={`border-2 border-dashed rounded-xl p-3 flex flex-col items-center justify-center text-center cursor-pointer transition-all select-none ${
                    isDragOver
                      ? 'border-high-accent bg-high-border/20 shadow-md'
                      : 'border-high-border hover:border-high-teal bg-high-bg/30 hover:bg-high-bg'
                   }`}
                >
                  <Upload className={`w-6 h-6 mb-1.5 stroke-[1.5] transition-transform ${isDragOver ? 'scale-110 text-high-accent' : 'text-high-teal/70'}`} />
                  <span className="text-[11px] font-bold text-high-text">Upload KMZ, KML, ZIP, TIF</span>
                  <span className="text-[9px] text-high-teal mt-0.5 font-mono">click to browse files</span>
                </div>
              )}

              {uploadTab === 'url' && (
                <div className="space-y-2">
                  <div className="text-[9px] text-high-teal font-medium leading-relaxed font-mono">
                    Paste Google Drive folder link, file link, or public KMZ/KML link.
                  </div>
                  <div className="flex space-x-1.5">
                    <input
                      type="text"
                      placeholder="Paste Google Drive folder or file link..."
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1 px-2 py-1 text-[11px] bg-high-darker border border-high-border rounded-lg focus:outline-none focus:border-high-accent text-high-text placeholder:text-high-teal/30 font-semibold"
                    />
                    <button
                      onClick={handleUrlImport}
                      disabled={!urlInput.trim() || loading || isFolderFetching}
                      className="px-2.5 py-1 bg-high-accent hover:bg-high-accent/80 text-high-bg text-[10px] font-extrabold rounded-lg transition-all disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {isFolderFetching ? 'Scanning...' : 'Inspect Link'}
                    </button>
                  </div>

                  {/* Google Drive Folder KMZ File Selector */}
                  {folderFiles.length > 0 && (
                    <div className="mt-3 p-2.5 bg-high-darker/90 border border-high-accent/40 rounded-xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-extrabold text-high-accent uppercase tracking-wider flex items-center gap-1">
                          <Folder className="w-3.5 h-3.5" />
                          Drive Folder Files ({folderFiles.length})
                        </span>
                        <div className="flex gap-1.5 text-[9px] font-bold">
                          <button
                            type="button"
                            onClick={() => setSelectedFileIds(new Set(folderFiles.map(f => f.id)))}
                            className="text-high-teal hover:text-high-accent underline"
                          >
                            Select All
                          </button>
                          <span className="text-high-teal/30">|</span>
                          <button
                            type="button"
                            onClick={() => setSelectedFileIds(new Set())}
                            className="text-high-teal hover:text-high-accent underline"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      <div className="max-h-44 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                        {folderFiles.map((file) => {
                          const isSelected = selectedFileIds.has(file.id);
                          const sizeKb = file.size ? (file.size > 1048576 ? `${(file.size / 1048576).toFixed(1)} MB` : `${Math.round(file.size / 1024)} KB`) : '';
                          return (
                            <label
                              key={file.id}
                              className={`flex items-center justify-between p-1.5 rounded-lg border text-[10px] cursor-pointer transition-colors ${
                                isSelected
                                  ? 'bg-high-accent/10 border-high-accent text-high-text'
                                  : 'bg-high-bg/50 border-high-border/50 text-high-teal/70 hover:border-high-teal'
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate pr-2">
                                <input
                                  type="checkbox"
                                  checked={isSelected}
                                  onChange={(e) => {
                                    const next = new Set(selectedFileIds);
                                    if (e.target.checked) next.add(file.id);
                                    else next.delete(file.id);
                                    setSelectedFileIds(next);
                                  }}
                                  className="accent-[#10B981] w-3 h-3 rounded"
                                />
                                <span className="font-semibold truncate">{file.name}</span>
                              </div>
                              {sizeKb && <span className="text-[8px] font-mono text-high-teal/50 whitespace-nowrap">{sizeKb}</span>}
                            </label>
                          );
                        })}
                      </div>

                      <button
                        type="button"
                        onClick={handleBatchLoadFolderFiles}
                        disabled={selectedFileIds.size === 0 || loading}
                        className="w-full py-1.5 bg-high-accent hover:bg-high-accent/80 text-high-bg text-[10px] font-extrabold rounded-lg transition-all flex items-center justify-center gap-1.5 disabled:opacity-40"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Load Selected Files ({selectedFileIds.size})</span>
                      </button>
                    </div>
                  )}
                </div>
              )}

              {uploadTab === 'admin' && (
                <form onSubmit={handlePublishSurvey} className="space-y-2">
                  <div className="text-[9px] text-high-accent font-bold uppercase tracking-wider block">
                    Owner GIS Upload Console
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Survey Name (e.g. SF Site Area)"
                      value={adminName}
                      onChange={(e) => setAdminName(e.target.value)}
                      className="w-full px-2 py-1.5 text-[10px] bg-high-darker border border-high-border rounded focus:outline-none focus:border-high-accent text-high-text font-semibold placeholder:text-high-teal/40"
                      required
                    />
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={adminType}
                      onChange={(e) => setAdminType(e.target.value as 'raster' | 'vector')}
                      className="flex-1 px-1.5 py-1 text-[10px] bg-high-darker border border-high-border rounded focus:outline-none focus:border-high-accent text-high-text font-bold"
                    >
                      <option value="raster">Raster (GeoTIFF / DSM)</option>
                      <option value="vector">Vector (KMZ / KML / ZIP)</option>
                    </select>
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Google Drive Link..."
                      value={adminUrl}
                      onChange={(e) => setAdminUrl(e.target.value)}
                      className="w-full px-2 py-1.5 text-[10px] bg-high-darker border border-high-border rounded focus:outline-none focus:border-high-accent text-high-text font-semibold placeholder:text-high-teal/40"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Description/Notes..."
                      value={adminDescription}
                      onChange={(e) => setAdminDescription(e.target.value)}
                      className="w-full px-2 py-1.5 text-[10px] bg-high-darker border border-high-border rounded focus:outline-none focus:border-high-accent text-high-text font-semibold placeholder:text-high-teal/40"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={isProcessing}
                    className="w-full py-1.5 bg-high-accent hover:bg-high-accent/80 disabled:opacity-40 disabled:cursor-not-allowed text-high-bg text-[10px] font-extrabold rounded transition-all uppercase tracking-wider flex items-center justify-center space-x-1"
                  >
                    {isProcessing ? (
                      <>
                        <span className="animate-spin rounded-full h-2.5 w-2.5 border-b border-high-bg mr-1.5"></span>
                        <span>Converting & Saving...</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        <span>Publish to Cloud</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {uploadTab === 'help' && (
                <div className="space-y-2 text-[9px] text-high-text leading-relaxed font-semibold max-h-[140px] overflow-y-auto pr-1">
                  <div className="border-b border-high-border/50 pb-1.5 mb-1.5">
                    <span className="text-high-accent font-bold uppercase tracking-wider block mb-0.5">1. iOS/Android Local Files</span>
                    <p className="opacity-90">Save file attachments from WhatsApp or Email to your device's "Files" (iOS) or "Downloads" (Android). Choose <strong>Local File</strong> to load them.</p>
                  </div>
                  <div className="border-b border-high-border/50 pb-1.5 mb-1.5">
                    <span className="text-high-accent font-bold uppercase tracking-wider block mb-0.5">2. Direct Cloud URLs</span>
                    <p className="opacity-90">Copy the file share link from Google Drive or Dropbox. Paste it directly in <strong>Cloud Link</strong> to import instantly.</p>
                  </div>
                  <div>
                    <span className="text-high-accent font-bold uppercase tracking-wider block mb-0.5">3. Web Share / PWA</span>
                    <p className="opacity-90">Install this app (tap "Add to Home Screen" in browser). You can then tap any KML/KMZ on your phone, select Share, and choose DroneSurvey.</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Cloud Catalog Panel */}
          {catalog.length > 0 && (
            <div className="bg-high-bg border border-high-border rounded-xl p-3 space-y-2 shadow-lg shrink-0">
              <div className="flex items-center space-x-2">
                <Globe className="w-4 h-4 text-high-accent animate-pulse" />
                <h3 className="text-xs font-bold text-high-accent tracking-widest uppercase">Cloud Catalog</h3>
              </div>
              <div className="space-y-1.5 max-h-[160px] overflow-y-auto pr-1">
                {catalog.map((item) => (
                  <div key={item.id} className="p-2 bg-high-darker border border-high-border rounded-lg hover:border-high-accent/60 transition-colors flex flex-col space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-bold text-high-text leading-tight">{item.name}</span>
                      <div className="flex items-center space-x-1 shrink-0">
                        {item.status && item.status !== 'completed' && (
                          <span className={`text-[7px] px-1 py-0.2 rounded font-bold uppercase tracking-wider ${
                            item.status === 'failed' ? 'bg-rose-950 text-rose-400 border border-rose-900' : 'bg-amber-950 text-amber-400 border border-amber-900 animate-pulse'
                          }`}>
                            {item.status}
                          </span>
                        )}
                        <span className={`text-[7px] px-1 py-0.2 rounded font-bold uppercase tracking-wider ${
                          item.type === 'raster' ? 'bg-cyan-950 text-cyan-400 border border-cyan-900' : 'bg-purple-950 text-purple-400 border border-purple-900'
                        }`}>
                          {item.type}
                        </span>
                      </div>
                    </div>
                    
                    {item.status === 'failed' && item.error && (
                      <p className="text-[8px] text-rose-400 font-mono leading-tight bg-rose-950/20 p-1 rounded border border-rose-900/30 break-words max-w-full">
                        Error: {item.error}
                      </p>
                    )}
                    <p className="text-[9px] text-high-teal leading-snug font-semibold">{item.description}</p>
                    <div className="flex gap-1 mt-1">
                      {(!item.status || item.status === 'completed') ? (
                        <button
                          onClick={() => handleLoadCatalogSurvey(item)}
                          className="flex-1 py-0.5 bg-high-accent/10 hover:bg-high-accent hover:text-high-bg text-high-accent text-[8px] font-extrabold rounded transition-colors uppercase tracking-wider cursor-pointer"
                        >
                          Load Layer
                        </button>
                      ) : (
                        <button
                          disabled
                          className="flex-1 py-0.5 bg-high-border text-high-teal/40 text-[8px] font-extrabold rounded uppercase tracking-wider cursor-not-allowed flex items-center justify-center"
                        >
                          {item.status === 'failed' ? 'Failed' : 'Processing...'}
                        </button>
                      )}
                      {uploadTab === 'admin' && (
                        <button
                          onClick={() => handleDeleteCatalogSurvey(item.id, item.name)}
                          className="px-1.5 py-0.5 bg-rose-950/20 hover:bg-rose-600 hover:text-white text-rose-400 border border-rose-900/50 rounded transition-colors cursor-pointer"
                          title="Delete Survey from Cloud"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="bg-rose-950/20 border border-rose-900/50 rounded-lg p-3 flex items-start space-x-2.5 text-[10px] text-rose-300 font-mono shrink-0">
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <span className="font-bold block mb-0.5 uppercase tracking-wider text-[9px]">Import Error</span>
                <p className="leading-relaxed opacity-90 break-words">{errorMsg}</p>
              </div>
              <button onClick={() => setErrorMsg(null)} className="text-[9px] text-high-teal hover:text-white font-bold px-1 py-0.5">Dismiss</button>
            </div>
          )}

          {/* Tile Server Connection Panel */}
          <div className="bg-high-bg border border-high-border rounded-xl p-3.5 space-y-3 shadow-lg shrink-0">
            <div className="flex items-center space-x-2">
              <Globe className="w-4 h-4 text-high-accent" />
              <h3 className="text-xs font-bold text-high-accent tracking-widest uppercase">Connect Tile Server</h3>
            </div>
            
            <div className="space-y-2">
              <div>
                <label className="block text-[9px] text-high-teal/60 font-bold uppercase tracking-wider mb-0.5">Layer Name</label>
                <input
                  type="text"
                  placeholder="e.g. Local Drone Survey"
                  value={tileLayerName}
                  onChange={(e) => setTileLayerName(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs bg-high-darker border border-high-border rounded-lg focus:outline-none focus:border-high-accent text-high-text placeholder:text-high-teal/30 font-semibold"
                />
              </div>

              <div>
                <label className="block text-[9px] text-high-teal/60 font-bold uppercase tracking-wider mb-0.5">Tile URL Template</label>
                <input
                  type="text"
                  placeholder="http://localhost:8000/api/tiles/{z}/{x}/{y}.png..."
                  value={tileUrlTemplate}
                  onChange={(e) => setTileUrlTemplate(e.target.value)}
                  className="w-full px-2.5 py-1 text-xs bg-high-darker border border-high-border rounded-lg focus:outline-none focus:border-high-accent text-high-text placeholder:text-high-teal/30 font-mono text-[9px] font-semibold"
                />
              </div>
            </div>

            <button
              onClick={handleConnectTileServer}
              disabled={!tileUrlTemplate.trim()}
              className="w-full py-1 bg-high-accent/10 hover:bg-high-accent hover:text-high-bg text-high-accent text-[10px] font-extrabold rounded-lg transition-all border border-high-accent/30 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed uppercase tracking-wider"
            >
              Connect Server
            </button>
          </div>

          {/* Layers List Panel */}
          <div className="h-[220px] shrink-0 flex flex-col">
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
          <div className="h-[240px] shrink-0 flex flex-col">
            <FeatureList
              layer={activeLayer}
              onFeatureSelect={handleFeatureSelect}
              selectedFeatureId={selectedFeature?.id || null}
            />
          </div>
        </div>

        {/* Center Mapping Area */}
        <div className="flex-1 flex flex-col min-w-0 p-3 sm:p-4 bg-high-bg space-y-3 sm:space-y-4 h-full overflow-hidden relative">
          
          {/* Main Map with Toolbar */}
          <div className="flex-1 flex flex-col min-h-[300px] relative">
            
            {/* Map Header Toolbar */}
            <div className="bg-high-darker border border-high-border border-b-0 rounded-t-xl px-4 py-2 flex items-center justify-between gap-4 shrink-0">
              <div className="flex items-center space-x-2">
                <Map className="w-4 h-4 text-high-accent" />
                <span className="text-[10px] sm:text-xs font-bold text-high-accent tracking-widest uppercase">GIS Canvas</span>
              </div>
              
              {/* Basemap Selection */}
              <div className="flex items-center space-x-1.5 text-xs">
                <select
                  value={basemap}
                  onChange={(e) => setBasemap(e.target.value as BasemapType)}
                  className="bg-high-bg border border-high-border text-high-text rounded px-1.5 py-0.5 focus:outline-none focus:border-high-accent font-bold text-[10px]"
                >
                  <option value="osm">Standard Streets (OSM)</option>
                  <option value="satellite">High-Res Satellite (Esri)</option>
                  <option value="light">CartoDB Light Neutrals</option>
                  <option value="dark">CartoDB Dark Matter</option>
                  <option value="terrain">Topographic/Terrain</option>
                  <option value="none">None (Hide Basemap Tiles)</option>
                </select>
              </div>
            </div>

            {/* Map Canvas */}
            <div className="flex-1 min-h-0 relative">
              <MapComponent
                layers={layers}
                visibleLayerIds={visibleLayerIds}
                highlightedFeature={selectedFeature}
                onFeatureSelect={handleFeatureSelect}
                basemap={basemap}
                onCoordinatesChange={(lat, lng) => setCursorCoords({ lat, lng })}
                zoomLayerRequest={zoomLayerRequest}
              />

              {/* Floating Mobile Sidebar Trigger (Layers) */}
              {!mobileLeftPanelOpen && (
                <button
                  onClick={() => setMobileLeftPanelOpen(true)}
                  className="lg:hidden absolute top-4 left-4 z-[999] p-3 bg-high-darker/95 border border-high-border rounded-xl text-high-accent shadow-lg hover:bg-high-border transition-all flex items-center space-x-1.5 backdrop-blur-xs font-bold"
                >
                  <Layers className="w-4 h-4" />
                  <span className="text-[9px] uppercase tracking-wider">Layers</span>
                  {layers.length > 0 && (
                    <span className="bg-high-accent text-high-bg text-[8px] font-extrabold px-1.5 py-0.2 rounded-full">
                      {layers.length}
                    </span>
                  )}
                </button>
              )}

              {/* Floating Mobile Sidebar Trigger (Details) */}
              {selectedFeature && !mobileRightPanelOpen && (
                <button
                  onClick={() => setMobileRightPanelOpen(true)}
                  className="lg:hidden absolute top-4 right-14 z-[999] p-3 bg-high-darker/95 border border-high-border rounded-xl text-high-accent shadow-lg hover:bg-high-border transition-all flex items-center space-x-1.5 backdrop-blur-xs font-bold"
                >
                  <Info className="w-4 h-4" />
                  <span className="text-[9px] uppercase tracking-wider">Details</span>
                </button>
              )}
            </div>

            {/* Status / Coordinate Bar */}
            <div className="bg-high-darker border border-high-border border-t-0 rounded-b-xl px-4 py-1 flex items-center justify-between text-[9px] text-high-teal select-none font-mono shrink-0">
              <div className="flex items-center space-x-2.5 font-semibold">
                <span>Layers: {layers.length}</span>
                <span>Active: {visibleLayerIds.length}</span>
              </div>
              <div className="font-semibold text-right truncate max-w-[50%]">
                <span>Lat: {cursorCoords.lat.toFixed(4)}, Lng: {cursorCoords.lng.toFixed(4)}</span>
              </div>
            </div>
          </div>

          {/* Bottom Attribute Table (QGIS style) */}
          <div className="fixed bottom-0 left-0 right-0 z-[1040] px-3 pb-3 lg:relative lg:bottom-auto lg:left-auto lg:right-auto lg:p-0 lg:z-0 shrink-0">
            <AttributeTable
              layer={activeLayer}
              onFeatureSelect={handleFeatureSelect}
              selectedFeatureId={selectedFeature?.id || null}
            />
          </div>
        </div>

        {/* Right Drawer (Responsive Details Panel) */}
        <div className={`fixed inset-y-0 right-0 z-[1100] w-80 max-w-[85vw] flex flex-col p-4 border-l border-high-border bg-high-darker transition-transform duration-300 transform lg:relative lg:translate-x-0 lg:z-0 lg:shadow-none lg:w-80 lg:max-w-none lg:h-full lg:overflow-y-auto lg:p-4 ${
          mobileRightPanelOpen ? 'translate-x-0' : 'translate-x-full'
        }`}>
          <FeatureDetails
            feature={selectedFeature}
            layer={selectedFeatureLayer}
            onClose={handleCloseDetails}
          />
        </div>
      </main>

      {/* Drawer Backdrop Overlay */}
      {(mobileLeftPanelOpen || mobileRightPanelOpen) && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/60 z-[1050] backdrop-blur-xs transition-opacity duration-300"
          onClick={() => {
            setMobileLeftPanelOpen(false);
            setMobileRightPanelOpen(false);
          }}
        />
      )}

      {/* Full Screen Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-high-darker/80 backdrop-blur-sm z-[2000] flex flex-col items-center justify-center">
          <div className="bg-high-bg border border-high-border p-6 rounded-2xl flex flex-col items-center max-w-xs text-center shadow-2xl">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-high-accent mb-3.5"></div>
            <p className="text-xs font-bold text-high-text uppercase tracking-widest font-mono">Processing Spatial Layers</p>
            <p className="text-[10px] text-high-teal mt-1.5 leading-relaxed font-mono">Reading files, extracting coordinates, and mapping shapes to client-side memory...</p>
          </div>
        </div>
      )}
    </div>
  );
}

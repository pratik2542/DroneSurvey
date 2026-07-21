import { useState, useMemo } from 'react';
import { KmlFeature, KmlLayer } from '../types';
import { 
  X, 
  MapPin, 
  GitCommit, 
  Box, 
  Database,
  Search, 
  Copy, 
  Check, 
  Info,
  Layers,
  MapPinHouse,
<<<<<<< HEAD
  Globe,
  Image
=======
  Globe
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
} from 'lucide-react';

interface FeatureDetailsProps {
  feature: KmlFeature | null;
  layer: KmlLayer | null;
  onClose: () => void;
}

export default function FeatureDetails({
  feature,
  layer,
  onClose,
}: FeatureDetailsProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Reset search query when feature changes
  useMemo(() => {
    setSearchQuery('');
    setCopiedKey(null);
  }, [feature?.id]);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard.writeText(value);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const filteredProperties = useMemo(() => {
    if (!feature) return [];
    
    return Object.entries(feature.properties).filter(([key, val]) => {
      const q = searchQuery.toLowerCase();
      return key.toLowerCase().includes(q) || val.toLowerCase().includes(q);
    });
  }, [feature, searchQuery]);

  if (!feature) {
    return (
      <div className="flex flex-col h-full bg-high-bg rounded-xl border border-high-border overflow-hidden shadow-lg">
        <div className="px-4 py-3 border-b border-high-border bg-high-darker flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Info className="w-4 h-4 text-high-accent" />
            <h2 className="text-xs font-bold text-high-accent tracking-widest uppercase">Feature Properties</h2>
          </div>
        </div>
        <div className="flex-grow flex flex-col items-center justify-center p-6 text-center bg-high-bg">
          <Info className="w-8 h-8 text-high-border stroke-[1.5] mb-2" />
          <p className="text-xs text-high-text font-medium">No feature selected.</p>
          <p className="text-[10px] text-high-teal font-mono mt-1 max-w-48">Click on map markers, vectors, or browse the active layers' features to inspect properties.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-high-bg rounded-xl border border-high-border overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3.5 border-b border-high-border bg-high-darker flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center space-x-2 text-[10px] font-bold text-high-accent uppercase tracking-widest">
            <Layers className="w-3 h-3" />
            <span className="truncate">{layer?.name || 'Layer'}</span>
          </div>
          <h2 className="text-sm font-bold text-high-text truncate mt-0.5" title={feature.name}>
            {feature.name || 'Unnamed Placemark'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded-full text-high-teal hover:bg-high-border hover:text-high-accent transition-colors ml-2"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-high-bg">
        {/* Core Spatial Attributes */}
        <div className="bg-high-darker border border-high-border rounded-lg p-3 space-y-2.5">
          <h3 className="text-[10px] font-bold text-high-teal uppercase tracking-widest font-mono">Spatial Metadata</h3>
          
          <div className="grid grid-cols-2 gap-3 text-[11px] font-semibold">
            <div>
              <span className="block text-[10px] text-high-teal/60 font-medium">Geometry Type</span>
              <span className="font-bold text-high-text flex items-center space-x-1 mt-0.5">
                {feature.geometryType === 'Point' && <MapPin className="w-3 h-3 text-high-accent" />}
                {feature.geometryType === 'LineString' && <GitCommit className="w-3 h-3 text-high-accent" />}
                {feature.geometryType === 'Polygon' && <Box className="w-3 h-3 text-high-accent" />}
<<<<<<< HEAD
                {feature.geometryType === 'GroundOverlay' && <Image className="w-3 h-3 text-high-accent" />}
=======
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
                {feature.geometryType === 'MultiGeometry' && <Layers className="w-3 h-3 text-high-accent" />}
                <span>{feature.geometryType}</span>
              </span>
            </div>

            <div>
              <span className="block text-[10px] text-high-teal/60 font-medium">Attributes Count</span>
              <span className="font-bold text-high-text mt-0.5 block">
                {Object.keys(feature.properties).length} items
              </span>
            </div>
          </div>

          {/* Coordinate Display */}
          {feature.bounds && (
            <div className="border-t border-high-border pt-2">
              <span className="block text-[10px] text-high-teal/60 font-medium mb-1 font-mono">Bounding Coordinates</span>
              <div className="grid grid-cols-2 gap-1.5 font-mono text-[9px] text-high-teal bg-high-bg p-1.5 rounded border border-high-border">
                <div>
                  <span className="text-high-text/40">Min Lat:</span> {feature.bounds[0].toFixed(5)}
                </div>
                <div>
                  <span className="text-high-text/40">Min Lng:</span> {feature.bounds[1].toFixed(5)}
                </div>
                <div>
                  <span className="text-high-text/40">Max Lat:</span> {feature.bounds[2].toFixed(5)}
                </div>
                <div>
                  <span className="text-high-text/40">Max Lng:</span> {feature.bounds[3].toFixed(5)}
                </div>
              </div>
            </div>
          )}

          {feature.geometryType === 'Point' && (
            <div className="border-t border-high-border pt-2">
              <span className="block text-[10px] text-high-teal/60 font-medium mb-1 font-mono">Point Coordinates</span>
              <div className="font-mono text-[9px] text-high-teal bg-high-bg p-1.5 rounded border border-high-border flex items-center justify-between">
                <span>Lat: {feature.coordinates[0].toFixed(6)}, Lng: {feature.coordinates[1].toFixed(6)}</span>
                <button
                  onClick={() => handleCopy('coords', `${feature.coordinates[0]},${feature.coordinates[1]}`)}
                  className="text-high-teal hover:text-high-accent transition-colors"
                  title="Copy Lat,Lng"
                >
                  {copiedKey === 'coords' ? <Check className="w-3 h-3 text-high-accent font-bold" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>
          )}
        </div>

<<<<<<< HEAD
        {/* Feature KML Description (If present and not generic placeholder text) */}
        {feature.description && ![
          'unknown point feature',
          'unknown line feature',
          'unknown polygon feature',
          'unknown area feature',
          'unknown feature',
          'placemark'
        ].includes(feature.description.trim().toLowerCase()) && (
=======
        {/* Feature KML Description (If present) */}
        {feature.description && (
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
          <div className="space-y-1">
            <h3 className="text-[10px] font-bold text-high-teal uppercase tracking-widest font-mono">KML Description</h3>
            <div 
              className="p-3 bg-high-darker border border-high-border rounded-lg text-xs text-high-text max-h-48 overflow-y-auto whitespace-pre-wrap break-words prose prose-sm leading-relaxed"
              dangerouslySetInnerHTML={{ 
                __html: feature.description.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Simple script sanitizer
              }}
            />
          </div>
        )}

        {/* ExtendedData Properties Table */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-bold text-high-teal uppercase tracking-widest font-mono">Attributes Table ({Object.keys(feature.properties).length})</h3>
          </div>

          {Object.keys(feature.properties).length === 0 ? (
            <p className="text-[11px] text-high-teal/60 italic font-mono">No structured attribute fields (ExtendedData) available for this feature.</p>
          ) : (
            <div className="space-y-2">
              {/* Table search filter */}
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-high-teal" />
                <input
                  type="text"
                  placeholder="Filter attributes..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-high-darker border border-high-border rounded-md focus:outline-none focus:border-high-accent font-semibold text-high-text placeholder:text-high-teal/40"
                />
              </div>

              {/* Attributes Grid List */}
              <div className="border border-high-border rounded-lg overflow-hidden max-h-80 overflow-y-auto bg-high-darker">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="bg-high-darker text-high-teal border-b border-high-border font-bold">
                      <th className="px-3 py-2 w-1/3 font-mono text-[10px] uppercase tracking-wider">Field</th>
                      <th className="px-3 py-2 w-2/3 font-mono text-[10px] uppercase tracking-wider">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-high-border font-semibold text-high-text">
                    {filteredProperties.length === 0 ? (
                      <tr>
                        <td colSpan={2} className="px-3 py-4 text-center text-high-teal italic bg-high-bg">
                          No matching attribute fields
                        </td>
                      </tr>
                    ) : (
                      filteredProperties.map(([key, val]) => (
                        <tr key={key} className="hover:bg-high-border/20 group bg-high-bg transition-colors">
                          <td className="px-3 py-2 font-mono text-[10px] text-high-teal break-all select-all">
                            {key}
                          </td>
                          <td className="px-3 py-2 text-high-text break-all pr-8 relative">
                            <span>{val || <span className="text-high-teal/40 italic font-normal">null</span>}</span>
                            <button
                              onClick={() => handleCopy(key, val)}
                              className="absolute right-2 top-1.5 p-1 rounded opacity-0 group-hover:opacity-100 hover:bg-high-darker text-high-teal hover:text-high-accent transition-all"
                              title="Copy value"
                            >
                              {copiedKey === key ? (
                                <Check className="w-3 h-3 text-high-accent font-bold" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

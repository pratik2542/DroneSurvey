import { useState, useMemo } from 'react';
import { KmlLayer, KmlFeature, GeometryType } from '../types';
import { 
  Search, 
  MapPin, 
  GitCommit, 
  Box, 
  Database,
  Layers,
  ChevronRight,
  Filter
} from 'lucide-react';

interface FeatureListProps {
  layer: KmlLayer | null;
  onFeatureSelect: (feature: KmlFeature, layer: KmlLayer) => void;
  selectedFeatureId: string | null;
}

export default function FeatureList({
  layer,
  onFeatureSelect,
  selectedFeatureId,
}: FeatureListProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<GeometryType | 'All'>('All');

  // Clear query and filter when layer changes
  useMemo(() => {
    setSearchQuery('');
    setSelectedTypeFilter('All');
  }, [layer?.id]);

  const filteredFeatures = useMemo(() => {
    if (!layer) return [];
    
    return layer.features.filter((feature) => {
      // 1. Text filter
      const matchesSearch = 
        feature.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        feature.description.toLowerCase().includes(searchQuery.toLowerCase());
      
      // 2. Geometry type filter
      const matchesType = 
        selectedTypeFilter === 'All' || 
        feature.geometryType === selectedTypeFilter;
      
      return matchesSearch && matchesType;
    });
  }, [layer, searchQuery, selectedTypeFilter]);

  const getGeometryIcon = (type: GeometryType) => {
    switch (type) {
      case 'Point':
        return <MapPin className="w-3.5 h-3.5 text-blue-500" />;
      case 'LineString':
        return <GitCommit className="w-3.5 h-3.5 text-emerald-500" />;
      case 'Polygon':
        return <Box className="w-3.5 h-3.5 text-amber-500" />;
      case 'MultiGeometry':
        return <Layers className="w-3.5 h-3.5 text-indigo-500" />;
      default:
        return <Database className="w-3.5 h-3.5 text-slate-400" />;
    }
  };

  const geometryTypesInLayer = useMemo(() => {
    if (!layer) return [];
    const types = new Set<GeometryType>();
    layer.features.forEach(f => types.add(f.geometryType));
    return Array.from(types);
  }, [layer]);

  if (!layer) {
    return (
      <div className="flex flex-col h-full bg-high-bg rounded-xl border border-high-border overflow-hidden shadow-lg">
        <div className="px-4 py-3 border-b border-high-border bg-high-darker flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-high-accent" />
            <h2 className="text-xs font-bold text-high-accent tracking-widest uppercase">Features</h2>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center text-center p-4 bg-high-bg">
          <Layers className="w-8 h-8 text-high-border stroke-[1.5] mb-2" />
          <p className="text-xs text-high-text font-medium">Select a layer to browse individual features.</p>
          <p className="text-[10px] text-high-teal font-mono mt-1">Interactive query logs appear here.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-high-bg rounded-xl border border-high-border overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-high-border bg-high-darker flex flex-col space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 min-w-0">
            <Layers className="w-4 h-4 text-high-accent flex-shrink-0" />
            <h2 className="text-xs font-bold text-high-text tracking-wider uppercase truncate">
              {layer.name} ({layer.features.length})
            </h2>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-high-teal" />
          <input
            type="text"
            placeholder="Search feature names, attributes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 text-xs bg-high-bg border border-high-border rounded-lg focus:outline-none focus:border-high-accent transition-colors placeholder:text-high-teal/40 font-semibold text-high-text"
          />
        </div>

        {/* Type filters */}
        {geometryTypesInLayer.length > 1 && (
          <div className="flex items-center space-x-1.5 pt-1 overflow-x-auto select-none no-scrollbar">
            <button
              onClick={() => setSelectedTypeFilter('All')}
              className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all border ${
                selectedTypeFilter === 'All'
                  ? 'bg-high-accent text-high-bg border-high-accent'
                  : 'bg-high-bg text-high-teal border-high-border hover:bg-high-border/30'
              }`}
            >
              All
            </button>
            {geometryTypesInLayer.map((type) => (
              <button
                key={type}
                onClick={() => setSelectedTypeFilter(type)}
                className={`px-2 py-0.5 rounded text-[10px] font-bold whitespace-nowrap transition-all border ${
                  selectedTypeFilter === type
                    ? 'bg-high-accent text-high-bg border-high-accent'
                    : 'bg-high-bg text-high-teal border-high-border hover:bg-high-border/30'
                }`}
              >
                {type}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Feature List Scroll */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-high-bg">
        {filteredFeatures.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-high-text px-4">
            <Filter className="w-6 h-6 text-high-border mb-1.5" />
            <p className="text-xs font-bold">No matching features found</p>
            <p className="text-[10px] text-high-teal font-mono mt-0.5">Try adjusting your query or filter tags.</p>
          </div>
        ) : (
          filteredFeatures.map((feature) => {
            const isSelected = selectedFeatureId === feature.id;
            return (
              <button
                key={feature.id}
                onClick={() => onFeatureSelect(feature, layer)}
                className={`w-full text-left flex items-start space-x-2.5 p-2 rounded-lg border transition-all ${
                  isSelected
                    ? 'bg-high-border border-high-accent shadow-md'
                    : 'bg-high-bg border-high-border hover:border-high-teal hover:bg-high-border/20'
                }`}
              >
                {/* Visual Geometry Indicator */}
                <div className="p-1 bg-high-darker border border-high-border rounded-md flex-shrink-0 mt-0.5">
                  {getGeometryIcon(feature.geometryType)}
                </div>

                {/* Text Metadata */}
                <div className="flex-1 min-w-0 select-none">
                  <div className="text-xs font-bold text-high-text truncate">
                    {feature.name || 'Unnamed Placemark'}
                  </div>
                  <div className="text-[10px] text-high-teal/80 font-mono font-medium truncate">
                    Type: {feature.geometryType}
                    {Object.keys(feature.properties).length > 0 && (
                      <span className="text-high-accent font-bold">
                        {' '}
                        • {Object.keys(feature.properties).length} attrs
                      </span>
                    )}
                  </div>
                </div>

                <ChevronRight className={`w-3.5 h-3.5 text-high-teal self-center transition-transform ${
                  isSelected ? 'rotate-90 text-high-accent' : ''
                }`} />
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

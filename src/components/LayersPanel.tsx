import React, { useState } from 'react';
import { KmlLayer } from '../types';
import { 
  Eye, 
  EyeOff, 
  Trash2, 
  Settings, 
  MapPin, 
  ChevronRight, 
  FileCode, 
  Maximize2,
  FolderOpen,
  Edit3,
  Check
} from 'lucide-react';

interface LayersPanelProps {
  layers: KmlLayer[];
  visibleLayerIds: string[];
  onToggleVisibility: (layerId: string) => void;
  onDeleteLayer: (layerId: string) => void;
  onRenameLayer: (layerId: string, newName: string) => void;
  onUpdateLayerColor: (layerId: string, color: string) => void;
  onZoomToLayer: (layer: KmlLayer) => void;
  selectedLayerId: string | null;
  onSelectLayer: (layerId: string) => void;
}

export default function LayersPanel({
  layers,
  visibleLayerIds,
  onToggleVisibility,
  onDeleteLayer,
  onRenameLayer,
  onUpdateLayerColor,
  onZoomToLayer,
  selectedLayerId,
  onSelectLayer,
}: LayersPanelProps) {
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [showStylePicker, setShowStylePicker] = useState<string | null>(null);

  const startRename = (layer: KmlLayer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingLayerId(layer.id);
    setEditName(layer.name);
  };

  const saveRename = (layerId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (editName.trim()) {
      onRenameLayer(layerId, editName.trim());
    }
    setEditingLayerId(null);
  };

  const getGeometryCounts = (layer: KmlLayer) => {
    const counts = { Point: 0, LineString: 0, Polygon: 0, MultiGeometry: 0, Unknown: 0 };
    layer.features.forEach(f => {
      if (counts[f.geometryType] !== undefined) {
        counts[f.geometryType]++;
      } else {
        counts.Unknown++;
      }
    });
    return counts;
  };

  const PRESET_COLORS = [
    '#3B82F6', // Blue
    '#10B981', // Emerald
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Purple
    '#EC4899', // Pink
    '#06B6D4', // Cyan
    '#14B8A6', // Teal
    '#F43F5E', // Rose
    '#64748B', // Slate
  ];

  return (
    <div className="flex flex-col h-full bg-high-bg rounded-xl border border-high-border overflow-hidden shadow-lg">
      {/* Header */}
      <div className="px-4 py-3 border-b border-high-border flex items-center justify-between bg-high-darker">
        <div className="flex items-center space-x-2">
          <FolderOpen className="w-4 h-4 text-high-accent" />
          <h2 className="text-xs font-bold text-high-accent tracking-widest uppercase">Layers ({layers.length})</h2>
        </div>
      </div>

      {/* Layers List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-high-bg">
        {layers.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center px-4">
            <FileCode className="w-8 h-8 text-high-border stroke-[1.5] mb-2" />
            <p className="text-xs text-high-text font-medium">No geospatial layers loaded yet.</p>
            <p className="text-[10px] text-high-teal mt-1 max-w-44 font-mono">Drag & drop or upload a KMZ/KML file to start mapping!</p>
          </div>
        ) : (
          layers.map((layer) => {
            const isVisible = visibleLayerIds.includes(layer.id);
            const isSelected = selectedLayerId === layer.id;
            const geomCounts = getGeometryCounts(layer);
            const activeGeomStrings = Object.entries(geomCounts)
              .filter(([_, val]) => val > 0)
              .map(([key, val]) => `${val} ${key}${val > 1 ? 's' : ''}`);

            return (
              <div
                key={layer.id}
<<<<<<< HEAD
                onClick={() => {
                  onSelectLayer(layer.id);
                  if (isVisible) {
                    onZoomToLayer(layer);
                  }
                }}
=======
                onClick={() => onSelectLayer(layer.id)}
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
                className={`group flex flex-col p-3 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-high-border border-high-accent shadow-md'
                    : 'bg-high-bg border-high-border hover:border-high-teal hover:bg-high-border/20'
                }`}
              >
                {/* Main Row */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                    {/* Layer Base Color Badge */}
                    <div 
                      className="w-3 h-3 rounded-full flex-shrink-0 border border-white/20 shadow-sm transition-transform hover:scale-110"
                      style={{ backgroundColor: layer.color }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setShowStylePicker(showStylePicker === layer.id ? null : layer.id);
                      }}
                      title="Click to change style color"
                    />

                    {editingLayerId === layer.id ? (
                      <div className="flex items-center space-x-1 flex-1" onClick={e => e.stopPropagation()}>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="px-1.5 py-0.5 text-xs text-high-text bg-high-darker border border-high-border rounded focus:outline-none focus:ring-1 focus:ring-high-accent font-medium w-full"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveRename(layer.id, e as any);
                            if (e.key === 'Escape') setEditingLayerId(null);
                          }}
                        />
                        <button
                          onClick={(e) => saveRename(layer.id, e)}
                          className="p-1 text-high-accent hover:bg-high-border rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="text-xs font-bold text-high-text truncate select-none">
                        {layer.name}
                      </span>
                    )}
                  </div>

                  {/* Actions Panel */}
                  <div className="flex items-center space-x-1 ml-2 flex-shrink-0" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onToggleVisibility(layer.id)}
                      className={`p-1 rounded transition-colors ${
                        isVisible 
                          ? 'text-high-accent hover:bg-high-bg/50 hover:text-white' 
                          : 'text-high-teal/40 hover:bg-high-bg/50 hover:text-high-accent'
                      }`}
                      title={isVisible ? 'Hide layer' : 'Show layer'}
                    >
                      {isVisible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                    </button>

<<<<<<< HEAD
                     <button
                      onClick={() => onZoomToLayer(layer)}
                      disabled={!isVisible || (layer.features.length === 0 && !layer.bounds)}
                      className={`p-1 rounded transition-colors ${
                        isVisible && (layer.features.length > 0 || layer.bounds)
=======
                    <button
                      onClick={() => onZoomToLayer(layer)}
                      disabled={!isVisible || layer.features.length === 0}
                      className={`p-1 rounded transition-colors ${
                        isVisible && layer.features.length > 0
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
                          ? 'text-high-teal hover:bg-high-bg/50 hover:text-high-accent'
                          : 'text-high-border cursor-not-allowed'
                      }`}
                      title="Fit map bounds to layer"
                    >
                      <Maximize2 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={(e) => startRename(layer, e)}
                      className="p-1 text-high-teal/70 hover:bg-high-bg/50 hover:text-high-accent rounded transition-colors"
                      title="Rename layer"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>

                    <button
                      onClick={() => onDeleteLayer(layer.id)}
                      className="p-1 text-high-teal/50 hover:bg-rose-950/40 hover:text-rose-400 rounded transition-colors"
                      title="Delete layer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Layer Meta Info */}
                <div className="mt-1.5 pl-5 flex flex-col space-y-0.5 text-[10px] text-high-teal select-none font-mono">
                  <div className="flex items-center space-x-2 truncate">
<<<<<<< HEAD
                    <span>{layer.tileUrl ? 'Service Layer' : `${layer.fileName} (${layer.fileSize})`}</span>
                  </div>
                  <div className="truncate text-high-text/70 font-semibold">
                    {layer.tileUrl ? 'Raster Tile Server' : (activeGeomStrings.length > 0 ? activeGeomStrings.join(' • ') : '0 features')}
=======
                    <span>{layer.fileName} ({layer.fileSize})</span>
                  </div>
                  <div className="truncate text-high-text/70 font-semibold">
                    {activeGeomStrings.length > 0 ? activeGeomStrings.join(' • ') : '0 features'}
>>>>>>> e776b2d722bc03fd2549b33d87b3683ca5175dc1
                  </div>
                </div>

                {/* Sub-row: Color Picker Popover */}
                {showStylePicker === layer.id && (
                  <div 
                    className="mt-3 p-2 bg-high-darker border border-high-border rounded-lg flex flex-col space-y-1.5"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="text-[9px] text-high-teal font-bold uppercase tracking-widest">Choose Layer Primary Color</div>
                    <div className="grid grid-cols-5 gap-1.5">
                      {PRESET_COLORS.map((color) => (
                        <button
                          key={color}
                          onClick={() => {
                            onUpdateLayerColor(layer.id, color);
                            setShowStylePicker(null);
                          }}
                          className={`w-5 h-5 rounded-md border flex items-center justify-center transition-transform hover:scale-110 shadow-sm ${
                            layer.color === color ? 'border-high-accent' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: color }}
                        >
                          {layer.color === color && (
                            <div className="w-1.5 h-1.5 bg-high-bg rounded-full shadow" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

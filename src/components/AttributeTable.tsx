import { useState, useMemo } from 'react';
import { KmlLayer, KmlFeature } from '../types';
import { 
  ChevronDown, 
  ChevronUp, 
  Table, 
  Search, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight,
  Maximize2,
  FolderMinus,
  MapPin,
  GitCommit,
  Box,
  Layers,
  Sparkles,
  Image
} from 'lucide-react';

interface AttributeTableProps {
  layer: KmlLayer | null;
  onFeatureSelect: (feature: KmlFeature, layer: KmlLayer) => void;
  selectedFeatureId: string | null;
}

export default function AttributeTable({
  layer,
  onFeatureSelect,
  selectedFeatureId,
}: AttributeTableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  // Reset page and query when layer changes
  useMemo(() => {
    setCurrentPage(1);
    setSearchQuery('');
  }, [layer?.id]);

  // Dynamically extract all unique property keys (columns) across all features
  const columns = useMemo(() => {
    if (!layer) return [];
    const keys = new Set<string>();
    layer.features.forEach((feature) => {
      Object.keys(feature.properties).forEach((key) => keys.add(key));
    });
    // Return sorted keys, but prioritizing common identifiers
    return Array.from(keys).sort();
  }, [layer]);

  // Filter features based on search query
  const filteredFeatures = useMemo(() => {
    if (!layer) return [];
    if (!searchQuery.trim()) return layer.features;

    const q = searchQuery.toLowerCase();
    return layer.features.filter((feature) => {
      // Search in name, description
      if (feature.name.toLowerCase().includes(q)) return true;
      if (feature.description.toLowerCase().includes(q)) return true;
      
      // Search in properties
      return Object.values(feature.properties).some((val) => 
        val.toLowerCase().includes(q)
      );
    });
  }, [layer, searchQuery]);

  // Pagination calculations
  const totalItems = filteredFeatures.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedFeatures = useMemo(() => {
    return filteredFeatures.slice(startIndex, startIndex + pageSize);
  }, [filteredFeatures, startIndex, pageSize]);

  const handlePageChange = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const getGeometryBadge = (type: string) => {
    switch (type) {
      case 'Point':
        return <MapPin className="w-3 h-3 text-blue-500" title="Point" />;
      case 'LineString':
        return <GitCommit className="w-3 h-3 text-emerald-500" title="LineString" />;
      case 'Polygon':
        return <Box className="w-3.5 h-3.5 text-amber-500" title="Polygon" />;
      case 'GroundOverlay':
        return <Image className="w-3.5 h-3.5 text-cyan-400" title="GroundOverlay" />;
      default:
        return <Layers className="w-3 h-3 text-indigo-500" title="MultiGeometry/Other" />;
    }
  };

  if (!layer) {
    return null; // Don't show anything if no layer is loaded
  }

  return (
    <div className="bg-high-bg border border-high-border rounded-xl overflow-hidden shadow-lg flex flex-col transition-all duration-300">
      {/* Table Title Bar */}
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="px-4 py-3 bg-high-darker border-b border-high-border flex items-center justify-between cursor-pointer select-none"
      >
        <div className="flex items-center space-x-2.5">
          <Table className="w-4 h-4 text-high-accent" />
          <span className="text-xs font-bold text-high-accent tracking-widest uppercase">
            Attribute Table: {layer.name} ({layer.features.length} records)
          </span>
        </div>
        <div className="flex items-center space-x-2">
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-high-accent" />
          ) : (
            <ChevronUp className="w-4 h-4 text-high-accent" />
          )}
        </div>
      </div>

      {/* Table Content Area */}
      {isOpen && (
        <div className="flex flex-col h-80 bg-high-bg">
          {/* Controls Bar */}
          <div className="px-4 py-3 border-b border-high-border flex flex-col md:flex-row md:items-center justify-between gap-3 bg-high-bg">
            {/* Search */}
            <div className="relative w-full md:w-80">
              <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-high-teal" />
              <input
                type="text"
                placeholder="Search across all attribute records..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-high-darker border border-high-border rounded-lg focus:outline-none focus:border-high-accent font-semibold text-high-text placeholder:text-high-teal/40"
              />
            </div>

            {/* Pagination Controls */}
            <div className="flex items-center justify-between w-full md:w-auto md:justify-start md:space-x-3.5 text-xs text-high-teal font-semibold">
              <div className="flex items-center space-x-1">
                <span>Show:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setCurrentPage(1);
                  }}
                  className="bg-high-darker border border-high-border rounded px-1.5 py-0.5 font-bold text-high-teal focus:outline-none text-[11px]"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                </select>
              </div>

              <span className="font-mono">
                {totalItems === 0 ? '0' : startIndex + 1} - {Math.min(startIndex + pageSize, totalItems)} of {totalItems}
              </span>

              <div className="flex items-center space-x-1">
                <button
                  onClick={() => handlePageChange(1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-high-border/30 text-high-accent disabled:opacity-30 disabled:hover:bg-transparent"
                  title="First Page"
                >
                  <ChevronsLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={currentPage === 1}
                  className="p-1 rounded hover:bg-high-border/30 text-high-accent disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Previous Page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="px-2 py-0.5 bg-high-darker border border-high-border rounded text-high-accent text-[11px] font-bold">
                  {currentPage} / {totalPages}
                </span>
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-high-border/30 text-high-accent disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Next Page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handlePageChange(totalPages)}
                  disabled={currentPage === totalPages}
                  className="p-1 rounded hover:bg-high-border/30 text-high-accent disabled:opacity-30 disabled:hover:bg-transparent"
                  title="Last Page"
                >
                  <ChevronsRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Grid Table */}
          <div className="flex-1 overflow-auto bg-high-bg">
            <table className="w-full text-left border-collapse text-[11px] min-w-full">
              <thead className="bg-high-darker border-b border-high-border text-high-teal font-bold sticky top-0 z-10">
                <tr>
                  <th className="px-4 py-2 border-r border-high-border w-12 text-center bg-high-darker font-mono">#</th>
                  <th className="px-4 py-2 border-r border-high-border w-10 text-center bg-high-darker font-mono">Geom</th>
                  <th className="px-4 py-2 border-r border-high-border w-44 bg-high-darker">Placemark Name</th>
                  {columns.map((col) => (
                    <th key={col} className="px-4 py-2 border-r border-high-border min-w-36 max-w-56 truncate bg-high-darker font-mono" title={col}>
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-high-border font-semibold text-high-text">
                {paginatedFeatures.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 3} className="px-4 py-12 text-center text-high-teal bg-high-bg italic">
                      No attribute records match the current search filters.
                    </td>
                  </tr>
                ) : (
                  paginatedFeatures.map((feature, idx) => {
                    const isSelected = selectedFeatureId === feature.id;
                    return (
                      <tr 
                        key={feature.id}
                        onClick={() => onFeatureSelect(feature, layer)}
                        className={`hover:bg-high-border/20 cursor-pointer border-b border-high-border select-all transition-colors ${
                          isSelected ? 'bg-high-border text-high-accent font-bold' : 'bg-high-bg'
                        }`}
                      >
                        <td className="px-4 py-2.5 text-center border-r border-high-border text-high-teal/70 font-mono text-[10px]">
                          {startIndex + idx + 1}
                        </td>
                        <td className="px-4 py-2.5 text-center border-r border-high-border flex items-center justify-center">
                          {getGeometryBadge(feature.geometryType)}
                        </td>
                        <td className="px-4 py-2.5 border-r border-high-border font-bold text-high-text max-w-44 truncate">
                          {feature.name || <span className="text-high-teal/40 italic">Unnamed</span>}
                        </td>
                        {columns.map((col) => (
                          <td key={col} className="px-4 py-2.5 border-r border-high-border max-w-56 truncate font-mono text-[10px] text-high-text/95" title={feature.properties[col]}>
                            {feature.properties[col] !== undefined ? (
                              feature.properties[col]
                            ) : (
                              <span className="text-high-teal/30 italic">-</span>
                            )}
                          </td>
                        ))}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

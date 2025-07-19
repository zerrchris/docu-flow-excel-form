import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface HighlightPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface DocumentViewerProps {
  file: File | null;
  previewUrl: string | null;
  highlights?: Record<string, HighlightPosition>;
  activeHighlight?: string | null;
  onHighlightClick?: (fieldName: string) => void;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ 
  file, 
  previewUrl, 
  highlights = {}, 
  activeHighlight = null, 
  onHighlightClick 
}) => {
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const isImage = file && file.type.startsWith('image/');
  const isPdf = file && file.type === 'application/pdf';

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
    setPanX(0);
    setPanY(0);
  };
  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
    setPanX(0);
    setPanY(0);
  };
  const handleZoomReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const panSpeed = 50;
    setPanX(prev => prev - e.deltaX * panSpeed / 100);
    setPanY(prev => prev - e.deltaY * panSpeed / 100);
  };

  const getTouchDistance = (touches: React.TouchList) => {
    if (touches.length < 2) return 0;
    const touch1 = touches[0];
    const touch2 = touches[1];
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + 
      Math.pow(touch2.clientY - touch1.clientY, 2)
    );
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      setLastTouchDistance(getTouchDistance(e.touches));
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      e.preventDefault();
      const currentDistance = getTouchDistance(e.touches);
      if (lastTouchDistance > 0) {
        const scale = currentDistance / lastTouchDistance;
        setZoom(prev => Math.max(0.25, Math.min(3, prev * scale)));
      }
      setLastTouchDistance(currentDistance);
    }
  };

  const handleTouchEnd = () => {
    setLastTouchDistance(0);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div className="h-full flex flex-col rounded-l-none lg:rounded-l-none rounded-r-lg bg-card border border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 pb-4 border-b shrink-0 gap-2 sm:gap-0">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Document Preview</h3>
        {file && (
          <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end">
            <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.25} className="p-2 sm:px-3">
              <ZoomOut className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <span className="text-xs sm:text-sm text-muted-foreground min-w-[3rem] sm:min-w-[4rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 3} className="p-2 sm:px-3">
              <ZoomIn className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomReset} className="p-2 sm:px-3">
              <RotateCcw className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="relative flex-1 bg-muted/20 flex items-center justify-center overflow-hidden min-h-0">
        {!file && (
          <div className="text-center p-4 sm:p-8 text-muted-foreground max-w-sm mx-auto">
            <div className="flex flex-col items-center space-y-2">
              <AlertCircle className="h-8 w-8 sm:h-12 sm:w-12 text-muted-foreground/60" />
              <p className="text-base sm:text-lg">No document selected</p>
              <p className="text-sm">Upload a document to preview it here</p>
            </div>
          </div>
        )}
        
        {isImage && previewUrl && (
          <div 
            className="w-full h-full overflow-hidden relative"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="w-full h-full flex items-start justify-center relative"
              onWheel={handleWheel}
            >
              <div className="relative w-full">
                <img 
                  src={previewUrl} 
                  alt="Document Preview" 
                  className="rounded-lg transition-transform duration-200 select-none cursor-grab active:cursor-grabbing w-full"
                  style={{ 
                    transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                    transformOrigin: 'top left',
                    width: '100%',
                    height: 'auto',
                    display: 'block'
                  }}
                  draggable={false}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
                
                {/* Highlight overlays */}
                {Object.entries(highlights).map(([fieldName, position]) => (
                  <div
                    key={fieldName}
                    className={`absolute border-2 transition-all duration-200 cursor-pointer ${
                      activeHighlight === fieldName 
                        ? 'border-primary bg-primary/20 shadow-lg animate-pulse' 
                        : 'border-primary/60 bg-primary/10 hover:bg-primary/20 hover:border-primary'
                    }`}
                    style={{
                      left: `${position.x}%`,
                      top: `${position.y}%`,
                      width: `${position.width}%`,
                      height: `${position.height}%`,
                      // Remove the transform - highlights should move with the image naturally
                    }}
                    onClick={() => onHighlightClick?.(fieldName)}
                    title={`Click to focus ${fieldName}`}
                  >
                    <div className="absolute -top-6 left-0 bg-primary text-primary-foreground text-xs px-2 py-1 rounded whitespace-nowrap shadow-sm">
                      {fieldName}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {isPdf && previewUrl && (
          <div className="w-full h-full overflow-hidden">
            <div 
              className="w-full h-full"
              onWheel={handleWheel}
            >
              <div 
                className="transition-transform duration-200 w-full h-full cursor-grab active:cursor-grabbing relative"
                style={{ 
                  transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              >
                <iframe
                  src={previewUrl}
                  className="w-full h-full border-0"
                  style={{
                    width: '100%',
                    height: '100%',
                    border: 'none',
                    margin: 0,
                    padding: 0
                  }}
                />
                {/* Always visible fallback options */}
                <div className="absolute top-2 right-2 sm:top-4 sm:right-4 flex flex-col sm:flex-row gap-1 sm:gap-2 z-10">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(previewUrl, '_blank')}
                    className="bg-white/90 backdrop-blur-sm text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-2"
                  >
                    Open in Tab
                  </Button>
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const link = document.createElement('a');
                      link.href = previewUrl;
                      link.download = file?.name || 'document.pdf';
                      link.click();
                    }}
                    className="bg-white/90 backdrop-blur-sm text-xs sm:text-sm px-2 py-1 sm:px-3 sm:py-2"
                  >
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {file && !isImage && !isPdf && (
          <div className="text-center p-4 sm:p-8 text-muted-foreground max-w-sm mx-auto">
            <p className="text-base sm:text-lg">Preview not available</p>
            <p className="text-sm mt-2">This file type cannot be previewed</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
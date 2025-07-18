import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface DocumentViewerProps {
  file: File | null;
  previewUrl: string | null;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ file, previewUrl }) => {
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
      <div className="flex items-center justify-between p-6 pb-4 border-b shrink-0">
        <h3 className="text-xl font-semibold text-foreground">Document Preview</h3>
        {file && (
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.25}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 3}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={handleZoomReset}>
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
      <div className="relative flex-1 bg-muted/20 flex items-center justify-center overflow-auto min-h-0">
        {!file && (
          <div className="text-center p-8 text-muted-foreground">
            <div className="flex flex-col items-center space-y-2">
              <AlertCircle className="h-12 w-12 text-muted-foreground/60" />
              <p className="text-lg">No document selected</p>
              <p className="text-sm">Upload a document to preview it here</p>
            </div>
          </div>
        )}
        
        {isImage && previewUrl && (
          <div 
            className="w-full h-full overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="w-full h-full flex items-center justify-center p-6"
              onWheel={handleWheel}
            >
              <img 
                src={previewUrl} 
                alt="Document Preview" 
                className="rounded-lg transition-transform duration-200 max-w-full max-h-full select-none cursor-grab active:cursor-grabbing"
                style={{ 
                  transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                  width: '100%',
                  height: 'auto',
                  objectFit: 'contain'
                }}
                draggable={false}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
            </div>
          </div>
        )}
        
        {isPdf && previewUrl && (
          <div className="absolute inset-0 w-full h-full overflow-hidden">
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
                <embed
                  src={previewUrl}
                  type="application/pdf"
                  className="w-full h-full bg-white"
                  style={{
                    minHeight: '100%'
                  }}
                />
                {/* Always visible fallback options */}
                <div className="absolute top-4 right-4 flex gap-2 z-10">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => window.open(previewUrl, '_blank')}
                    className="bg-white/90 backdrop-blur-sm"
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
                    className="bg-white/90 backdrop-blur-sm"
                  >
                    Download
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {file && !isImage && !isPdf && (
          <div className="text-center p-8 text-muted-foreground">
            <p className="text-lg">Preview not available</p>
            <p className="text-sm mt-2">This file type cannot be previewed</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocumentViewer;
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
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const isImage = file && file.type.startsWith('image/');
  const isPdf = file && file.type === 'application/pdf';

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
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

  

  return (
    <Card className="h-full rounded-l-none lg:rounded-l-none rounded-r-lg">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4">
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
        <div className="relative flex-grow border-t bg-muted/20 flex items-center justify-center overflow-hidden">
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
              className="w-full h-full overflow-auto" 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'hsl(var(--border)) transparent'
              }}
            >
              <div 
                className="flex items-center justify-center min-w-full min-h-full p-6"
                onWheel={handleWheel}
                style={{
                  width: zoom > 1 ? `${zoom * 100}%` : '100%',
                  height: zoom > 1 ? `${zoom * 100}%` : '100%'
                }}
              >
                <img 
                  src={previewUrl} 
                  alt="Document Preview" 
                  className="max-h-[calc(100vh-20rem)] max-w-full object-contain rounded-lg transition-transform duration-200"
                  style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)` }}
                />
              </div>
            </div>
          )}
          
          {isPdf && previewUrl && (
            <div 
              className="w-full h-full overflow-auto" 
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              style={{
                scrollbarWidth: 'thin',
                scrollbarColor: 'hsl(var(--border)) transparent'
              }}
            >
              <div 
                className="flex items-center justify-center min-w-full min-h-full p-6"
                onWheel={handleWheel}
                style={{
                  width: zoom > 1 ? `${zoom * 100}%` : '100%',
                  height: zoom > 1 ? `${zoom * 100}%` : '100%'
                }}
              >
                <div 
                  className="transition-transform duration-200"
                  style={{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)` }}
                >
                  <object
                    data={previewUrl}
                    type="application/pdf"
                    className="w-full h-[calc(100vh-20rem)] rounded-lg border"
                    title="PDF Preview"
                  >
                    <iframe
                      src={previewUrl}
                      className="w-full h-[calc(100vh-20rem)] rounded-lg border"
                      title="PDF Preview Fallback"
                    />
                  </object>
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
    </Card>
  );
};

export default DocumentViewer;
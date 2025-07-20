import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';
import PDFViewer from './PDFViewer';

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

  const openInNewWindow = () => {
    if (!file || !previewUrl) return;
    
    const newWindow = window.open('', '_blank', 'width=1200,height=800,scrollbars=yes,resizable=yes');
    if (newWindow) {
      const fileName = file.name;
      newWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>${fileName} - Document Viewer</title>
          <style>
            body {
              margin: 0;
              padding: 20px;
              font-family: system-ui, -apple-system, sans-serif;
              background: #f8f9fa;
              display: flex;
              flex-direction: column;
              height: 100vh;
            }
            .header {
              background: white;
              padding: 15px;
              border-radius: 8px;
              margin-bottom: 20px;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            }
            .viewer {
              flex: 1;
              background: white;
              border-radius: 8px;
              overflow: hidden;
              box-shadow: 0 1px 3px rgba(0,0,0,0.1);
              display: flex;
              align-items: center;
              justify-content: center;
            }
            img {
              max-width: 100%;
              max-height: 100%;
              object-fit: contain;
            }
            .pdf-container {
              width: 100%;
              height: 100%;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1 style="margin: 0; font-size: 18px; color: #333;">${fileName}</h1>
          </div>
          <div class="viewer">
            ${isPdf ? `<iframe src="${previewUrl}" class="pdf-container" frameborder="0"></iframe>` : 
              `<img src="${previewUrl}" alt="${fileName}" />`}
          </div>
        </body>
        </html>
      `);
      newWindow.document.close();
    }
  };

  // For PDFs, use the dedicated PDF viewer
  if (isPdf && previewUrl) {
    return <PDFViewer file={file} previewUrl={previewUrl} />;
  }

  return (
    <div className="h-full flex flex-col rounded-l-none lg:rounded-l-none rounded-r-lg bg-card border border-border">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 pb-4 border-b shrink-0 gap-2 sm:gap-0">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">Document Preview</h3>
        <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end">
          {file && (
            <Button variant="outline" size="sm" onClick={openInNewWindow} className="p-2 sm:px-3">
              <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4" />
            </Button>
          )}
          {file && isImage && (
            <>
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
            </>
          )}
        </div>
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
            className="w-full h-full overflow-hidden"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <div 
              className="w-full h-full flex items-center justify-center"
              onWheel={handleWheel}
            >
              <img 
                src={previewUrl} 
                alt="Document Preview" 
                className="rounded-lg transition-transform duration-200 select-none cursor-grab active:cursor-grabbing w-full"
                style={{ 
                  transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`
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
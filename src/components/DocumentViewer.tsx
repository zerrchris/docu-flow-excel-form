import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { AlertCircle, RotateCcw, ExternalLink } from 'lucide-react';
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

  const handleZoomChange = (values: number[]) => {
    const newZoom = values[0];
    setZoom(newZoom);
    setPanX(0);
    setPanY(0);
  };

  const handleZoomReset = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Allow normal scrolling; only intercept when user holds Ctrl/Cmd to zoom
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      setZoom(prev => Math.max(0.25, Math.min(5, prev * zoomFactor)));
    }
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
        setZoom(prev => Math.max(0.25, Math.min(5, prev * scale)));
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
            <Button variant="outline" size="sm" onClick={openInNewWindow} className="px-3">
              <span className="text-xs sm:text-sm">Open in new window</span>
              <ExternalLink className="h-3 w-3 sm:h-4 sm:w-4 ml-2" />
            </Button>
          )}
          {file && isImage && (
            <>
              <div className="flex items-center gap-2 min-w-[120px]">
                <span className="text-xs text-muted-foreground">25%</span>
                <Slider
                  value={[zoom]}
                  onValueChange={handleZoomChange}
                  max={5}
                  min={0.25}
                  step={0.25}
                  className="w-16 sm:w-20"
                />
                <span className="text-xs text-muted-foreground">500%</span>
              </div>
              <span className="text-xs sm:text-sm text-muted-foreground min-w-[3rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
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
                  transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                  transformOrigin: 'center',
                  willChange: 'transform'
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
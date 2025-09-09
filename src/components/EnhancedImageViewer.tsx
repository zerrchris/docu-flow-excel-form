import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  Maximize, 
  Minimize,
  Download,
  Monitor,
  Square,
  RefreshCw,
  Move
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface EnhancedImageViewerProps {
  file: File | null;
  previewUrl: string | null;
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-screen';

const EnhancedImageViewer: React.FC<EnhancedImageViewerProps> = ({ file, previewUrl }) => {
  const [scale, setScale] = useState(1);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit-screen');
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [lastTouchDistance, setLastTouchDistance] = useState(0);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  // Reset states when file/previewUrl changes
  useEffect(() => {
    if (previewUrl || file) {
      setLoading(true);
      setError(null);
      setPanX(0);
      setPanY(0);
      setRotation(0);
      setScale(1);
      setZoomMode('fit-screen');
    }
  }, [previewUrl, file]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case '+':
        case '=':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case '-':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case '0':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            resetZoom();
          }
          break;
        case 'r':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            rotate();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-fit zoom calculation
  const calculateFitZoom = useCallback((mode: ZoomMode, imgWidth?: number, imgHeight?: number) => {
    if (!containerRef.current || mode === 'custom') return scale;
    
    const container = containerRef.current;
    const containerWidth = container.clientWidth - 40; // padding
    const containerHeight = container.clientHeight - 100; // header space
    
    if (!imgWidth || !imgHeight) return 1;
    
    // Apply rotation to dimensions
    const rotatedWidth = rotation % 180 === 0 ? imgWidth : imgHeight;
    const rotatedHeight = rotation % 180 === 0 ? imgHeight : imgWidth;
    
    if (mode === 'fit-width') {
      return containerWidth / rotatedWidth;
    } else if (mode === 'fit-screen') {
      const widthRatio = containerWidth / rotatedWidth;
      const heightRatio = containerHeight / rotatedHeight;
      return Math.min(widthRatio, heightRatio);
    }
    
    return scale;
  }, [scale, rotation]);

  // Image load handlers
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    setLoading(false);
    setError(null);
    
    if (zoomMode !== 'custom') {
      const newScale = calculateFitZoom(zoomMode, img.naturalWidth, img.naturalHeight);
      setScale(newScale);
    }
  };

  const handleImageError = () => {
    setError('Failed to load image');
    setLoading(false);
  };

  // Zoom functions
  const zoomIn = () => {
    setZoomMode('custom');
    setScale(prev => Math.min(prev + 0.25, 5));
  };

  const zoomOut = () => {
    setZoomMode('custom');
    setScale(prev => Math.max(prev - 0.25, 0.1));
  };

  const resetZoom = () => {
    setZoomMode('custom');
    setScale(1);
    setPanX(0);
    setPanY(0);
  };

  const setFitWidth = () => {
    setZoomMode('fit-width');
    setPanX(0);
    setPanY(0);
    if (imageSize.width && imageSize.height) {
      const newScale = calculateFitZoom('fit-width', imageSize.width, imageSize.height);
      setScale(newScale);
    }
  };

  const setFitScreen = () => {
    setZoomMode('fit-screen');
    setPanX(0);
    setPanY(0);
    if (imageSize.width && imageSize.height) {
      const newScale = calculateFitZoom('fit-screen', imageSize.width, imageSize.height);
      setScale(newScale);
    }
  };

  // Rotation
  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
    setPanX(0);
    setPanY(0);
    
    // Recalculate zoom if not custom
    if (zoomMode !== 'custom' && imageSize.width && imageSize.height) {
      setTimeout(() => {
        const newScale = calculateFitZoom(zoomMode, imageSize.width, imageSize.height);
        setScale(newScale);
      }, 0);
    }
  };

  // Fullscreen
  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Touch and mouse interactions
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
        const scaleChange = currentDistance / lastTouchDistance;
        setZoomMode('custom');
        setScale(prev => Math.max(0.1, Math.min(5, prev * scaleChange)));
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

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      e.stopPropagation();
      const delta = -e.deltaY;
      const zoomFactor = delta > 0 ? 1.1 : 0.9;
      setZoomMode('custom');
      setScale(prev => Math.max(0.1, Math.min(5, prev * zoomFactor)));
      return;
    }
    // Pan with scroll
    e.preventDefault();
    e.stopPropagation();
    setPanX(prev => prev - e.deltaX);
    setPanY(prev => prev - e.deltaY);
  };

  // Download function
  const handleDownload = () => {
    if (previewUrl) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = file?.name || 'image';
      link.click();
    }
  };

  if (!previewUrl && !file) {
    return (
      <div className="h-full flex items-center justify-center bg-muted/20 rounded-r-lg">
        <div className="text-muted-foreground">No image available</div>
      </div>
    );
  }

  const displayUrl = previewUrl || (file ? URL.createObjectURL(file) : '');

  return (
    <div 
      ref={containerRef}
      className={cn(
        "h-full flex",
        isFullscreen 
          ? "fixed inset-0 z-50 bg-background" 
          : "flex-col rounded-l-none lg:rounded-l-none rounded-r-lg bg-card border border-border"
      )}
    >
      {/* Enhanced Header with controls */}
      <div className="flex flex-col border-b shrink-0 bg-card">
        {/* Main toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 gap-2">
          <h3 className="text-lg font-semibold text-foreground">Image Viewer</h3>
          
          {/* File info */}
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {file && (
              <>
                <span>{file.name}</span>
                {imageSize.width > 0 && (
                  <span>({imageSize.width} × {imageSize.height})</span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Controls toolbar */}
        <div className="flex items-center justify-between p-2 px-4 border-t bg-muted/20">
          {/* Pan indicator */}
          <div className="flex items-center gap-2">
            <Move className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">
              Drag to pan, Ctrl+scroll to zoom
            </span>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <Button 
              variant={zoomMode === 'fit-width' ? 'default' : 'outline'} 
              size="sm" 
              onClick={setFitWidth}
              title="Fit to width"
            >
              <Monitor className="h-4 w-4" />
            </Button>
            <Button 
              variant={zoomMode === 'fit-screen' ? 'default' : 'outline'} 
              size="sm" 
              onClick={setFitScreen}
              title="Fit to screen"
            >
              <Square className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.1}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 5}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetZoom} title="Reset zoom">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Additional controls */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={rotate} title="Rotate 90°">
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFullscreen}>
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Image viewer area */}
      <div className="flex-1 bg-muted/20 relative">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-muted-foreground">Loading image...</div>
          </div>
        )}
        
        {error && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-destructive">{error}</div>
          </div>
        )}
        
        {!loading && !error && displayUrl && (
          <div 
            className="w-full h-full overflow-hidden flex items-center justify-center cursor-grab active:cursor-grabbing"
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            <img 
              ref={imageRef}
              src={displayUrl}
              alt={file?.name || "Image preview"}
              className="transition-transform duration-200 select-none max-w-none"
              style={{ 
                transform: `scale(${scale}) translate(${panX / scale}px, ${panY / scale}px) rotate(${rotation}deg)`,
                transformOrigin: 'center',
                willChange: 'transform'
              }}
              draggable={false}
              onLoad={handleImageLoad}
              onError={handleImageError}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default EnhancedImageViewer;
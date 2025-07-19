import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCcw, 
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Minimize,
  Grid,
  Download
} from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  file: File | null;
  previewUrl: string | null;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file, previewUrl }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pdfDocument, setPdfDocument] = useState<any>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load PDF document
  useEffect(() => {
    if (!previewUrl || !file?.type.includes('pdf')) return;

    setLoading(true);
    setError(null);

    pdfjsLib.getDocument(previewUrl).promise
      .then((pdf) => {
        setPdfDocument(pdf);
        setTotalPages(pdf.numPages);
        setCurrentPage(1);
        generateThumbnails(pdf);
      })
      .catch((err) => {
        console.error('Error loading PDF:', err);
        setError('Failed to load PDF document');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [previewUrl, file]);

  // Render current page
  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    pdfDocument.getPage(currentPage).then((page: any) => {
      const viewport = page.getViewport({ scale });
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      page.render(renderContext);
    });
  }, [pdfDocument, currentPage, scale]);

  // Generate thumbnails
  const generateThumbnails = async (pdf: any) => {
    const thumbs: string[] = [];
    const thumbScale = 0.2;

    for (let i = 1; i <= Math.min(pdf.numPages, 20); i++) { // Limit to 20 thumbnails
      try {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: thumbScale });
        
        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        if (context) {
          await page.render({
            canvasContext: context,
            viewport: viewport,
          }).promise;
          
          thumbs.push(canvas.toDataURL());
        }
      } catch (err) {
        console.error('Error generating thumbnail:', err);
      }
    }
    
    setThumbnails(thumbs);
  };

  // Navigation functions
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
    }
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  // Zoom functions
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1.2);

  // Fullscreen functions
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

  // Download function
  const handleDownload = () => {
    if (previewUrl && file) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = file.name || 'document.pdf';
      link.click();
    }
  };

  if (!file || !file.type.includes('pdf')) {
    return null;
  }

  return (
    <div 
      ref={containerRef}
      className={`h-full flex ${isFullscreen ? 'fixed inset-0 z-50 bg-background' : 'flex-col rounded-l-none lg:rounded-l-none rounded-r-lg bg-card border border-border'}`}
    >
      {/* Header with controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between p-4 sm:p-6 pb-4 border-b shrink-0 gap-2 sm:gap-0 bg-card">
        <h3 className="text-lg sm:text-xl font-semibold text-foreground">PDF Viewer</h3>
        
        <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto justify-end flex-wrap">
          {/* Page navigation */}
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={prevPage} 
              disabled={currentPage <= 1}
              className="p-2"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm text-muted-foreground px-2">
              {currentPage} / {totalPages}
            </span>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={nextPage} 
              disabled={currentPage >= totalPages}
              className="p-2"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5} className="p-2">
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3} className="p-2">
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetZoom} className="p-2">
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>

          {/* Additional controls */}
          <div className="flex items-center gap-1">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowThumbnails(!showThumbnails)}
              className="p-2"
            >
              <Grid className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={toggleFullscreen} className="p-2">
              {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </Button>
            <Button variant="outline" size="sm" onClick={handleDownload} className="p-2">
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Thumbnails sidebar */}
        {showThumbnails && (
          <Card className="w-48 border-r border-border rounded-none">
            <ScrollArea className="h-full p-2">
              <div className="space-y-2">
                {thumbnails.map((thumbnail, index) => (
                  <button
                    key={index}
                    onClick={() => goToPage(index + 1)}
                    className={`w-full border rounded p-1 transition-colors ${
                      currentPage === index + 1 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <img 
                      src={thumbnail} 
                      alt={`Page ${index + 1}`}
                      className="w-full h-auto"
                    />
                    <div className="text-xs text-center mt-1">
                      {index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* PDF canvas area */}
        <div className="flex-1 bg-muted/20 flex items-center justify-center overflow-auto p-4">
          {loading && (
            <div className="text-center">
              <div className="text-muted-foreground">Loading PDF...</div>
            </div>
          )}
          
          {error && (
            <div className="text-center text-destructive">
              <div>{error}</div>
            </div>
          )}
          
          {!loading && !error && (
            <canvas 
              ref={canvasRef}
              className="border border-border shadow-lg bg-white max-w-full max-h-full"
              style={{ 
                display: 'block',
                margin: '0 auto'
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
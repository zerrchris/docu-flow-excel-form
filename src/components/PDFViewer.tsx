import React, { useState, useRef, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
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

// Configure PDF.js worker - use CDN worker for better compatibility
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface PDFViewerProps {
  file: File | null;
  previewUrl: string | null;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ file, previewUrl }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset states when file/previewUrl changes
  useEffect(() => {
    if (previewUrl || (file && file.type.includes('pdf'))) {
      setLoading(true);
      setError(null);
    }
  }, [previewUrl, file]);

  // PDF event handlers
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDF loaded successfully:', numPages, 'pages');
    setTotalPages(numPages);
    setCurrentPage(1);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('Error loading PDF:', error);
    setError('Failed to load PDF document');
    setLoading(false);
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
    if (previewUrl) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = file?.name || 'document.pdf';
      link.click();
    }
  };

  // Check if we have either a file or previewUrl for a PDF
  if (!previewUrl && !file) {
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
                {Array.from({ length: totalPages }, (_, index) => (
                  <button
                    key={index}
                    onClick={() => goToPage(index + 1)}
                    className={`w-full border rounded p-1 transition-colors ${
                      currentPage === index + 1 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Document
                      file={previewUrl || file}
                      loading=""
                      error=""
                    >
                      <Page 
                        pageNumber={index + 1}
                        scale={0.2}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                      />
                    </Document>
                    <div className="text-xs text-center mt-1">
                      {index + 1}
                    </div>
                  </button>
                ))}
              </div>
            </ScrollArea>
          </Card>
        )}

        {/* PDF viewer area */}
        <div className="flex-1 bg-muted/20 relative" onWheel={(e) => e.stopPropagation()}>
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-muted-foreground">Loading PDF...</div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-destructive">{error}</div>
            </div>
          )}
          
          {!loading && !error && (
            <div ref={scrollRef} className="w-full h-full overflow-auto overscroll-contain pdf-scrollable will-change-scroll" onWheelCapture={(e) => e.stopPropagation()}>
              <div className="flex justify-center items-start p-4">
                <Document
                  file={previewUrl || file}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={<div className="text-muted-foreground">Loading PDF...</div>}
                  error={<div className="text-destructive">Failed to load PDF</div>}
                >
                  <Page 
                    pageNumber={currentPage}
                    scale={scale}
                    className="shadow-lg border border-border bg-white will-change-transform"
                    renderAnnotationLayer={scale <= 1.5}
                    renderTextLayer={scale <= 1.5}
                  />
                </Document>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PDFViewer;
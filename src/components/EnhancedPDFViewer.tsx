import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw,
  ChevronLeft, 
  ChevronRight, 
  Maximize, 
  Minimize,
  Grid,
  Download,
  Search,
  Monitor,
  Square,
  RefreshCw,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Configure PDF.js worker - use CDN worker for better compatibility
pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface EnhancedPDFViewerProps {
  file: File | null;
  previewUrl: string | null;
}

type ZoomMode = 'custom' | 'fit-width' | 'fit-page';

const EnhancedPDFViewer: React.FC<EnhancedPDFViewerProps> = ({ file, previewUrl }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [zoomMode, setZoomMode] = useState<ZoomMode>('custom');
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [pageInput, setPageInput] = useState('');
  const [viewMode, setViewMode] = useState<'single' | 'continuous'>('single');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Map<number, HTMLDivElement>>(new Map());

  // Reset states when file/previewUrl changes
  useEffect(() => {
    if (previewUrl || file) {
      console.log('EnhancedPDFViewer: Starting to load PDF', { previewUrl, file: file?.name });
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      setPageInput('');
      
      // Test if the PDF URL is accessible
      if (previewUrl) {
        fetch(previewUrl, { method: 'HEAD' })
          .then(response => {
            console.log('PDF URL accessibility check:', {
              url: previewUrl,
              status: response.status,
              contentType: response.headers.get('content-type')
            });
          })
          .catch(error => {
            console.error('PDF URL accessibility error:', error);
          });
      }
    }
  }, [previewUrl, file]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          prevPage();
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          nextPage();
          break;
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
        case 'f':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            // Focus search input
            const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
            searchInput?.focus();
          }
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-fit zoom calculation
  const calculateFitZoom = useCallback((mode: ZoomMode, pageWidth?: number, pageHeight?: number) => {
    if (!containerRef.current || mode === 'custom') return scale;
    
    const container = containerRef.current;
    const containerWidth = container.clientWidth - 40; // padding
    const containerHeight = container.clientHeight - 100; // header space
    
    if (!pageWidth || !pageHeight) return 1.2;
    
    if (mode === 'fit-width') {
      return containerWidth / pageWidth;
    } else if (mode === 'fit-page') {
      const widthRatio = containerWidth / pageWidth;
      const heightRatio = containerHeight / pageHeight;
      return Math.min(widthRatio, heightRatio);
    }
    
    return scale;
  }, [scale]);

  // PDF event handlers
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('EnhancedPDFViewer: PDF loaded successfully:', numPages, 'pages', { documentSource });
    setTotalPages(numPages);
    setCurrentPage(1);
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('EnhancedPDFViewer: Error loading PDF:', error, { documentSource });
    setError('Failed to load PDF document');
    setLoading(false);
  };

  const onPageLoadSuccess = (page: any) => {
    if (zoomMode !== 'custom') {
      const newScale = calculateFitZoom(zoomMode, page.width, page.height);
      setScale(newScale);
    }
  };

  // Navigation functions
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setPageInput(page.toString());
      
      // Scroll to page in continuous mode
      if (viewMode === 'continuous') {
        const pageElement = pageRefs.current.get(page);
        if (pageElement && scrollRef.current) {
          pageElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }
  };

  const nextPage = () => goToPage(currentPage + 1);
  const prevPage = () => goToPage(currentPage - 1);

  const handlePageInputSubmit = () => {
    const page = parseInt(pageInput);
    if (!isNaN(page)) {
      goToPage(page);
    }
  };

  // Zoom functions
  const zoomIn = () => {
    setZoomMode('custom');
    setScale(prev => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setZoomMode('custom');
    setScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const resetZoom = () => {
    setZoomMode('custom');
    setScale(1.2);
  };

  const setFitWidth = () => {
    setZoomMode('fit-width');
    // Scale will be calculated in onPageLoadSuccess
  };

  const setFitPage = () => {
    setZoomMode('fit-page');
    // Scale will be calculated in onPageLoadSuccess
  };

  // Other functions
  const rotate = () => setRotation(prev => (prev + 90) % 360);

  const toggleFullscreen = () => {
    if (!isFullscreen) {
      containerRef.current?.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  };

  const toggleViewMode = () => {
    setViewMode(prev => prev === 'single' ? 'continuous' : 'single');
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
    console.log('EnhancedPDFViewer: No previewUrl or file provided');
    return null;
  }

  const documentSource = previewUrl || file;
  console.log('EnhancedPDFViewer: Using document source:', documentSource);

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
          <h3 className="text-lg font-semibold text-foreground">PDF Viewer</h3>
          
          {/* Search */}
          <div className="flex items-center gap-2 flex-1 max-w-md">
            <div className="relative flex-1">
              <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search in document..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        {/* Controls toolbar */}
        <div className="flex items-center justify-between p-2 px-4 border-t bg-muted/20">
          {/* Navigation */}
          <div className="flex items-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={prevPage} 
              disabled={currentPage <= 1}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            
            <div className="flex items-center gap-1">
              <Input
                type="text"
                value={pageInput || currentPage}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handlePageInputSubmit()}
                onBlur={handlePageInputSubmit}
                className="w-16 h-8 text-center text-sm"
              />
              <span className="text-sm text-muted-foreground">/ {totalPages}</span>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={nextPage} 
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
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
              variant={zoomMode === 'fit-page' ? 'default' : 'outline'} 
              size="sm" 
              onClick={setFitPage}
              title="Fit to page"
            >
              <Square className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetZoom} title="Reset zoom">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>

          {/* Additional controls */}
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" onClick={rotate} title="Rotate">
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button 
              variant={viewMode === 'continuous' ? 'default' : 'outline'} 
              size="sm" 
              onClick={toggleViewMode}
              title="Toggle continuous view"
            >
              {viewMode === 'continuous' ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            </Button>
            <Button 
              variant={showThumbnails ? 'default' : 'outline'} 
              size="sm" 
              onClick={() => setShowThumbnails(!showThumbnails)}
              title="Toggle thumbnails"
            >
              <Grid className="h-4 w-4" />
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
                    className={cn(
                      "w-full border rounded p-1 transition-colors",
                      currentPage === index + 1 
                        ? 'border-primary bg-primary/10' 
                        : 'border-border hover:border-primary/50'
                    )}
                  >
                    <Document
                      file={documentSource}
                      loading=""
                      error=""
                    >
                      <Page 
                        pageNumber={index + 1}
                        scale={0.2}
                        renderAnnotationLayer={false}
                        renderTextLayer={false}
                        rotate={rotation}
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
        <div className="flex-1 bg-muted/20 relative">
          {loading && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-muted-foreground">Loading PDF...</div>
            </div>
          )}
          
          {error && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-destructive">{error}</div>
            </div>
          )}
          
          {!loading && !error && (
            <div 
              ref={scrollRef} 
              className="w-full h-full overflow-auto overscroll-contain will-change-scroll"
            >
              <div className="flex flex-col items-center p-4 space-y-4">
                <Document
                  file={documentSource}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading={<div className="text-muted-foreground">Loading PDF...</div>}
                  error={<div className="text-destructive">Failed to load PDF</div>}
                >
                  {viewMode === 'continuous' ? (
                    // Continuous view - show all pages
                    Array.from({ length: totalPages }, (_, index) => (
                      <div
                        key={index}
                        ref={(el) => {
                          if (el) pageRefs.current.set(index + 1, el);
                        }}
                        className="mb-4"
                      >
                        <Page 
                          pageNumber={index + 1}
                          scale={scale}
                          className="shadow-lg border border-border bg-white will-change-transform"
                          renderAnnotationLayer={scale <= 1.5}
                          renderTextLayer={scale <= 1.5}
                          rotate={rotation}
                          onLoadSuccess={index === 0 ? onPageLoadSuccess : undefined}
                        />
                      </div>
                    ))
                  ) : (
                    // Single page view
                    <Page 
                      pageNumber={currentPage}
                      scale={scale}
                      className="shadow-lg border border-border bg-white will-change-transform"
                      renderAnnotationLayer={scale <= 1.5}
                      renderTextLayer={scale <= 1.5}
                      rotate={rotation}
                      onLoadSuccess={onPageLoadSuccess}
                    />
                  )}
                </Document>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default EnhancedPDFViewer;

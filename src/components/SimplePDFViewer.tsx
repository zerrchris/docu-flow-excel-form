import React, { useState, useRef, useEffect } from 'react';
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

interface ExtractionMetadata {
  id: string;
  field_name: string;
  extracted_value: string;
  page_number: number;
  bbox_x1: number;
  bbox_y1: number;
  bbox_x2: number;
  bbox_y2: number;
  confidence_score: number;
}

interface SimplePDFViewerProps {
  file: File | null;
  previewUrl: string | null;
  extractionMetadata?: ExtractionMetadata[];
  activeHighlight?: string | null;
  onFieldClick?: (fieldName: string) => void;
}

const SimplePDFViewer: React.FC<SimplePDFViewerProps> = ({ 
  file, 
  previewUrl, 
  extractionMetadata = [], 
  activeHighlight = null,
  onFieldClick 
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState('');
  const pageContainerRef = useRef<HTMLDivElement>(null);
  
  const documentSource = previewUrl || file;

  // Handle highlight navigation and scrolling
  useEffect(() => {
    if (activeHighlight && extractionMetadata.length > 0) {
      const highlightInfo = extractionMetadata.find(m => m.field_name === activeHighlight);
      if (highlightInfo) {
        console.log('🎯 Navigating to highlight:', highlightInfo.field_name, 'on page', highlightInfo.page_number);
        
        // Navigate to the correct page
        if (highlightInfo.page_number !== currentPage) {
          setCurrentPage(highlightInfo.page_number);
          setPageInput(highlightInfo.page_number.toString());
        }
        
        // Scroll to highlight after page loads
        setTimeout(() => {
          const highlightEl = pageContainerRef.current?.querySelector(`[data-highlight="${activeHighlight}"]`);
          if (highlightEl) {
            highlightEl.scrollIntoView({ 
              behavior: 'smooth', 
              block: 'center', 
              inline: 'center' 
            });
            console.log('📍 Scrolled to highlight element');
          }
        }, 500); // Give page time to render
      }
    }
  }, [activeHighlight, extractionMetadata, currentPage]);

  // Get highlights for current page
  const currentPageHighlights = extractionMetadata.filter(
    metadata => metadata.page_number === currentPage
  );

  // Reset states when file/previewUrl changes
  useEffect(() => {
    if (documentSource) {
      console.log('SimplePDFViewer: Starting to load PDF', { previewUrl, file: file?.name, documentSource });
      console.log('SimplePDFViewer: Document source type:', typeof documentSource);
      console.log('SimplePDFViewer: PDF.js worker src:', pdfjs.GlobalWorkerOptions.workerSrc);
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      setPageInput('1');
    }
  }, [previewUrl, file, documentSource]);

  // PDF event handlers with timeout fallback
  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('SimplePDFViewer: PDF loaded successfully:', numPages, 'pages');
    setTotalPages(numPages);
    setCurrentPage(1);
    setPageInput('1');
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('SimplePDFViewer: Error loading PDF:', error);
    console.error('SimplePDFViewer: Error details:', error.message, error.stack);
    setError(`Failed to load PDF: ${error.message}`);
    setLoading(false);
  };

  // Fallback timeout in case callbacks don't fire
  useEffect(() => {
    if (loading && documentSource) {
      const timeout = setTimeout(() => {
        console.warn('SimplePDFViewer: PDF loading timeout, forcing render');
        setTotalPages(1);
        setCurrentPage(1);
        setPageInput('1');
        setLoading(false);
        setError(null); // Clear any error and try to render
      }, 3000); // Reduce timeout to 3 seconds

      return () => clearTimeout(timeout);
    }
  }, [loading, documentSource]);

  // Navigation functions
  const goToPage = (page: number) => {
    if (page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setPageInput(page.toString());
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
  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1.2);

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
  if (!documentSource) {
    console.log('SimplePDFViewer: No document source provided');
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No PDF document available
      </div>
    );
  }

  console.log('SimplePDFViewer: Rendering with document source:', documentSource);

  return (
    <div className="h-full flex flex-col rounded-l-none lg:rounded-l-none rounded-r-lg bg-card border border-border">
      {/* Header with controls */}
      <div className="flex flex-col border-b shrink-0 bg-card">
        <div className="flex items-center justify-between p-4">
          <h3 className="text-lg font-semibold text-foreground">PDF Viewer</h3>
          
          <div className="flex items-center gap-2">
            {/* Navigation */}
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
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handlePageInputSubmit()}
                onBlur={handlePageInputSubmit}
                className="w-16 h-8 text-center text-sm"
              />
              <span className="text-sm text-muted-foreground">/ {totalPages || '?'}</span>
            </div>
            
            <Button 
              variant="outline" 
              size="sm" 
              onClick={nextPage} 
              disabled={currentPage >= totalPages}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {/* Zoom controls */}
            <Button variant="outline" size="sm" onClick={zoomOut} disabled={scale <= 0.5}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs text-muted-foreground min-w-[3rem] text-center">
              {Math.round(scale * 100)}%
            </span>
            <Button variant="outline" size="sm" onClick={zoomIn} disabled={scale >= 3}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={resetZoom}>
              <RefreshCw className="h-4 w-4" />
            </Button>

            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

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
          <div className="w-full h-full overflow-auto overscroll-contain" ref={pageContainerRef}>
            <div className="flex justify-center items-start p-4">
              <div className="relative">
                <Document
                  file={documentSource}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading=""
                  error=""
                  options={{
                    cMapUrl: 'https://unpkg.com/pdfjs-dist@4.4.168/cmaps/',
                    cMapPacked: true,
                    standardFontDataUrl: 'https://unpkg.com/pdfjs-dist@4.4.168/standard_fonts/'
                  }}
                  onItemClick={(item) => console.log('PDF item clicked:', item)}
                  onPassword={(callback) => {
                    console.log('PDF requires password');
                    callback(null); // No password
                  }}
                >
                  <Page 
                    pageNumber={currentPage}
                    scale={scale}
                    className="shadow-lg border border-border bg-white"
                    renderAnnotationLayer={true}
                    renderTextLayer={true}
                    onLoadSuccess={() => console.log('Page loaded successfully')}
                    onLoadError={(error) => console.error('Page load error:', error)}
                    onRenderSuccess={() => console.log('Page rendered successfully')}
                    onRenderError={(error) => console.error('Page render error:', error)}
                  />
                </Document>
                
                {/* Highlight overlays for current page */}
                {currentPageHighlights.map((highlight) => {
                  const isActive = activeHighlight === highlight.field_name;
                  return (
                    <div
                      key={highlight.id}
                      data-highlight={highlight.field_name}
                      className={cn(
                        "absolute pointer-events-auto cursor-pointer border-2 rounded transition-all duration-300",
                        isActive 
                          ? "bg-yellow-300/50 border-yellow-500 shadow-lg z-20" 
                          : "bg-blue-200/30 border-blue-400 hover:bg-blue-300/40 z-10"
                      )}
                      style={{
                        left: `${highlight.bbox_x1 * scale}px`,
                        top: `${highlight.bbox_y1 * scale}px`,
                        width: `${(highlight.bbox_x2 - highlight.bbox_x1) * scale}px`,
                        height: `${(highlight.bbox_y2 - highlight.bbox_y1) * scale}px`,
                      }}
                      onClick={() => {
                        console.log('🖱️ Highlight clicked:', highlight.field_name);
                        onFieldClick?.(highlight.field_name);
                      }}
                      title={`${highlight.field_name}: ${highlight.extracted_value} (Confidence: ${Math.round(highlight.confidence_score * 100)}%)`}
                    >
                      {/* Label for active highlight */}
                      {isActive && (
                        <div className="absolute -top-6 left-0 bg-yellow-500 text-yellow-50 text-xs px-2 py-1 rounded shadow-lg whitespace-nowrap z-30">
                          {highlight.field_name}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default SimplePDFViewer;
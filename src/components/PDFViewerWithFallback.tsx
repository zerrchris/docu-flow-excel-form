import React, { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  ZoomIn, 
  ZoomOut, 
  ChevronLeft, 
  ChevronRight, 
  Download,
  RefreshCw,
  AlertTriangle
} from 'lucide-react';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PDFViewerWithFallbackProps {
  file: File | null;
  previewUrl: string | null;
}

const PDFViewerWithFallback: React.FC<PDFViewerWithFallbackProps> = ({ file, previewUrl }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState('');
  const [useFallback, setUseFallback] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  
  const documentSource = previewUrl || file;

  // Reset states when document changes
  useEffect(() => {
    if (documentSource) {
      console.log('PDFViewerWithFallback: Loading PDF', { previewUrl, file: file?.name });
      console.log('PDFViewerWithFallback: Worker source:', pdfjs.GlobalWorkerOptions.workerSrc);
      setLoading(true);
      setError(null);
      setCurrentPage(1);
      setPageInput('1');
      setUseFallback(false);
    }
  }, [previewUrl, file, documentSource]);

  // Auto-fallback timeout - increased timeout for better reliability
  useEffect(() => {
    if (loading && documentSource && !useFallback) {
      const timeout = setTimeout(() => {
        console.warn('PDFViewerWithFallback: react-pdf timeout after 8 seconds, switching to iframe fallback');
        setUseFallback(true);
        setLoading(false);
        setError(null);
      }, 8000); // Increased from 2 seconds to 8 seconds

      return () => clearTimeout(timeout);
    }
  }, [loading, documentSource, useFallback]);

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    console.log('PDFViewerWithFallback: PDF loaded successfully:', numPages, 'pages');
    setTotalPages(numPages);
    setCurrentPage(1);
    setPageInput('1');
    setLoading(false);
    setError(null);
  };

  const onDocumentLoadError = (error: Error) => {
    console.error('PDFViewerWithFallback: react-pdf failed, switching to fallback:', error);
    setUseFallback(true);
    setLoading(false);
    setError(null);
  };

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

  const zoomIn = () => setScale(prev => Math.min(prev + 0.25, 3));
  const zoomOut = () => setScale(prev => Math.max(prev - 0.25, 0.5));
  const resetZoom = () => setScale(1.2);

  const handleDownload = () => {
    if (previewUrl) {
      const link = document.createElement('a');
      link.href = previewUrl;
      link.download = file?.name || 'document.pdf';
      link.click();
    }
  };

  const retryPdfLoad = () => {
    console.log('PDFViewerWithFallback: Retrying PDF load, attempt:', retryCount + 1);
    setRetryCount(prev => prev + 1);
    setUseFallback(false);
    setLoading(true);
    setError(null);
  };

  const switchToFallback = () => {
    setUseFallback(true);
    setLoading(false);
    setError(null);
  };

  if (!documentSource) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No PDF document available
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col rounded-l-none lg:rounded-l-none rounded-r-lg bg-card border border-border">
      {/* Header with controls */}
      <div className="flex flex-col border-b shrink-0 bg-card">
        <div className="flex items-center justify-between p-4">
          <h3 className="text-lg font-semibold text-foreground">PDF Viewer</h3>
          
          <div className="flex items-center gap-2">
            {!useFallback && (
              <>
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
              </>
            )}

            {/* Switch to fallback button */}
            {!useFallback && !loading && (
              <Button variant="outline" size="sm" onClick={switchToFallback} title="Switch to iframe viewer">
                <AlertTriangle className="h-4 w-4" />
              </Button>
            )}

            {/* Retry button for fallback mode */}
            {useFallback && retryCount < 3 && (
              <Button variant="outline" size="sm" onClick={retryPdfLoad} title="Retry PDF viewer">
                <RefreshCw className="h-4 w-4" />
              </Button>
            )}

            <Button variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* PDF viewer area */}
      <div className="flex-1 bg-muted/20 relative">
        {loading && !useFallback && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-muted-foreground">Loading PDF...</div>
          </div>
        )}
        
        {error && !useFallback && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <div className="text-destructive">{error}</div>
          </div>
        )}
        
        {useFallback ? (
          // Iframe fallback
          <div className="w-full h-full">
            <iframe
              src={`${previewUrl}#toolbar=1&navpanes=1&scrollbar=1`}
              className="w-full h-full border-0"
              title="PDF Document"
              onLoad={() => console.log('PDFViewerWithFallback: Iframe loaded successfully')}
              onError={() => console.error('PDFViewerWithFallback: Iframe failed to load')}
            />
          </div>
        ) : (
          !loading && !error && (
            <div className="w-full h-full overflow-auto overscroll-contain">
              <div className="flex justify-center items-start p-4">
                <Document
                  file={documentSource}
                  onLoadSuccess={onDocumentLoadSuccess}
                  onLoadError={onDocumentLoadError}
                  loading=""
                  error=""
                >
                  <Page 
                    pageNumber={currentPage}
                    scale={scale}
                    className="shadow-lg border border-border bg-white"
                    renderAnnotationLayer={true}
                    renderTextLayer={true}
                    onLoadSuccess={() => console.log('PDFViewerWithFallback: Page loaded successfully')}
                    onLoadError={(error) => console.error('PDFViewerWithFallback: Page load error:', error)}
                  />
                </Document>
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};

export default PDFViewerWithFallback;
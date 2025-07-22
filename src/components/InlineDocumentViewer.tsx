import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';
import { DocumentService } from '@/services/documentService';
import PDFViewer from './PDFViewer';

interface InlineDocumentViewerProps {
  runsheetId: string;
  rowIndex: number;
  onClose: () => void;
}

const InlineDocumentViewer: React.FC<InlineDocumentViewerProps> = ({
  runsheetId,
  rowIndex,
  onClose
}) => {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPdf, setIsPdf] = useState(false);

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const document = await DocumentService.getDocumentForRow(runsheetId, rowIndex);
        if (document) {
          const url = DocumentService.getDocumentUrl(document.file_path);
          setDocumentUrl(url);
          setDocumentName(document.original_filename);
          setIsPdf(document.content_type === 'application/pdf' || document.original_filename.toLowerCase().endsWith('.pdf'));
        } else {
          setError('No document found for this row');
        }
      } catch (error) {
        console.error('Error loading document:', error);
        setError('Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [runsheetId, rowIndex]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleZoomReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const openInNewWindow = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <Card className="w-full h-96 mb-4 border-2 border-primary">
        <div className="flex items-center justify-center h-full">
          <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <span className="ml-2">Loading document...</span>
        </div>
      </Card>
    );
  }

  if (error || !documentUrl) {
    return (
      <Card className="w-full h-96 mb-4 border-2 border-primary">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Document Viewer</h3>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex items-center justify-center h-full text-muted-foreground">
          {error || 'No document available'}
        </div>
      </Card>
    );
  }

  return (
    <Card className="w-full h-[600px] mb-4 border-2 border-primary">
      {/* Header with controls */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold truncate max-w-[300px]">{documentName}</h3>
          <span className="text-sm text-muted-foreground">Row {rowIndex + 1}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {!isPdf && (
            <>
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={openInNewWindow}>
            <ExternalLink className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Document content */}
      <div className="flex-1 overflow-hidden">
        {isPdf ? (
          <PDFViewer file={null} previewUrl={documentUrl} />
        ) : (
          <div className="h-full overflow-auto bg-muted/10 flex items-center justify-center">
            <img
              src={documentUrl}
              alt={documentName}
              className="max-w-full max-h-full object-contain transition-transform duration-200"
              style={{
                transform: `scale(${zoom}) rotate(${rotation}deg)`,
                transformOrigin: 'center'
              }}
              onError={() => setError('Failed to load image')}
            />
          </div>
        )}
      </div>
    </Card>
  );
};

export default InlineDocumentViewer;
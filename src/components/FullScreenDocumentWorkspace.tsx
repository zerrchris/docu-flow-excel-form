import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink } from 'lucide-react';
import { DocumentService } from '@/services/documentService';
import PDFViewer from './PDFViewer';

interface FullScreenDocumentWorkspaceProps {
  runsheetId: string;
  rowIndex: number;
  rowData: Record<string, string>;
  fields: string[];
  onClose: () => void;
  onUpdateRow: (rowIndex: number, data: Record<string, string>) => void;
}

const FullScreenDocumentWorkspace: React.FC<FullScreenDocumentWorkspaceProps> = ({
  runsheetId,
  rowIndex,
  rowData,
  fields,
  onClose,
  onUpdateRow
}) => {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPdf, setIsPdf] = useState(false);
  const [localRowData, setLocalRowData] = useState(rowData);

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

  const handleFieldChange = (field: string, value: string) => {
    const updatedData = { ...localRowData, [field]: value };
    setLocalRowData(updatedData);
    onUpdateRow(rowIndex, updatedData);
  };

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

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Document Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header with controls */}
        <div className="flex items-center justify-between p-4 border-b bg-muted/30 shrink-0">
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
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <span className="ml-2">Loading document...</span>
            </div>
          ) : error || !documentUrl ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              {error || 'No document available'}
            </div>
          ) : isPdf ? (
            <PDFViewer file={null} previewUrl={documentUrl} />
          ) : (
            <ScrollArea className="h-full">
              <div className="min-h-full bg-muted/10 flex items-center justify-center p-4">
                <img
                  src={documentUrl}
                  alt={documentName}
                  className="max-w-full object-contain transition-transform duration-200"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center'
                  }}
                  onError={() => setError('Failed to load image')}
                />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Working Row Area - Fixed at bottom */}
      <Card className="border-t-2 border-primary shrink-0 max-h-48">
        <div className="p-4 border-b bg-muted/20">
          <h4 className="font-semibold">Working Row {rowIndex + 1}</h4>
        </div>
        <ScrollArea className="h-40">
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {fields.map((field) => (
                <div key={field} className="space-y-1">
                  <label className="text-sm font-medium text-muted-foreground">
                    {field}
                  </label>
                  <input
                    type="text"
                    value={localRowData[field] || ''}
                    onChange={(e) => handleFieldChange(field, e.target.value)}
                    className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-ring focus:border-ring"
                    placeholder={`Enter ${field}`}
                  />
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </Card>
    </div>
  );
};

export default FullScreenDocumentWorkspace;
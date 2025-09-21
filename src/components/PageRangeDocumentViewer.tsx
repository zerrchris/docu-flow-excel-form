import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  FileText, 
  Eye, 
  Download, 
  ExternalLink,
  AlertCircle,
  BookOpen
} from 'lucide-react';
import { DocumentService, DocumentRecord } from '@/services/documentService';
import EnhancedPDFViewer from './EnhancedPDFViewer';

interface PageRangeDocumentViewerProps {
  document: DocumentRecord;
  className?: string;
  showMetadata?: boolean;
}

export const PageRangeDocumentViewer: React.FC<PageRangeDocumentViewerProps> = ({
  document,
  className = '',
  showMetadata = true
}) => {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPDFViewer, setShowPDFViewer] = useState(false);

  useEffect(() => {
    const loadDocumentUrl = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const url = await DocumentService.getDocumentUrl(
          document.file_path, 
          document.page_start, 
          document.page_end
        );
        setDocumentUrl(url);
      } catch (err) {
        console.error('Error loading document URL:', err);
        setError(err instanceof Error ? err.message : 'Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    loadDocumentUrl();
  }, [document.file_path, document.page_start, document.page_end]);

  const getPageRangeText = () => {
    if (!document.is_page_range || !document.page_start || !document.page_end) {
      return 'Full Document';
    }
    
    if (document.page_start === document.page_end) {
      return `Page ${document.page_start}`;
    }
    
    return `Pages ${document.page_start}-${document.page_end}`;
  };

  const handleDownload = async () => {
    if (!documentUrl) return;
    
    try {
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = window.document.createElement('a');
      a.href = url;
      a.download = document.stored_filename;
      window.document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      window.document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading document:', error);
    }
  };

  const handleViewExternal = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  if (isLoading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center">
            <div className="animate-pulse flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span>Loading document...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card className={className}>
        {showMetadata && (
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <BookOpen className="h-5 w-5 text-primary" />
                <span className="truncate">{document.original_filename}</span>
              </div>
              <div className="flex gap-2">
                {document.is_page_range && (
                  <Badge variant="secondary">
                    {getPageRangeText()}
                  </Badge>
                )}
                {document.parent_document_id && (
                  <Badge variant="outline">
                    Instrument Section
                  </Badge>
                )}
              </div>
            </CardTitle>
          </CardHeader>
        )}
        
        <CardContent className={showMetadata ? 'pt-0' : 'pt-6'}>
          <div className="space-y-4">
            {showMetadata && (
              <div className="text-sm text-muted-foreground space-y-1">
                <div>File: {document.stored_filename}</div>
                <div>Size: {(document.file_size / 1024 / 1024).toFixed(2)} MB</div>
                <div>Type: {document.content_type}</div>
                {document.is_page_range && (
                  <div>Range: {getPageRangeText()}</div>
                )}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => setShowPDFViewer(true)}
                size="sm"
                disabled={!documentUrl}
              >
                <Eye className="h-4 w-4 mr-1" />
                View
              </Button>
              
              <Button
                variant="outline"
                onClick={handleViewExternal}
                size="sm"
                disabled={!documentUrl}
              >
                <ExternalLink className="h-4 w-4 mr-1" />
                Open
              </Button>
              
              <Button
                variant="outline"
                onClick={handleDownload}
                size="sm"
                disabled={!documentUrl}
              >
                <Download className="h-4 w-4 mr-1" />
                Download
              </Button>
            </div>

            {document.is_page_range && document.parent_document_id && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  This document represents {getPageRangeText()} of a larger multi-instrument document.
                  The displayed content is specific to this instrument section.
                </AlertDescription>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {showPDFViewer && documentUrl && (
        <div className="fixed inset-0 z-50 bg-background">
          <div className="h-full flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h2 className="text-lg font-semibold truncate">
                {document.original_filename} 
                {document.is_page_range && ` (${getPageRangeText()})`}
              </h2>
              <Button
                variant="outline"
                onClick={() => setShowPDFViewer(false)}
              >
                Close
              </Button>
            </div>
            <div className="flex-1">
              <EnhancedPDFViewer
                file={null}
                previewUrl={documentUrl}
              />
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PageRangeDocumentViewer;
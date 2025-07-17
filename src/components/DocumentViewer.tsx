import React from 'react';
import { Card } from '@/components/ui/card';
import { AlertCircle } from 'lucide-react';

interface DocumentViewerProps {
  file: File | null;
  previewUrl: string | null;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ file, previewUrl }) => {
  const isImage = file && file.type.startsWith('image/');
  const isPdf = file && file.type === 'application/pdf';

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-foreground mb-4">Document Preview</h3>
      <div className="relative border border-border rounded-lg min-h-[400px] flex items-center justify-center bg-muted/50">
        {!file && (
          <div className="text-center p-8 text-muted-foreground">
            <div className="flex flex-col items-center space-y-2">
              <AlertCircle className="h-10 w-10 text-muted-foreground/60" />
              <p>No document selected</p>
              <p className="text-xs">Upload a document to preview it here</p>
            </div>
          </div>
        )}
        
        {isImage && previewUrl && (
          <img 
            src={previewUrl} 
            alt="Document Preview" 
            className="max-h-[500px] max-w-full object-contain rounded-lg"
          />
        )}
        
        {isPdf && previewUrl && (
          <iframe
            src={`${previewUrl}#toolbar=0`}
            className="w-full h-[500px] rounded-lg"
            title="PDF Preview"
          />
        )}
        
        {file && !isImage && !isPdf && (
          <div className="text-center p-8 text-muted-foreground">
            <p>Preview not available</p>
            <p className="text-xs mt-1">This file type cannot be previewed</p>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DocumentViewer;
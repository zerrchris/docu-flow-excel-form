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
    <Card className="h-full rounded-l-none lg:rounded-l-none rounded-r-lg">
      <div className="h-full flex flex-col">
        <h3 className="text-xl font-semibold text-foreground p-6 pb-4">Document Preview</h3>
        <div className="relative flex-grow border-t bg-muted/20 flex items-center justify-center">
          {!file && (
            <div className="text-center p-8 text-muted-foreground">
              <div className="flex flex-col items-center space-y-2">
                <AlertCircle className="h-12 w-12 text-muted-foreground/60" />
                <p className="text-lg">No document selected</p>
                <p className="text-sm">Upload a document to preview it here</p>
              </div>
            </div>
          )}
          
          {isImage && previewUrl && (
            <div className="w-full h-full flex items-center justify-center p-6">
              <img 
                src={previewUrl} 
                alt="Document Preview" 
                className="max-h-[calc(100vh-20rem)] max-w-full object-contain rounded-lg"
              />
            </div>
          )}
          
          {isPdf && previewUrl && (
            <iframe
              src={`${previewUrl}#toolbar=0`}
              className="w-full h-[calc(100vh-20rem)] rounded-lg"
              title="PDF Preview"
            />
          )}
          
          {file && !isImage && !isPdf && (
            <div className="text-center p-8 text-muted-foreground">
              <p className="text-lg">Preview not available</p>
              <p className="text-sm mt-2">This file type cannot be previewed</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default DocumentViewer;
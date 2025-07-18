import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AlertCircle, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';

interface DocumentViewerProps {
  file: File | null;
  previewUrl: string | null;
}

const DocumentViewer: React.FC<DocumentViewerProps> = ({ file, previewUrl }) => {
  const [zoom, setZoom] = useState(1);
  const isImage = file && file.type.startsWith('image/');
  const isPdf = file && file.type === 'application/pdf';

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.25));
  const handleZoomReset = () => setZoom(1);

  

  return (
    <Card className="h-full rounded-l-none lg:rounded-l-none rounded-r-lg">
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-6 pb-4">
          <h3 className="text-xl font-semibold text-foreground">Document Preview</h3>
          {file && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={zoom <= 0.25}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm text-muted-foreground min-w-[4rem] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={zoom >= 3}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
        <div className="relative flex-grow border-t bg-muted/20 flex items-center justify-center overflow-auto">
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
                className="max-h-[calc(100vh-20rem)] max-w-full object-contain rounded-lg transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              />
            </div>
          )}
          
          {isPdf && previewUrl && (
            <div className="w-full h-full flex items-center justify-center p-6">
              <div 
                className="transition-transform duration-200"
                style={{ transform: `scale(${zoom})` }}
              >
                <object
                  data={previewUrl}
                  type="application/pdf"
                  className="w-full h-[calc(100vh-20rem)] rounded-lg border"
                  title="PDF Preview"
                >
                  <iframe
                    src={previewUrl}
                    className="w-full h-[calc(100vh-20rem)] rounded-lg border"
                    title="PDF Preview Fallback"
                  />
                </object>
              </div>
            </div>
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
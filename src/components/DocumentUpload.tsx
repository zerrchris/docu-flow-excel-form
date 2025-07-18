import React, { useCallback, useState } from 'react';
import { Upload, File, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile?: File | null;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onFileSelect, selectedFile }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      onFileSelect(files[0]);
    }
  }, [onFileSelect]);

  const handleClear = useCallback(() => {
    onFileSelect(null as any);
  }, [onFileSelect]);

  return (
    <Card className="bg-muted/5 border-2">
      <div className="p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-foreground">Upload Document</h3>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2"
          >
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>

        {isExpanded && (
          <>
            {selectedFile && (
              <div className="flex justify-end mb-6">
                <Button variant="outline" onClick={handleClear} size="sm" className="hover:bg-destructive/10 hover:text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            )}
            
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className="border-2 border-dashed border-border rounded-lg p-4 text-center hover:border-primary transition-colors cursor-pointer bg-background/50"
            >
              <div className="flex flex-col items-center space-y-3">
                <Upload className="h-12 w-12 text-muted-foreground" />
                <div className="space-y-2">
                  <p className="text-lg text-foreground">
                    Drag and drop your document here, or
                  </p>
                  <Button variant="outline" size="lg" asChild className="font-semibold">
                    <label htmlFor="file-upload" className="cursor-pointer">
                      Browse Files
                    </label>
                  </Button>
                  <input
                    id="file-upload"
                    type="file"
                    className="sr-only"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileChange}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Supports: Images, PDF, Word documents
                </p>
              </div>
            </div>

            {selectedFile && (
              <div className="flex items-center space-x-2 p-4 bg-background rounded-lg mt-4 border">
                <File className="h-5 w-5 text-primary" />
                <span className="text-base text-foreground font-medium">{selectedFile.name}</span>
                <span className="text-sm text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
          </>
        )}
      </div>
    </Card>
  );
};

export default DocumentUpload;
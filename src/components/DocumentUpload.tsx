import React, { useCallback, useState } from 'react';
import { Upload, File, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  onMultipleFilesSelect?: (files: File[]) => void;
  selectedFile?: File | null;
  selectedFiles?: File[];
  allowMultiple?: boolean;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ 
  onFileSelect, 
  onMultipleFilesSelect,
  selectedFile, 
  selectedFiles,
  allowMultiple = false 
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const handleDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (allowMultiple && files.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(files);
      } else {
        onFileSelect(files[0]);
      }
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (allowMultiple && files.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(Array.from(files));
      } else {
        onFileSelect(files[0]);
      }
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple]);

  const handleClear = useCallback(() => {
    onFileSelect(null as any);
  }, [onFileSelect]);

  return (
    <Card className="bg-muted/5 border-2 h-full flex flex-col">
      <div className="p-4 flex flex-col h-full">
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
          <div className="flex flex-col flex-1">
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
              className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer bg-background/50 flex-1 flex flex-col items-center justify-center min-h-[400px]"
            >
              <div className="flex flex-col items-center space-y-4">
                <Upload className="h-16 w-16 text-muted-foreground" />
                <div className="space-y-3">
                  <p className="text-xl text-foreground">
                    Drag and drop your document{allowMultiple ? 's' : ''} here, or
                  </p>
                  <Button variant="outline" size="lg" asChild className="font-semibold">
                    <label htmlFor="document-upload-input" className="cursor-pointer">
                      Browse Files
                    </label>
                  </Button>
                  <input
                    id="document-upload-input"
                    type="file"
                    className="sr-only"
                    accept="image/*,.pdf,.doc,.docx"
                    onChange={handleFileChange}
                    multiple={allowMultiple}
                  />
                </div>
                <p className="text-sm text-muted-foreground">
                  Supports: Images, PDF, Word documents{allowMultiple ? ' - Multiple images can be combined' : ''}
                </p>
              </div>
            </div>

            {selectedFiles && selectedFiles.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{selectedFiles.length} files selected:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-2 p-2 bg-background rounded border">
                      <File className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{file.name}</span>
                      <span className="text-xs text-muted-foreground">
                        ({(file.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedFile && (
              <div className="flex items-center space-x-2 p-4 bg-background rounded-lg mt-4 border">
                <File className="h-5 w-5 text-primary" />
                <span className="text-base text-foreground font-medium">{selectedFile.name}</span>
                <span className="text-sm text-muted-foreground">
                  ({(selectedFile.size / 1024).toFixed(1)} KB)
                </span>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
};

export default DocumentUpload;
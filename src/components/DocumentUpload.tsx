import React, { useCallback } from 'react';
import { Upload, File } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface DocumentUploadProps {
  onFileSelect: (file: File) => void;
  selectedFile?: File | null;
}

const DocumentUpload: React.FC<DocumentUploadProps> = ({ onFileSelect, selectedFile }) => {
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

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Upload Document</h3>
        
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          className="border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer"
        >
          <div className="flex flex-col items-center space-y-4">
            <Upload className="h-12 w-12 text-muted-foreground" />
            <div>
              <p className="text-sm text-foreground mb-2">
                Drag and drop your document here, or
              </p>
              <Button variant="outline" asChild>
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
            <p className="text-xs text-muted-foreground">
              Supports: Images, PDF, Word documents
            </p>
          </div>
        </div>

        {selectedFile && (
          <div className="flex items-center space-x-2 p-3 bg-muted rounded-lg">
            <File className="h-4 w-4 text-primary" />
            <span className="text-sm text-foreground">{selectedFile.name}</span>
            <span className="text-xs text-muted-foreground">
              ({(selectedFile.size / 1024).toFixed(1)} KB)
            </span>
          </div>
        )}
      </div>
    </Card>
  );
};

export default DocumentUpload;
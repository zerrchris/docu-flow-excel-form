import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, X, FileText, Image, FileIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { DocumentService } from '@/services/documentService';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';

interface FileUploadStatus {
  file: File;
  status: 'pending' | 'uploading' | 'success' | 'error';
  progress: number;
  error?: string;
  rowIndex?: number;
}

interface MultipleFileUploadProps {
  onUploadComplete?: (uploadedCount: number) => void;
  onClose?: () => void;
}

const MultipleFileUpload: React.FC<MultipleFileUploadProps> = ({
  onUploadComplete,
  onClose
}) => {
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { activeRunsheet } = useActiveRunsheet();

  const getFileIcon = (file: File) => {
    const type = file.type;
    if (type.startsWith('image/')) return <Image className="h-4 w-4" />;
    if (type === 'application/pdf') return <FileText className="h-4 w-4" />;
    return <FileIcon className="h-4 w-4" />;
  };

  const getStatusIcon = (status: FileUploadStatus['status']) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const handleFileSelect = useCallback((selectedFiles: FileList) => {
    if (!activeRunsheet) {
      toast({
        title: "No active runsheet",
        description: "Please select or create a runsheet first.",
        variant: "destructive"
      });
      return;
    }

    // For now, show a message that this feature is temporarily disabled
    toast({
      title: "Feature temporarily disabled",
      description: "Multiple file upload will be available in a future update.",
      variant: "default"
    });
  }, [activeRunsheet]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const removeFile = (index: number) => {
    if (isUploading) return;
    setFiles(prev => prev.filter((_, i) => i !== index));
  };

  const uploadFiles = async () => {
    toast({
      title: "Feature temporarily disabled",
      description: "Multiple file upload will be available in a future update.",
      variant: "default"
    });
  };

  const totalProgress = files.length > 0 
    ? files.reduce((sum, file) => sum + file.progress, 0) / files.length 
    : 0;

  const pendingFiles = files.filter(f => f.status === 'pending').length;
  const successFiles = files.filter(f => f.status === 'success').length;
  const errorFiles = files.filter(f => f.status === 'error').length;

  return (
    <Card className="p-6 w-full max-w-2xl mx-auto">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Upload Multiple Files</h3>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <p className="text-sm text-muted-foreground">
          Files will be automatically linked to the next available rows in your runsheet.
        </p>

        {/* File Drop Zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragOver 
              ? 'border-primary bg-primary/5' 
              : 'border-muted-foreground/25 hover:border-muted-foreground/50'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm font-medium mb-2">
            Drop files here or click to browse
          </p>
          <p className="text-xs text-muted-foreground mb-4">
            Supports: Images (JPG, PNG, GIF, WebP) and PDF files
          </p>
          
          <Button
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
          >
            Browse Files
          </Button>
          
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="hidden"
            onChange={(e) => e.target.files && handleFileSelect(e.target.files)}
          />
        </div>

        {/* File List */}
        {files.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium">Selected Files ({files.length})</h4>
              <div className="flex items-center space-x-2">
                {successFiles > 0 && (
                  <Badge variant="outline" className="text-green-600">
                    {successFiles} Success
                  </Badge>
                )}
                {errorFiles > 0 && (
                  <Badge variant="outline" className="text-red-600">
                    {errorFiles} Error
                  </Badge>
                )}
                {pendingFiles > 0 && (
                  <Badge variant="outline">
                    {pendingFiles} Pending
                  </Badge>
                )}
              </div>
            </div>

            {isUploading && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Overall Progress</span>
                  <span>{Math.round(totalProgress)}%</span>
                </div>
                <Progress value={totalProgress} className="h-2" />
              </div>
            )}

            <ScrollArea className="h-64">
              <div className="space-y-2">
                {files.map((fileStatus, index) => (
                  <div
                    key={index}
                    className="flex items-center space-x-3 p-3 border rounded-lg"
                  >
                    <div className="flex-shrink-0">
                      {getFileIcon(fileStatus.file)}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {fileStatus.file.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {(fileStatus.file.size / 1024 / 1024).toFixed(2)} MB
                        {fileStatus.rowIndex !== undefined && (
                          <span> • Row {fileStatus.rowIndex + 1}</span>
                        )}
                      </p>
                      {fileStatus.status === 'uploading' && (
                        <Progress value={fileStatus.progress} className="h-1 mt-1" />
                      )}
                      {fileStatus.error && (
                        <p className="text-xs text-red-500 mt-1">{fileStatus.error}</p>
                      )}
                    </div>

                    <div className="flex-shrink-0 flex items-center space-x-2">
                      {getStatusIcon(fileStatus.status)}
                      
                      {!isUploading && fileStatus.status !== 'success' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFile(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Action Buttons */}
        {files.length > 0 && (
          <div className="flex items-center justify-between pt-4 border-t">
            <Button
              variant="outline"
              onClick={() => setFiles([])}
              disabled={isUploading}
            >
              Clear All
            </Button>
            
            <Button
              onClick={uploadFiles}
              disabled={isUploading || files.every(f => f.status === 'success')}
            >
              {isUploading ? 'Uploading...' : `Upload ${pendingFiles} Files`}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};

export default MultipleFileUpload;
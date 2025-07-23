import React, { useState, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, X, FileText, Image, FileIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { DocumentService } from '@/services/documentService';
import { useMultipleRunsheets } from '@/hooks/useMultipleRunsheets';
import { supabase } from '@/integrations/supabase/client';

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
  
  const { currentRunsheet } = useMultipleRunsheets();

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
    if (!currentRunsheet) {
      toast({
        title: "No active runsheet",
        description: "Please select or create a runsheet first.",
        variant: "destructive"
      });
      return;
    }

    // Add selected files to the upload queue
    const fileArray = Array.from(selectedFiles);
    const newFiles = fileArray.map(file => ({
      file,
      status: 'pending' as const,
      progress: 0
    }));

    setFiles(prev => [...prev, ...newFiles]);
  }, [currentRunsheet]);

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
    console.log('=== UPLOAD FILES DEBUG ===');
    console.log('currentRunsheet from MultipleFileUpload:', currentRunsheet);
    console.log('currentRunsheet.id:', currentRunsheet?.id);
    console.log('currentRunsheet full object:', JSON.stringify(currentRunsheet, null, 2));
    
    if (!currentRunsheet?.id) {
      console.log('No currentRunsheet.id found');
      toast({
        title: "No active runsheet",
        description: "Please select or create a runsheet first.",
        variant: "destructive"
      });
      return;
    }

    // Check if runsheet exists in database by trying to fetch it
    if (currentRunsheet.id.startsWith('legacy-')) {
      console.log('Runsheet has legacy ID, needs to be saved first:', currentRunsheet.id);
      toast({
        title: "Save runsheet first",
        description: "Please save your runsheet to the database before uploading documents.",
        variant: "destructive"
      });
      return;
    }

    // Verify runsheet exists in database
    try {
      console.log('Checking if runsheet exists in database with ID:', currentRunsheet.id);
      const { data: runsheetExists, error: checkError } = await supabase
        .from('runsheets')
        .select('id')
        .eq('id', currentRunsheet.id)
        .single();

      console.log('Database check result:', { runsheetExists, checkError });

      if (checkError || !runsheetExists) {
        console.log('Runsheet not found in database:', currentRunsheet.id, 'Error:', checkError);
        toast({
          title: "Save runsheet first",
          description: "Please save your runsheet to the database before uploading documents.",
          variant: "destructive"
        });
        return;
      }
      
      console.log('Runsheet verified in database, proceeding with upload');
    } catch (error) {
      console.error('Error checking runsheet:', error);
      toast({
        title: "Error",
        description: "Could not verify runsheet. Please try saving it again.",
        variant: "destructive"
      });
      return;
    }

    console.log('Proceeding with upload for runsheet ID:', currentRunsheet.id);

    const pendingFiles = files.filter(f => f.status === 'pending');
    if (pendingFiles.length === 0) {
      toast({
        title: "No files to upload",
        description: "Please add some files first.",
        variant: "default"
      });
      return;
    }

    setIsUploading(true);

    // Find the first empty row to start uploading to
    const runsheetData = currentRunsheet.data || [];
    let startRowIndex = runsheetData.findIndex(row => 
      !Object.values(row).some(value => value && typeof value === 'string' && value.trim() !== '')
    );

    // If no empty row found, start at the end of existing data
    if (startRowIndex === -1) {
      startRowIndex = runsheetData.length;
    }

    // Check if we have enough available spots (considering we may need to extend the array)
    const availableSpots = Math.max(0, runsheetData.length - startRowIndex) + 100; // Allow extending
    if (pendingFiles.length > availableSpots && startRowIndex < runsheetData.length) {
      // Only show error if we're not at the end and there really aren't enough spots
      const emptyRowsFromStart = runsheetData.slice(startRowIndex).filter(row => 
        !Object.values(row).some(value => value && typeof value === 'string' && value.trim() !== '')
      ).length;
      
      if (emptyRowsFromStart < pendingFiles.length && startRowIndex + pendingFiles.length > runsheetData.length) {
        toast({
          title: "Not enough rows available",
          description: `You need ${pendingFiles.length} consecutive rows but only ${emptyRowsFromStart} empty rows are available. The upload will add files to available rows and extend the runsheet as needed.`,
          variant: "default"
        });
      }
    }

    let currentRowIndex = startRowIndex;

    for (let i = 0; i < pendingFiles.length; i++) {
      const fileUpload = pendingFiles[i];
      const fileIndex = files.findIndex(f => f.file === fileUpload.file);

      // Update status to uploading
      setFiles(prev => prev.map((f, index) => 
        index === fileIndex 
          ? { ...f, status: 'uploading', rowIndex: currentRowIndex }
          : f
      ));

      try {
        const result = await DocumentService.uploadDocument(
          fileUpload.file,
          currentRunsheet.id,
          currentRowIndex,
          (progress) => {
            setFiles(prev => prev.map((f, index) => 
              index === fileIndex ? { ...f, progress } : f
            ));
          }
        );

        if (result.success) {
          // Update status to success
          setFiles(prev => prev.map((f, index) => 
            index === fileIndex 
              ? { ...f, status: 'success', progress: 100 }
              : f
          ));

          // Update the runsheet data to show the linked document
          if (result.document) {
            const updatedData = [...runsheetData];
            if (!updatedData[currentRowIndex]) {
              updatedData[currentRowIndex] = {};
            }
            updatedData[currentRowIndex]['Document File Name'] = result.document.stored_filename;
            
            // Trigger a custom event to notify the parent component
            window.dispatchEvent(new CustomEvent('documentRecordCreated', {
              detail: {
                runsheetId: currentRunsheet.id,
                rowIndex: currentRowIndex,
                document: result.document
              }
            }));
          }
        } else {
          // Update status to error
          setFiles(prev => prev.map((f, index) => 
            index === fileIndex 
              ? { ...f, status: 'error', error: result.error }
              : f
          ));
        }
      } catch (error) {
        console.error('Upload error:', error);
        setFiles(prev => prev.map((f, index) => 
          index === fileIndex 
            ? { ...f, status: 'error', error: 'Upload failed' }
            : f
        ));
      }

      currentRowIndex++;
    }

    setIsUploading(false);

    const successCount = files.filter(f => f.status === 'success').length;
    const errorCount = files.filter(f => f.status === 'error').length;

    if (successCount > 0) {
      toast({
        title: "Upload complete",
        description: `${successCount} file${successCount === 1 ? '' : 's'} uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
        variant: "default"
      });

      if (onUploadComplete) {
        onUploadComplete(successCount);
      }
    }
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
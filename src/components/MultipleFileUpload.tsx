import React, { useState, useCallback, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Upload, X, FileText, Image, FileIcon, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { DocumentService } from '@/services/documentService';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import { supabase } from '@/integrations/supabase/client';
import { convertPDFToImages, isPDF, createFileFromBlob } from '@/utils/pdfToImage';

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
  runsheetData?: {
    id: string;
    name: string;
    data: Record<string, string>[];
    columns?: string[];
  };
  onAutoSave?: () => Promise<string | null>; // Returns the saved runsheet ID or null if save failed
}

const MultipleFileUpload: React.FC<MultipleFileUploadProps> = ({
  onUploadComplete,
  onClose,
  runsheetData: propRunsheetData,
  onAutoSave
}) => {
  const [files, setFiles] = useState<FileUploadStatus[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [currentRunsheetData, setCurrentRunsheetData] = useState<{
    id: string;
    name: string;
    data: Record<string, string>[];
    columns?: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { activeRunsheet } = useActiveRunsheet();
  // Use prop data if provided, otherwise fall back to hook
  const currentRunsheet = propRunsheetData || currentRunsheetData || activeRunsheet;

  // Fetch fresh runsheet data when component mounts if we don't have prop data
  useEffect(() => {
    const fetchRunsheetData = async () => {
      if (propRunsheetData || !activeRunsheet?.id) return;
      
      try {
        const { data, error } = await supabase
          .from('runsheets')
          .select('*')
          .eq('id', activeRunsheet.id)
          .maybeSingle();

        if (error) {
          console.error('Error fetching runsheet data:', error);
          return;
        }

        if (data) {
          setCurrentRunsheetData({
            id: data.id,
            name: data.name,
            data: Array.isArray(data.data) ? data.data as Record<string, string>[] : [],
            columns: Array.isArray(data.columns) ? data.columns as string[] : []
          });
        }
      } catch (error) {
        console.error('Error in fetchRunsheetData:', error);
      }
    };

    fetchRunsheetData();
  }, [activeRunsheet?.id, propRunsheetData]);

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

  // Process PDFs to images if needed
  const processPDFFiles = async (fileArray: File[]): Promise<File[]> => {
    const processedFiles: File[] = [];
    
    for (const file of fileArray) {
      if (isPDF(file)) {
        try {
          console.log('🔧 Converting PDF to images:', file.name);
          const pages = await convertPDFToImages(file);
          
          // Create separate files for each page
          pages.forEach((page, index) => {
            const imageName = file.name.replace(/\.pdf$/i, `_page_${page.pageNumber}.png`);
            const imageFile = createFileFromBlob(page.blob, imageName);
            processedFiles.push(imageFile);
          });
          
          toast({
            title: "PDF Converted",
            description: `${file.name} converted to ${pages.length} image(s) for processing.`,
          });
        } catch (error) {
          console.error('PDF conversion error:', error);
          toast({
            title: "PDF Conversion Failed",
            description: `Could not convert ${file.name}. Uploading as-is.`,
            variant: "destructive",
          });
          processedFiles.push(file); // Keep original PDF if conversion fails
        }
      } else {
        processedFiles.push(file);
      }
    }
    
    return processedFiles;
  };

  const handleFileSelect = useCallback(async (selectedFiles: FileList) => {
    console.log('🔧 handleFileSelect called with files:', selectedFiles.length);
    
    if (!currentRunsheet) {
      toast({
        title: "No active runsheet",
        description: "Please select or create a runsheet first.",
        variant: "destructive"
      });
      return;
    }

    // Convert FileList to array and process PDFs
    const fileArray = Array.from(selectedFiles);
    console.log('🔧 Converting FileList to array:', fileArray.length, 'files');
    
    // Process PDFs to images
    const processedFiles = await processPDFFiles(fileArray);
    console.log('🔧 After PDF processing:', processedFiles.length, 'files');
    
    const newFiles = processedFiles.map((file, index) => {
      console.log(`🔧 Processing file ${index}: ${file.name}`);
      return {
        file,
        status: 'pending' as const,
        progress: 0
      };
    });

    console.log('🔧 Adding', newFiles.length, 'files to queue');
    setFiles(prev => {
      const updated = [...prev, ...newFiles];
      console.log('🔧 Total files in queue:', updated.length);
      return updated;
    });
  }, [currentRunsheet]);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    console.log('🔧 Drop event triggered');
    if (e.dataTransfer.files) {
      console.log('🔧 Files in drop:', e.dataTransfer.files.length);
      await handleFileSelect(e.dataTransfer.files);
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

    let runsheetId = currentRunsheet.id;

    // Check if runsheet needs to be saved first
    if (currentRunsheet.id.startsWith('legacy-') || currentRunsheet.id === 'temp-id') {
      console.log('Runsheet has temporary ID, auto-saving first:', currentRunsheet.id);
      
      if (!onAutoSave) {
        toast({
          title: "Save runsheet first",
          description: "Please save your runsheet to the database before uploading documents.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Saving runsheet",
        description: "Auto-saving runsheet before uploading documents...",
      });

      try {
        const savedRunsheetId = await onAutoSave();
        if (!savedRunsheetId) {
          toast({
            title: "Save failed",
            description: "Could not save runsheet. Please save manually and try again.",
            variant: "destructive"
          });
          return;
        }
        runsheetId = savedRunsheetId;
        console.log('Auto-save successful, new runsheet ID:', runsheetId);
      } catch (error) {
        console.error('Auto-save failed:', error);
        toast({
          title: "Save failed",
          description: "Could not save runsheet. Please save manually and try again.",
          variant: "destructive"
        });
        return;
      }
    } else {
      // Verify runsheet exists in database
      try {
        console.log('Checking if runsheet exists in database with ID:', runsheetId);
        const { data: runsheetExists, error: checkError } = await supabase
          .from('runsheets')
          .select('id')
          .eq('id', runsheetId)
          .maybeSingle();

        console.log('Database check result:', { runsheetExists, checkError });

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (!runsheetExists) {
          console.log('Runsheet not found in database, attempting auto-save:', runsheetId);
          
          if (!onAutoSave) {
            toast({
              title: "Save runsheet first",
              description: "Please save your runsheet to the database before uploading documents.",
              variant: "destructive"
            });
            return;
          }

          const savedRunsheetId = await onAutoSave();
          if (!savedRunsheetId) {
            toast({
              title: "Save failed",
              description: "Could not save runsheet. Please save manually and try again.",
              variant: "destructive"
            });
            return;
          }
          runsheetId = savedRunsheetId;
        }
        
        console.log('Runsheet verified/saved, proceeding with upload');
      } catch (error) {
        console.error('Error checking runsheet:', error);
        toast({
          title: "Error",
          description: "Could not verify runsheet. Please try saving it again.",
          variant: "destructive"
        });
        return;
      }
    }

    console.log('Proceeding with upload for runsheet ID:', runsheetId);

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

    // Get current document map to check for existing document links
    let documentMap: Map<number, any> = new Map();
    try {
      documentMap = await DocumentService.getDocumentMapForRunsheet(runsheetId);
      console.log('🔧 Retrieved document map for empty row detection:', documentMap);
    } catch (error) {
      console.error('Error getting document map:', error);
    }

    // Helper function to check if a row is truly empty (no text data AND no linked document)
    const isRowEmpty = (row: Record<string, string>, rowIndex: number) => {
      // Check if row has any text data
      const hasTextData = Object.values(row).some(value => value && typeof value === 'string' && value.trim() !== '');
      
      // Check if row has a linked document
      const hasLinkedDocument = documentMap.has(rowIndex);
      
      console.log(`🔧 Row ${rowIndex} - hasTextData: ${hasTextData}, hasLinkedDocument: ${hasLinkedDocument}`);
      
      // Row is empty only if it has no text data AND no linked document
      return !hasTextData && !hasLinkedDocument;
    };

    // Helper function to find next empty row starting from a given index
    const findNextEmptyRow = (startIndex: number, searchData: Record<string, string>[]): number => {
      for (let i = startIndex; i < searchData.length; i++) {
        if (isRowEmpty(searchData[i], i)) {
          return i;
        }
      }
      // No empty row found, return the end of the array to extend it
      return searchData.length;
    };

    const runsheetData = currentRunsheet.data || [];
    
    // If runsheet data is empty or very small, create default empty rows to work with
    if (runsheetData.length === 0) {
      console.log('🔧 No runsheet data found, creating default rows');
      const columnNames = currentRunsheet.columns || ['Column 1'];
      for (let i = 0; i < 10; i++) {
        const newRow: Record<string, string> = {};
        columnNames.forEach(col => newRow[col] = '');
        runsheetData.push(newRow);
      }
    }
    
    // Find all empty rows that we can use (considering both text data and document links)
    const emptyRows = runsheetData
      .map((row, index) => ({ row, index }))
      .filter(({ row, index }) => isRowEmpty(row, index))
      .map(({ index }) => index);

    // If we don't have enough empty rows, we'll extend the runsheet
    const availableEmptyRows = emptyRows.length;
    const needsExtension = pendingFiles.length > availableEmptyRows;
    
    // Actually extend the runsheet data with new empty rows if needed
    let extendedRunsheetData = [...runsheetData];
    if (needsExtension) {
      const rowsToAdd = pendingFiles.length - availableEmptyRows;
      toast({
        title: "Extending runsheet",
        description: `Found ${availableEmptyRows} empty rows. Adding ${rowsToAdd} new rows to accommodate all files.`,
        variant: "default"
      });
      
      // Create empty rows based on current columns
      const columnNames = Object.keys(runsheetData[0] || {});
      if (columnNames.length === 0) {
        console.error('No columns found in runsheet data - cannot extend');
        return;
      }
      
      for (let i = 0; i < rowsToAdd; i++) {
        const newRow: Record<string, string> = {};
        columnNames.forEach(col => newRow[col] = '');
        extendedRunsheetData.push(newRow);
      }
      
      console.log(`🔧 Extended runsheet data from ${runsheetData.length} to ${extendedRunsheetData.length} rows`);
      
      // Save the extended runsheet data to the database
      try {
        const { error: updateError } = await supabase
          .from('runsheets')
          .update({ 
            data: extendedRunsheetData,
            updated_at: new Date().toISOString()
          })
          .eq('id', runsheetId);
        
        if (updateError) {
          console.error('Error saving extended runsheet data:', updateError);
          toast({
            title: "Warning",
            description: "Could not save extended rows to database. Files may upload but rows won't persist.",
            variant: "default"
          });
        } else {
          console.log('🔧 Successfully saved extended runsheet data to database');
          
          // Dispatch event to refresh the spreadsheet UI with the new rows
          window.dispatchEvent(new CustomEvent('refreshRunsheetData', {
            detail: { runsheetId }
          }));
        }
      } catch (error) {
        console.error('Error updating runsheet with extended data:', error);
      }
    }

    // Start from the first empty row, or the end if no empty rows exist
    let currentRowIndex = emptyRows.length > 0 ? emptyRows[0] : runsheetData.length;

    console.log('🔧 Starting upload loop for', pendingFiles.length, 'files');
    
    for (let i = 0; i < pendingFiles.length; i++) {
      const fileUpload = pendingFiles[i];
      const fileIndex = files.findIndex(f => f.file === fileUpload.file);
      
      console.log(`🔧 Processing file ${i+1}/${pendingFiles.length}: ${fileUpload.file.name}`);
      console.log(`🔧 File index in queue: ${fileIndex}, Row index: ${currentRowIndex}`);

      // Update status to uploading
      setFiles(prev => prev.map((f, index) => 
        index === fileIndex 
          ? { ...f, status: 'uploading', rowIndex: currentRowIndex }
          : f
      ));

      try {
        const result = await DocumentService.uploadDocument(
          fileUpload.file,
          runsheetId,
          currentRowIndex,
          (progress) => {
            setFiles(prev => prev.map((f, index) => 
              index === fileIndex ? { ...f, progress } : f
            ));
          },
          false // Use original filename by default, not smart naming
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
            console.log('🔧 MultipleFileUpload: Dispatching events for document upload');
            console.log('🔧 RunsheetId:', runsheetId, 'RowIndex:', currentRowIndex, 'Document:', result.document);
            
            // Immediately dispatch both events for faster UI updates
            console.log('🔧 Dispatching updateDocumentFilename event');
            window.dispatchEvent(new CustomEvent('updateDocumentFilename', {
              detail: {
                runsheetId: runsheetId,
                rowIndex: currentRowIndex,
                filename: result.document.stored_filename
              }
            }));
            
            console.log('🔧 Dispatching documentRecordCreated event');
            window.dispatchEvent(new CustomEvent('documentRecordCreated', {
              detail: {
                runsheetId: runsheetId,
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

      // Find the next empty row for the next file (use extended data for search)
      if (i < pendingFiles.length - 1) { // Don't search for next row if this is the last file
        currentRowIndex = findNextEmptyRow(currentRowIndex + 1, extendedRunsheetData);
      }
    }

    setIsUploading(false);

    // Organize uploaded documents into runsheet folder
    const successfulFiles = files.filter(f => f.status === 'success');
    if (successfulFiles.length > 0 && currentRunsheet) {
      try {
        // Get document IDs from successful uploads
        const documentIds: string[] = [];
        
        // Collect document IDs by checking the events we dispatched
        successfulFiles.forEach((file, index) => {
          // We'll need to get the document IDs from the database
          // This is a bit complex since we only have file references
        });

        // For now, we'll organize all documents for this runsheet
        // In a real implementation, we'd track the newly uploaded document IDs
        const { data: documents } = await supabase
          .from('documents')
          .select('id')
          .eq('runsheet_id', runsheetId)
          .gte('created_at', new Date(Date.now() - 60000).toISOString()); // Documents created in last minute

        if (documents && documents.length > 0) {
          const documentIds = documents.map(doc => doc.id);
          await DocumentService.organizeDocumentsByRunsheet(
            runsheetId,
            currentRunsheet.name,
            documentIds
          );
          
          console.log(`Organized ${documentIds.length} documents into folder: ${currentRunsheet.name}`);
        }
      } catch (error) {
        console.error('Error organizing documents by runsheet:', error);
        // Don't show error to user as upload was successful
      }
    }

    const successCount = files.filter(f => f.status === 'success').length;
    const errorCount = files.filter(f => f.status === 'error').length;

    if (successCount > 0) {
      console.log('🔧 Upload complete:', { successCount, errorCount, onClose: !!onClose });
      
      toast({
        title: "Upload complete",
        description: `${successCount} file${successCount === 1 ? '' : 's'} uploaded successfully${errorCount > 0 ? `, ${errorCount} failed` : ''}.`,
        variant: "default"
      });

      if (onUploadComplete) {
        onUploadComplete(successCount);
      }

      // Let users manually close with the "Done" button for better control
      console.log('🔧 Upload complete:', { successCount, errorCount });
    }
  };

  const totalProgress = files.length > 0 
    ? files.reduce((sum, file) => sum + file.progress, 0) / files.length 
    : 0;

  const pendingFiles = files.filter(f => f.status === 'pending').length;
  const successFiles = files.filter(f => f.status === 'success').length;
  const errorFiles = files.filter(f => f.status === 'error').length;

  return (
    <Card className="p-6 w-full max-w-2xl mx-auto max-h-[85vh] overflow-y-auto">
      <div className="space-y-4 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Upload Multiple Files</h3>
        </div>

        <p className="text-sm text-muted-foreground">
          Files will be automatically linked to the next available rows in your runsheet.
        </p>
      </div>

      <div className="space-y-4 mt-4">
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
            onChange={(e) => {
              console.log('🔧 File input onChange triggered');
              if (e.target.files) {
                console.log('🔧 Files in input:', e.target.files.length);
                handleFileSelect(e.target.files);
              }
            }}
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
            
            <div className="flex items-center space-x-2">
              {files.every(f => f.status === 'success' || f.status === 'error') && files.some(f => f.status === 'success') ? (
                <Button
                  onClick={onClose}
                  variant="default"
                >
                  Done
                </Button>
              ) : (
                <Button
                  onClick={uploadFiles}
                  disabled={isUploading || files.every(f => f.status === 'success')}
                >
                  {isUploading ? 'Uploading...' : `Upload ${pendingFiles} Files`}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default MultipleFileUpload;
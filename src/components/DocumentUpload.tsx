import React, { useCallback, useState } from 'react';
import { Upload, File, Trash2, ChevronDown, ChevronUp, FileImage, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { convertPDFToImages, isPDF, createFileFromBlob } from '@/utils/pdfToImage';

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
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Handle PDF to image conversion
  const handlePDFConversion = async (file: File) => {
    if (!isPDF(file)) {
      return file; // Not a PDF, return as-is
    }

    setIsProcessing(true);
    try {
      toast({
        title: "Converting PDF",
        description: "Converting PDF pages to images for better analysis...",
      });

      const pages = await convertPDFToImages(file);
      
      if (pages.length === 0) {
        throw new Error('No pages found in PDF');
      }

      // If single page, return as single image file
      if (pages.length === 1) {
        const imageFile = createFileFromBlob(
          pages[0].blob, 
          `${file.name.replace('.pdf', '')}_page1.png`
        );
        
        toast({
          title: "PDF Converted",
          description: `Single page PDF converted to image for analysis.`,
        });
        
        return imageFile;
      } else {
        // Multiple pages - convert to multiple image files
        const imageFiles = pages.map(page => 
          createFileFromBlob(
            page.blob, 
            `${file.name.replace('.pdf', '')}_page${page.pageNumber}.png`
          )
        );

        toast({
          title: "PDF Converted",
          description: `${pages.length} pages converted to images. Processing first page.`,
        });

        // For now, use the first page for single document processing
        // In future, could implement multi-page processing
        return imageFiles[0];
      }
    } catch (error) {
      console.error('PDF conversion error:', error);
      toast({
        title: "PDF Conversion Failed",
        description: "Failed to convert PDF to images. Please try uploading an image instead.",
        variant: "destructive",
      });
      throw error;
    } finally {
      setIsProcessing(false);
    }
  };
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (isProcessing) return;
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (allowMultiple && files.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(files);
      } else {
        try {
          const processedFile = await handlePDFConversion(files[0]);
          onFileSelect(processedFile);
        } catch (error) {
          // Error already handled in handlePDFConversion
        }
      }
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple, isProcessing, handlePDFConversion]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    
    const files = e.target.files;
    if (files && files.length > 0) {
      if (allowMultiple && files.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(Array.from(files));
      } else {
        try {
          const processedFile = await handlePDFConversion(files[0]);
          onFileSelect(processedFile);
        } catch (error) {
          // Error already handled in handlePDFConversion
        }
      }
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple, isProcessing, handlePDFConversion]);

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
              className={`border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary transition-colors cursor-pointer bg-background/50 flex-1 flex flex-col items-center justify-center min-h-[400px] ${isProcessing ? 'opacity-50 pointer-events-none' : ''}`}
            >
              <div className="flex flex-col items-center space-y-4">
                {isProcessing ? (
                  <>
                    <FileImage className="h-16 w-16 text-primary animate-pulse" />
                    <div className="space-y-2">
                      <p className="text-xl text-foreground">Converting PDF...</p>
                      <p className="text-sm text-muted-foreground">
                        Converting PDF pages to images for better analysis
                      </p>
                    </div>
                  </>
                ) : (
                  <>
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
                        disabled={isProcessing}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        Supports: Images, PDF, Word documents{allowMultiple ? ' - Multiple images can be combined' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <FileImage className="h-3 w-3" />
                        PDFs are automatically converted to images for better analysis
                      </p>
                    </div>
                  </>
                )}
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
import React, { useCallback, useState, useEffect } from 'react';
import { Upload, File as FileIcon, Trash2, ChevronDown, ChevronUp, FileImage, AlertCircle, FileStack, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { convertPDFToImages, isPDF, createFileFromBlob } from '@/utils/pdfToImage';
import { ScreenshotCapture } from './ScreenshotCapture';
import { supabase } from '@/integrations/supabase/client';

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
  const [mobileDocuments, setMobileDocuments] = useState<any[]>([]);
  const [showMobileDocuments, setShowMobileDocuments] = useState(false);
  const [loadingMobileDocuments, setLoadingMobileDocuments] = useState(false);
  const { toast } = useToast();

  // Load mobile captured documents
  const loadMobileCapturedDocuments = useCallback(async () => {
    try {
      setLoadingMobileDocuments(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase.storage
        .from('documents')
        .list(user.id, {
          limit: 10,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      // Filter for mobile-captured documents
      const mobileDocuments = data?.filter(file => 
        file.name.startsWith('mobile_document_')
      ) || [];

      const documentsWithUrls = mobileDocuments.map(file => {
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(`${user.id}/${file.name}`);

        return {
          id: file.id || file.name,
          name: file.name,
          url: urlData.publicUrl,
          uploadedAt: file.created_at || new Date().toISOString(),
          size: file.metadata?.size
        };
      });

      setMobileDocuments(documentsWithUrls);
    } catch (error: any) {
      console.error('Error loading mobile documents:', error);
      toast({
        title: "Error",
        description: "Failed to load mobile-captured documents.",
        variant: "destructive",
      });
    } finally {
      setLoadingMobileDocuments(false);
    }
  }, [toast]);

  // Load mobile documents when the mobile documents section is shown
  useEffect(() => {
    if (showMobileDocuments && mobileDocuments.length === 0) {
      loadMobileCapturedDocuments();
    }
  }, [showMobileDocuments, mobileDocuments.length, loadMobileCapturedDocuments]);

  // Handle mobile document selection
  const handleMobileDocumentSelect = async (doc: any) => {
    try {
      const response = await fetch(doc.url);
      const blob = await response.blob();
      const file = new File([blob] as BlobPart[], doc.name, { type: blob.type });
      
      onFileSelect(file);
      setShowMobileDocuments(false);
      
      toast({
        title: "Document Selected",
        description: `"${doc.name}" is ready for analysis.`,
      });
    } catch (error) {
      console.error('Error selecting document:', error);
      toast({
        title: "Error",
        description: "Failed to load the selected document.",
        variant: "destructive",
      });
    }
  };

  // Handle PDF files - simplified approach without conversion
  const handlePDFConversion = async (file: File) => {
    if (!isPDF(file)) {
      return file; // Not a PDF, return as-is
    }

    console.log('🔧 PDF_UPLOAD: PDF file detected:', file.name);
    
    // Show helpful message about PDFs but accept the file
    toast({
      title: "PDF uploaded successfully",
      description: "PDF will be processed. For best results, consider converting to an image (PNG/JPG) first.",
      variant: "default",
    });

    // Return the PDF file as-is - the backend can handle it
    return file;
  };
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      if (allowMultiple && files.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(files);
      } else {
        const processedFile = await handlePDFConversion(files[0]);
        if (processedFile) {
          onFileSelect(processedFile);
        }
      }
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple, handlePDFConversion]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      if (allowMultiple && files.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(Array.from(files));
      } else {
        const processedFile = await handlePDFConversion(files[0]);
        if (processedFile) {
          onFileSelect(processedFile);
        }
      }
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple, handlePDFConversion]);

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
                      <Button 
                        variant="outline" 
                        onClick={() => {
                          setIsProcessing(false);
                          toast({
                            title: "PDF conversion cancelled",
                            description: "Please try converting the PDF to an image manually and upload the image instead.",
                          });
                        }}
                        className="mt-2"
                      >
                        Cancel Conversion
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Upload className="h-16 w-16 text-muted-foreground" />
                    <div className="space-y-3">
                      <p className="text-xl text-foreground">
                        Drag and drop your document{allowMultiple ? 's' : ''} here, or
                      </p>
                       <div className="flex gap-3 flex-wrap">
                         <Button variant="outline" size="lg" asChild className="font-semibold">
                           <label htmlFor="document-upload-input" className="cursor-pointer">
                             Browse Files
                           </label>
                         </Button>
                         
                         <ScreenshotCapture 
                           onFileSelect={onFileSelect}
                           className="font-semibold"
                         />
                         
                         <Button 
                           variant="outline" 
                           size="lg" 
                           onClick={() => setShowMobileDocuments(!showMobileDocuments)}
                           className="font-semibold"
                         >
                           <Smartphone className="h-4 w-4 mr-2" />
                           Mobile Photos
                         </Button>
                       </div>
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
                        <AlertCircle className="h-3 w-3" />
                        For best results with PDFs, convert to image (PNG/JPG) first
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Mobile Documents Section */}
            {showMobileDocuments && (
              <div className="mt-4 p-4 border rounded-lg bg-background">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-foreground">Mobile Captured Documents</h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setShowMobileDocuments(false)}
                  >
                    Hide
                  </Button>
                </div>
                
                {loadingMobileDocuments ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map(i => (
                      <div key={i} className="animate-pulse">
                        <div className="flex space-x-3">
                          <div className="w-12 h-12 bg-muted rounded"></div>
                          <div className="flex-1 space-y-1">
                            <div className="h-3 bg-muted rounded w-3/4"></div>
                            <div className="h-2 bg-muted rounded w-1/2"></div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : mobileDocuments.length === 0 ? (
                  <div className="text-center py-4 text-muted-foreground">
                    <p className="text-sm">No mobile documents found.</p>
                    <p className="text-xs">Use the Mobile Capture feature to take photos of documents.</p>
                  </div>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {mobileDocuments.map((doc) => (
                      <div
                        key={doc.id}
                        className="flex items-center justify-between p-2 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-center space-x-3 flex-1 min-w-0">
                          <div className="w-10 h-10 flex-shrink-0">
                            <img
                              src={doc.url}
                              alt={doc.name}
                              className="w-full h-full object-cover rounded border"
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              Document Photo
                            </p>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <span>{new Date(doc.uploadedAt).toLocaleDateString()}</span>
                              {doc.size && (
                                <>
                                  <span>•</span>
                                  <span>{(doc.size / 1024).toFixed(0)} KB</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleMobileDocumentSelect(doc)}
                          className="h-8 px-2 text-xs"
                        >
                          Use Document
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedFiles && selectedFiles.length > 0 ? (
              <div className="mt-4 space-y-2">
                <p className="text-sm font-medium">{selectedFiles.length} files selected:</p>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {selectedFiles.map((file, index) => (
                    <div key={index} className="flex items-center space-x-2 p-2 bg-background rounded border">
                      <FileIcon className="h-4 w-4 text-primary" />
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
                <FileIcon className="h-5 w-5 text-primary" />
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
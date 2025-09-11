import React, { useCallback, useState, useEffect } from 'react';
import { Upload, File as FileIcon, Trash2, FileImage, AlertCircle, FileStack, Smartphone } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { convertPDFToImages, isPDF, createFileFromBlob } from '@/utils/pdfToImage';
import { ScreenshotCapture } from './ScreenshotCapture';
import { supabase } from '@/integrations/supabase/client';
import { validateMultipleFiles, formatFileSize } from '@/utils/fileValidation';
import { FileUploadStatus } from '@/components/ui/file-upload-status';
import { FilePreview } from '@/components/FilePreview';
import ProgressIndicator from '@/components/ProgressIndicator';

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
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [mobileDocuments, setMobileDocuments] = useState<any[]>([]);
  const [showMobileDocuments, setShowMobileDocuments] = useState(false);
  const [loadingMobileDocuments, setLoadingMobileDocuments] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [processingSteps, setProcessingSteps] = useState<Array<{
    id: string;
    label: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    progress?: number;
  }>>([]);
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
      console.log('🔧 DocumentUpload: Selecting mobile document:', doc.name, 'URL:', doc.url);
      const response = await fetch(doc.url);
      const blob = await response.blob();
      console.log('🔧 DocumentUpload: Blob type from fetch:', blob.type, 'Size:', blob.size);
      
      // Determine proper MIME type - fallback to extension-based detection if blob.type is corrupted
      let fileType = blob.type;
      if (!fileType || fileType === 'click' || !fileType.startsWith('image/')) {
        console.warn('🔧 DocumentUpload: Blob has corrupted/invalid type:', blob.type, 'for file:', doc.name);
        
        // Fallback to extension-based type detection
        const fileName = doc.name.toLowerCase();
        if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
          fileType = 'image/jpeg';
        } else if (fileName.endsWith('.png')) {
          fileType = 'image/png';
        } else if (fileName.endsWith('.gif')) {
          fileType = 'image/gif';
        } else if (fileName.endsWith('.webp')) {
          fileType = 'image/webp';
        } else if (fileName.endsWith('.pdf')) {
          fileType = 'application/pdf';
        } else {
          // Default to jpeg if we can't determine
          fileType = 'image/jpeg';
        }
        console.log('🔧 DocumentUpload: Using fallback type:', fileType);
      }
      
      const file = new File([blob] as BlobPart[], doc.name, { type: fileType });
      console.log('🔧 DocumentUpload: Created file with type:', file.type, 'Name:', file.name, 'Size:', file.size);
      
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

  // Convert PDF files to images during upload for consistent processing
  const handlePDFConversion = async (file: File) => {
    if (!isPDF(file)) {
      return file; // Not a PDF, return as-is
    }

    console.log('🔧 PDF_UPLOAD: PDF file detected, converting to image:', file.name);
    
    // Initialize progress steps
    setProcessingSteps([
      { id: 'validate', label: 'Validating PDF file', status: 'processing' },
      { id: 'convert', label: 'Converting PDF to image', status: 'pending' },
      { id: 'process', label: 'Finalizing document', status: 'pending' }
    ]);

    setIsProcessing(true);

    try {
      // Step 1: Validate
      await new Promise(resolve => setTimeout(resolve, 500));
      setProcessingSteps(prev => prev.map(step => 
        step.id === 'validate' ? { ...step, status: 'completed' } : 
        step.id === 'convert' ? { ...step, status: 'processing' } : step
      ));

      // Step 2: Convert PDF to high-resolution image with timeout
      console.log('🔧 PDF_UPLOAD: Starting PDF to image conversion...');
      const conversionPromise = convertPDFToImages(file, 4); // High resolution
      const timeoutPromise = new Promise<never>((_, reject) => 
        setTimeout(() => reject(new Error('PDF conversion timeout after 30 seconds')), 30000)
      );
      
      const pdfPages = await Promise.race([conversionPromise, timeoutPromise]);
      
      if (pdfPages.length === 0) {
        throw new Error('PDF conversion failed - no pages extracted');
      }

      // Use the first page and convert to a File object
      const firstPage = pdfPages[0];
      const originalName = file.name.replace(/\.pdf$/i, '');
      const imageFileName = `${originalName}_converted.png`;
      
      const imageFile = createFileFromBlob(firstPage.blob, imageFileName);
      
      console.log('🔧 PDF_UPLOAD: Conversion successful, created image file:', imageFile.name, 'Size:', imageFile.size);

      setProcessingSteps(prev => prev.map(step => 
        step.id === 'convert' ? { ...step, status: 'completed' } : 
        step.id === 'process' ? { ...step, status: 'processing' } : step
      ));

      // Step 3: Finalize
      await new Promise(resolve => setTimeout(resolve, 500));
      setProcessingSteps(prev => prev.map(step => 
        step.id === 'process' ? { ...step, status: 'completed' } : step
      ));

      toast({
        title: "PDF converted successfully",
        description: "PDF has been converted to a high-resolution image for optimal analysis.",
        variant: "default",
      });

      return imageFile;
    } catch (error) {
      console.error('🔧 PDF_UPLOAD: Conversion failed:', error);
      setProcessingSteps(prev => prev.map(step => 
        step.status === 'processing' ? { ...step, status: 'error' } : step
      ));
      
      toast({
        title: "PDF conversion failed",
        description: error instanceof Error ? error.message : "Failed to convert PDF. Please try uploading as an image instead.",
        variant: "destructive",
      });
      
      throw error;
    } finally {
      setIsProcessing(false);
      setUploadProgress(0);
      // Clear processing steps after a delay
      setTimeout(() => setProcessingSteps([]), 2000);
    }
  };
  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    
    console.log('🔧 DocumentUpload: Processing dropped files:', files.length);
    
    // Use enhanced validation
    const { validFiles, invalidFiles, warnings } = validateMultipleFiles(files);
    
    // Show validation status
    if (invalidFiles.length > 0) {
      toast({
        title: "❌ File Validation Errors",
        description: `${invalidFiles.length} file(s) were rejected. Check the details below.`,
        variant: "destructive",
        duration: 8000,
      });
      
      // Log specific errors
      invalidFiles.forEach(({ file, error }) => {
        console.error('🔧 DocumentUpload: File rejected:', file.name, '-', error);
      });
      
      return; // Don't process any files if there are validation errors
    }
    
    // Show warnings if any
    if (warnings.length > 0) {
      toast({
        title: "⚠️ File Upload Warnings",
        description: `${warnings.length} file(s) have potential issues but will be processed.`,
        variant: "default",
        duration: 6000,
      });
    }
    
    // Process valid files
    try {
      if (allowMultiple && validFiles.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(validFiles);
        toast({
          title: "✅ Files Ready",
          description: `${validFiles.length} files are ready for processing.`,
        });
      } else if (validFiles.length > 0) {
        const processedFile = await handlePDFConversion(validFiles[0]);
        if (processedFile) {
          onFileSelect(processedFile);
          toast({
            title: "✅ File Selected",
            description: `"${processedFile.name}" is ready for analysis.`,
          });
        }
      }
    } catch (error) {
      console.error('🔧 DocumentUpload: Error processing files:', error);
      toast({
        title: "Processing Error",
        description: "Failed to process the uploaded files. Please try again.",
        variant: "destructive",
      });
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple, handlePDFConversion, toast]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  }, []);

  const validateFile = (file: File): { isValid: boolean; error?: string; warning?: string } => {
    console.log('🔧 DocumentUpload: Validating file:', {
      name: file.name,
      type: file.type,
      size: file.size
    });

    // File size validation (50MB max)
    const maxSize = 50 * 1024 * 1024; // 50MB
    if (file.size > maxSize) {
      return { 
        isValid: false, 
        error: `File "${file.name}" is too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Maximum file size is 50MB. Please compress or resize your file.` 
      };
    }

    // Empty file check
    if (file.size === 0) {
      return { 
        isValid: false, 
        error: `File "${file.name}" appears to be empty. Please select a valid file.` 
      };
    }

    // Supported file types and extensions
    const supportedFormats = {
      // Image formats
      images: {
        types: ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff', 'image/svg+xml'],
        extensions: ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg']
      },
      // Document formats
      documents: {
        types: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
        extensions: ['.pdf', '.doc', '.docx', '.txt']
      }
    };

    // Get all valid types and extensions
    const allValidTypes = [...supportedFormats.images.types, ...supportedFormats.documents.types];
    const allValidExtensions = [...supportedFormats.images.extensions, ...supportedFormats.documents.extensions];

    const fileName = file.name.toLowerCase();
    const fileExtension = fileName.substring(fileName.lastIndexOf('.'));
    
    // Check if extension is valid
    const hasValidExtension = allValidExtensions.includes(fileExtension);
    
    // Check MIME type - be more flexible with image types
    const hasValidMimeType = allValidTypes.includes(file.type) || 
                            file.type.startsWith('image/') || 
                            (file.type === '' && hasValidExtension); // Handle files with empty MIME type but valid extension

    // Special handling for specific cases
    if (!hasValidExtension && !hasValidMimeType) {
      const supportedTypesText = "Images (JPG, PNG, GIF, WebP, BMP, TIFF, SVG), PDF documents, Word documents (DOC, DOCX), or Text files (TXT)";
      return { 
        isValid: false, 
        error: `"${file.name}" has an unsupported file format. Please upload one of the following: ${supportedTypesText}.` 
      };
    }

    // Warn about potentially problematic formats
    let warning: string | undefined;
    if (file.type === 'image/gif' && file.size > 10 * 1024 * 1024) {
      warning = "Large GIF files may take longer to process and could impact performance.";
    } else if (file.type === 'application/pdf') {
      warning = "PDF files will be converted to high-resolution images for optimal analysis.";
    } else if (file.type === 'image/svg+xml') {
      warning = "SVG files are supported but raster images (PNG, JPG) typically work better for document analysis.";
    }

    // Additional validation for suspicious files
    if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return { 
        isValid: false, 
        error: `"${file.name}" contains invalid characters. Please rename your file and try again.` 
      };
    }

    // Check for executable extensions disguised as documents
    const dangerousExtensions = ['.exe', '.bat', '.cmd', '.scr', '.pif', '.com', '.jar', '.zip', '.rar'];
    const hasDangerousExtension = dangerousExtensions.some(ext => fileName.includes(ext));
    
    if (hasDangerousExtension) {
      return { 
        isValid: false, 
        error: `"${file.name}" appears to contain executable code. Only document and image files are allowed.` 
      };
    }

    console.log('🔧 DocumentUpload: File validation passed:', file.name);
    return { isValid: true, warning };
  };

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    console.log('🔧 DocumentUpload: Processing selected files:', files.length);
    
    // Use enhanced validation
    const fileArray = Array.from(files);
    const { validFiles, invalidFiles, warnings } = validateMultipleFiles(fileArray);
    
    // Clear file input if there are validation errors
    if (invalidFiles.length > 0) {
      e.target.value = '';
      
      toast({
        title: "❌ File Validation Failed",
        description: `${invalidFiles.length} file(s) were rejected. Please select valid files.`,
        variant: "destructive",
        duration: 8000,
      });
      
      // Log specific errors
      invalidFiles.forEach(({ file, error }) => {
        console.error('🔧 DocumentUpload: File rejected:', file.name, '-', error);
      });
      
      return;
    }
    
    // Show warnings if any
    if (warnings.length > 0) {
      toast({
        title: "⚠️ File Warnings",
        description: `${warnings.length} file(s) have potential issues but will be processed.`,
        variant: "default",
        duration: 6000,
      });
    }
    
    // Process valid files
    try {
      if (allowMultiple && validFiles.length > 1 && onMultipleFilesSelect) {
        onMultipleFilesSelect(validFiles);
        toast({
          title: "✅ Files Selected",
          description: `${validFiles.length} files are ready for processing.`,
        });
      } else if (validFiles.length > 0) {
        const processedFile = await handlePDFConversion(validFiles[0]);
        if (processedFile) {
          onFileSelect(processedFile);
          toast({
            title: "✅ File Selected",
            description: `"${processedFile.name}" is ready for analysis.`,
          });
        }
      }
    } catch (error) {
      console.error('🔧 DocumentUpload: Error processing files:', error);
      e.target.value = ''; // Clear input on error
      toast({
        title: "Processing Error",
        description: "Failed to process the selected files. Please try again.",
        variant: "destructive",
      });
    }
  }, [onFileSelect, onMultipleFilesSelect, allowMultiple, handlePDFConversion, toast]);

  const handleClear = useCallback(() => {
    onFileSelect(null as any);
  }, [onFileSelect]);

  return (
    <Card className="bg-muted/5 border-2 h-full flex flex-col">
      <div className="p-4 flex flex-col h-full">
          <h3 className="text-lg font-semibold text-foreground mb-4">Upload Document</h3>

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
                   <div className="w-full max-w-md">
                     <div className="text-center mb-6">
                       <FileImage className="h-16 w-16 text-primary animate-pulse mx-auto mb-4" />
                       <p className="text-xl text-foreground">Processing Document...</p>
                       <p className="text-sm text-muted-foreground">
                         Please wait while we prepare your document for analysis
                       </p>
                     </div>
                     
                     <ProgressIndicator 
                       steps={processingSteps}
                       className="mb-6"
                     />
                     
                     <div className="flex justify-center">
                       <Button 
                         variant="outline" 
                         onClick={() => {
                           setIsProcessing(false);
                           setProcessingSteps([]);
                           setUploadProgress(0);
                           toast({
                             title: "Processing cancelled",
                             description: "Upload process has been cancelled.",
                           });
                         }}
                         className="mt-2"
                       >
                         Cancel
                       </Button>
                     </div>
                   </div>
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
                        accept="image/*,.pdf,.doc,.docx,.txt"
                        onChange={handleFileChange}
                        multiple={allowMultiple}
                        disabled={isProcessing}
                      />
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">
                        ✅ Supported: JPG, PNG, GIF, WebP, BMP, TIFF, SVG, PDF, DOC, DOCX, TXT{allowMultiple ? ' | Multiple files can be selected' : ''}
                      </p>
                      <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        Maximum file size: 50MB | For best results with PDFs, convert to image format first
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

            {/* File Preview Section */}
            {selectedFile && (
              <div className="mt-4">
                <SelectedFilePreview
                  file={selectedFile}
                  onRemove={() => onFileSelect(null as any)}
                />
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
            ) : null}
          </div>
      </div>
    </Card>
  );
};

// Simple preview component for selected File objects
const SelectedFilePreview: React.FC<{ file: File; onRemove: () => void }> = ({ file, onRemove }) => {
  const getFileType = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image';
    if (['pdf'].includes(ext || '')) return 'pdf';
    return 'other';
  };

  const fileType = getFileType(file.name);
  const fileUrl = URL.createObjectURL(file);

  return (
    <div className="border rounded-lg p-4 bg-muted/30">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h4 className="font-medium">{file.name}</h4>
          <p className="text-sm text-muted-foreground">
            {formatFileSize(file.size)}
          </p>
        </div>
        <Button 
          variant="ghost" 
          size="sm" 
          onClick={onRemove}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      
      {fileType === 'image' && (
        <div className="mt-3">
          <img
            src={fileUrl}
            alt={file.name}
            className="max-w-full max-h-48 object-contain rounded border"
            onLoad={() => URL.revokeObjectURL(fileUrl)}
          />
        </div>
      )}
      
      {fileType === 'pdf' && (
        <div className="mt-3 text-center py-8 border rounded bg-muted/20">
          <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">PDF file selected</p>
        </div>
      )}
      
      {fileType === 'other' && (
        <div className="mt-3 text-center py-8 border rounded bg-muted/20">
          <FileIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">File selected</p>
        </div>
      )}
    </div>
  );
};

export default DocumentUpload;
import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, File, ExternalLink, Trash2, Download, Edit2, Brain, Maximize2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScreenshotCapture } from './ScreenshotCapture';
import ImageCombiner from './ImageCombiner';

interface DocumentLinkerProps {
  runsheetId: string;
  rowIndex: number;
  existingDocumentUrl?: string;
  currentFilename?: string;
  documentPath?: string;
  onDocumentLinked: (filename: string) => void;
  onDocumentRemoved: () => void;
  onAnalyzeDocument?: (file: File, filename: string) => void;
  onOpenWorkspace?: () => void;
  isSpreadsheetUpload?: boolean; // Flag to distinguish spreadsheet uploads from processor uploads
  autoAnalyze?: boolean; // Setting to control auto-analysis
  rowData?: Record<string, string>; // Current row data for smart filename generation
}

const DocumentLinker: React.FC<DocumentLinkerProps> = ({
  runsheetId,
  rowIndex,
  existingDocumentUrl,
  currentFilename,
  documentPath,
  onDocumentLinked,
  onDocumentRemoved,
  onAnalyzeDocument,
  onOpenWorkspace,
  isSpreadsheetUpload = false,
  autoAnalyze = false,
  rowData
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [localFilename, setLocalFilename] = useState(currentFilename || '');
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null); // Store file for analysis
  const [showImageCombiner, setShowImageCombiner] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Update local filename when props change, but only if we haven't made local changes
  React.useEffect(() => {
    console.log('🔧 DocumentLinker: Props changed for row', rowIndex, {
      currentFilename, 
      documentPath, 
      existingDocumentUrl,
      localFilename,
      hasLocalChanges
    });
    
    if (!hasLocalChanges) {
      setLocalFilename(currentFilename || '');
    }
  }, [currentFilename, hasLocalChanges, rowIndex, documentPath, existingDocumentUrl]);

  // Keep uploadedFile when we have a document linked for spreadsheet uploads
  React.useEffect(() => {
    if (isSpreadsheetUpload && currentFilename && !uploadedFile) {
      // For existing documents, create a placeholder that allows analysis
      const blob = new Blob([''], { type: 'application/octet-stream' });
      const placeholderFile = new globalThis.File([blob], currentFilename || 'document', { type: 'application/octet-stream' });
      setUploadedFile(placeholderFile);
    }
  }, [isSpreadsheetUpload, currentFilename, uploadedFile]);

  // Function to sanitize filename for storage while preserving extension
  const sanitizeFilenameForStorage = (filename: string): string => {
    // Extract extension first
    const lastDotIndex = filename.lastIndexOf('.');
    const name = lastDotIndex > 0 ? filename.substring(0, lastDotIndex) : filename;
    const extension = lastDotIndex > 0 ? filename.substring(lastDotIndex) : '';
    
    // Sanitize the name part only
    const sanitizedName = name
      .replace(/\s+/g, '_')           // Replace spaces with underscores
      .replace(/[^\w\-_.]/g, '')      // Remove special characters except word chars, hyphens, underscores, dots
      .replace(/_{2,}/g, '_')         // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '');       // Remove leading/trailing underscores
    
    // Return sanitized name + original extension
    return sanitizedName + extension;
  };

  const handleMultipleFiles = async (files: File[]) => {
    if (!files || files.length === 0) return;

    // If multiple image files, show combination options
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (imageFiles.length > 1) {
      setSelectedFiles(imageFiles);
      setShowImageCombiner(true);
      return;
    }

    // Single file or non-image files - process normally
    const file = files[0];
    await handleFileSelect(file);
  };

  const handleImageCombined = (combinedFile: File, previewUrl: string) => {
    setShowImageCombiner(false);
    setSelectedFiles([]);
    handleFileSelect(combinedFile);
  };

  const handleCancelCombiner = () => {
    setShowImageCombiner(false);
    setSelectedFiles([]);
  };

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    try {
      setIsUploading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to upload documents.",
          variant: "destructive",
        });
        return;
      }

      // If no runsheet ID, we need to save the runsheet first and get the new ID
      let actualRunsheetId = runsheetId;
      if (!runsheetId || runsheetId.trim() === '') {
        toast({
          title: "Saving runsheet",
          description: "Saving runsheet to enable document upload...",
        });
        
        // Emit an event asking the parent to save and return the new runsheet ID
        const savePromise = new Promise<string>((resolve, reject) => {
          const handleSaveResponse = (event: CustomEvent) => {
            window.removeEventListener('runsheetSaveResponse', handleSaveResponse as EventListener);
            if (event.detail.success) {
              resolve(event.detail.runsheetId);
            } else {
              reject(new Error(event.detail.error || 'Failed to save runsheet'));
            }
          };
          
          window.addEventListener('runsheetSaveResponse', handleSaveResponse as EventListener);
          
          const saveEvent = new CustomEvent('saveRunsheetBeforeUpload', {
            detail: { rowIndex, fileName: file.name }
          });
          window.dispatchEvent(saveEvent);
          
          // Timeout after 10 seconds
          setTimeout(() => {
            window.removeEventListener('runsheetSaveResponse', handleSaveResponse as EventListener);
            reject(new Error('Save operation timed out'));
          }, 10000);
        });
        
        try {
          actualRunsheetId = await savePromise;
          console.log('✅ Runsheet saved with ID:', actualRunsheetId);
        } catch (error) {
          toast({
            title: "Runsheet must be saved first",
            description: "Please add some data to your runsheet and save it before uploading documents. Documents need to be linked to saved runsheet rows.",
            variant: "default",
          });
          return;
        }
      }

      // Normal upload flow when runsheet exists
      // Create FormData for the upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('runsheetId', actualRunsheetId);
      formData.append('rowIndex', rowIndex.toString());
      formData.append('originalFilename', file.name);
      formData.append('useSmartNaming', 'false'); // Disable auto smart naming on upload

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('No active session');
      }

      // Call the store-document edge function
      const response = await fetch(
        `https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/store-document`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      
      // Use the stored filename returned by the edge function, not the original filename
      const actualStoredFilename = result.storedFilename || file.name;
      onDocumentLinked(actualStoredFilename);
      
      // Store file for potential analysis if this is a spreadsheet upload
      if (isSpreadsheetUpload) {
        setUploadedFile(file);
      }
      
      // Trigger automatic document analysis only if auto-analyze is enabled
      if (autoAnalyze && onAnalyzeDocument) {
        onAnalyzeDocument(file, actualStoredFilename);
      }
      
      toast({
        title: "Document uploaded",
        description: `${file.name} has been linked to this row.`,
      });

    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload document.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemoveDocument = async () => {
    try {
      // Remove document from database and storage
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { error } = await supabase
        .from('documents')
        .delete()
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .eq('user_id', user.id);

      if (error) {
        throw error;
      }

      onDocumentRemoved();
      
      toast({
        title: "Document removed",
        description: "Document link has been removed from this row.",
      });

    } catch (error) {
      toast({
        title: "Failed to remove document",
        description: "There was an error removing the document.",
        variant: "destructive",
      });
    }
  };

  const handleRenameDocument = async () => {
    if (!editedFilename.trim()) {
      setIsEditingName(false);
      return;
    }

    // Check if runsheetId is valid
    if (!runsheetId || runsheetId.trim() === '') {
      toast({
        title: "Error",
        description: "Invalid runsheet ID. Please save the runsheet first.",
        variant: "destructive",
      });
      setIsEditingName(false);
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Function to find document with retry logic for timing issues
      const findDocumentWithRetry = async (maxRetries = 3) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          let document = null;
          
          if (documentId) {
            // Try to find by document ID first
            const { data: doc, error: fetchError } = await supabase
              .from('documents')
              .select('*')
              .eq('id', documentId)
              .eq('user_id', user.id)
              .maybeSingle();
            
            if (fetchError) {
              throw new Error(`Database error: ${fetchError.message}`);
            }
            
            document = doc;
          }
          
          if (!document) {
            // Search by runsheet_id + row_index
            const { data: doc, error: fetchError } = await supabase
              .from('documents')
              .select('*')
              .eq('runsheet_id', runsheetId)
              .eq('row_index', rowIndex)
              .eq('user_id', user.id)
              .maybeSingle();

            if (fetchError) {
              throw new Error(`Database error: ${fetchError.message}`);
            }

            document = doc;
            
            // Store the document ID for future operations
            if (document) {
              setDocumentId(document.id);
            }
          }
          
          if (document) {
            return document;
          }
          
          // If not found and we have retries left, wait and try again
          if (attempt < maxRetries) {
            console.log(`Document not found, retrying in ${(attempt + 1) * 500}ms... (attempt ${attempt + 1}/${maxRetries + 1})`);
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
          }
        }
        
        return null;
      };

      const document = await findDocumentWithRetry();

      if (!document) {
        throw new Error('Document not found. The document may still be processing. Please wait a moment and try again.');
      }

      // Create new file path with the sanitized edited filename for storage  
      const pathParts = document.file_path.split('/');
      const sanitizedEditedFilename = sanitizeFilenameForStorage(editedFilename);
      const newFilePath = `${pathParts[0]}/${pathParts[1]}/${sanitizedEditedFilename}`;
      
      // Check if file exists before trying to move it
      const { data: existingFile, error: checkError } = await supabase.storage
        .from('documents')
        .list(pathParts.slice(0, -1).join('/'), {
          search: pathParts[pathParts.length - 1]
        });
      
      if (existingFile && existingFile.length > 0) {
        // File exists, try to move it
        const { error: moveError } = await supabase.storage
          .from('documents')
          .move(document.file_path, newFilePath);

        if (moveError) {
          throw moveError;
        }
      }

      // Update document record
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          stored_filename: editedFilename,
          file_path: newFilePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (updateError) {
        // Try to move file back on error (only if we moved it)
        if (existingFile && existingFile.length > 0) {
          await supabase.storage.from('documents').move(newFilePath, document.file_path);
        }
        throw updateError;
      }

      // Update local state immediately and mark that we have local changes
      setLocalFilename(editedFilename);
      setHasLocalChanges(true);
      setIsEditingName(false);
      setEditedFilename('');

      // Update parent with new filename
      onDocumentLinked(editedFilename);
      
      toast({
        title: "Document renamed",
        description: `File renamed to "${editedFilename}".`,
      });

    } catch (error) {
      toast({
        title: "Failed to rename document",
        description: error instanceof Error ? error.message : "There was an error renaming the document.",
        variant: "destructive",
      });
      setIsEditingName(false);
    }
  };


  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleMultipleFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
  };

  const openFileSelector = () => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const generateSmartFilename = async () => {
    if (!rowData || !currentFilename) {
      toast({
        title: "Cannot generate smart filename",
        description: "No row data available or no document filename to work with.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Extract the file extension from current filename
      const lastDotIndex = currentFilename.lastIndexOf('.');
      const extension = lastDotIndex > 0 ? currentFilename.substring(lastDotIndex) : '';

      // Generate smart filename using the database function
      const { data: smartFilename, error } = await supabase
        .rpc('generate_document_filename_with_preferences', {
          runsheet_data: [rowData],
          row_index: 0, // Since we're passing single row data
          original_filename: currentFilename,
          user_id: user.id
        });

      if (error) {
        throw error;
      }

      if (smartFilename && smartFilename !== currentFilename) {
        // Trigger rename directly with the smart filename
        await handleRenameWithFilename(smartFilename);
        
        toast({
          title: "Smart filename generated",
          description: `Filename updated to: ${smartFilename}`,
        });
      } else {
        toast({
          title: "No changes needed",
          description: "The generated smart filename is the same as the current filename.",
        });
      }

    } catch (error) {
      toast({
        title: "Failed to generate smart filename",
        description: error instanceof Error ? error.message : "Could not generate smart filename.",
        variant: "destructive",
      });
    }
  };

  const handleRenameWithFilename = async (newFilename: string) => {
    if (!newFilename.trim()) {
      return;
    }

    if (!runsheetId || runsheetId.trim() === '') {
      toast({
        title: "Error",
        description: "Invalid runsheet ID. Please save the runsheet first.",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const findDocumentWithRetry = async (maxRetries = 3) => {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          let document = null;
          
          if (documentId) {
            const { data: doc, error: fetchError } = await supabase
              .from('documents')
              .select('*')
              .eq('id', documentId)
              .eq('user_id', user.id)
              .maybeSingle();
            
            if (fetchError) {
              throw new Error(`Database error: ${fetchError.message}`);
            }
            
            document = doc;
          }
          
          if (!document) {
            const { data: doc, error: fetchError } = await supabase
              .from('documents')
              .select('*')
              .eq('runsheet_id', runsheetId)
              .eq('row_index', rowIndex)
              .eq('user_id', user.id)
              .maybeSingle();

            if (fetchError) {
              throw new Error(`Database error: ${fetchError.message}`);
            }

            document = doc;
            
            if (document) {
              setDocumentId(document.id);
            }
          }
          
          if (document) {
            return document;
          }
          
          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, (attempt + 1) * 500));
          }
        }
        
        return null;
      };

      const document = await findDocumentWithRetry();

      if (!document) {
        throw new Error('Document not found. The document may still be processing. Please wait a moment and try again.');
      }

      const pathParts = document.file_path.split('/');
      const sanitizedNewFilename = sanitizeFilenameForStorage(newFilename);
      const newFilePath = `${pathParts[0]}/${pathParts[1]}/${sanitizedNewFilename}`;
      
      const { data: existingFile, error: checkError } = await supabase.storage
        .from('documents')
        .list(pathParts.slice(0, -1).join('/'), {
          search: pathParts[pathParts.length - 1]
        });
      
      if (existingFile && existingFile.length > 0) {
        const { error: moveError } = await supabase.storage
          .from('documents')
          .move(document.file_path, newFilePath);

        if (moveError) {
          throw moveError;
        }
      }

      const { error: updateError } = await supabase
        .from('documents')
        .update({
          stored_filename: newFilename,
          file_path: newFilePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (updateError) {
        if (existingFile && existingFile.length > 0) {
          await supabase.storage.from('documents').move(newFilePath, document.file_path);
        }
        throw updateError;
      }

      setLocalFilename(newFilename);
      setHasLocalChanges(true);
      onDocumentLinked(newFilename);

    } catch (error) {
      throw error;
    }
  };

  if (localFilename && localFilename.trim() !== '') {
    // Use the local filename (updated immediately) or fallback to prop
    const filename = localFilename || currentFilename || 'document';
    
    // Check if the filename is a URL (for screenshots from extension)
    const isImageUrl = filename.startsWith('http') && (filename.includes('.png') || filename.includes('.jpg') || filename.includes('.jpeg'));
    
    return (
      <Card 
        className="p-3 border-dashed"
        onClick={(e) => {
          e.stopPropagation(); // Prevent cell selection
          e.preventDefault(); // Prevent default behavior
        }}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-1">
            {isImageUrl ? (
              <div className="flex items-center gap-2 flex-1">
                <img 
                  src={filename} 
                  alt="Screenshot preview" 
                  className="w-8 h-8 object-cover rounded border"
                  onError={(e) => {
                    // Fallback to file icon if image fails to load
                    e.currentTarget.style.display = 'none';
                    e.currentTarget.nextElementSibling?.classList.remove('hidden');
                  }}
                />
                <File className="w-4 h-4 text-muted-foreground flex-shrink-0 hidden" />
                <span 
                  className="text-sm font-medium truncate flex-1 cursor-pointer hover:text-primary" 
                  title={filename}
                  onClick={(e) => {
                    e.stopPropagation();
                    // Use a proper document viewer that preserves state
                    const newTab = window.open(filename, '_blank');
                    if (newTab) {
                      // Add listener to detect when user returns to this tab
                      const handleFocus = () => {
                        console.log('🔧 DocumentLinker: User returned from viewing document');
                        window.removeEventListener('focus', handleFocus);
                      };
                      window.addEventListener('focus', handleFocus);
                    }
                  }}
                >
                  Screenshot
                </span>
              </div>
            ) : (
              <>
                <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                {isEditingName ? (
                  <Input
                    value={editedFilename}
                    onChange={(e) => setEditedFilename(e.target.value)}
                    className="h-6 text-xs flex-1"
                    tabIndex={-1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameDocument();
                      if (e.key === 'Escape') {
                        setIsEditingName(false);
                        setEditedFilename('');
                      }
                    }}
                    autoFocus
                  />
                ) : (
                  <span 
                    className="text-sm font-medium truncate cursor-pointer hover:text-primary max-w-[350px] block" 
                    style={{ maxWidth: '350px' }}
                    title={filename}
                    onClick={() => {
                      setEditedFilename(filename);
                      setIsEditingName(true);
                    }}
                  >
                    {filename}
                  </span>
                )}
              </>
            )}
          </div>
          {!isEditingName && (
            <div className="flex items-center gap-1 flex-nowrap flex-shrink-0">
              {/* Show Analyze button only for spreadsheet uploads with stored file */}
              {isSpreadsheetUpload && uploadedFile && onAnalyzeDocument && (
                <Button
                  variant="ghost"
                  size="sm"
                  tabIndex={-1}
                  disabled={isAnalyzing}
                  onClick={async (e) => {
                    e.stopPropagation();
                    setIsAnalyzing(true);
                    
                    try {
                      toast({
                        title: "Analyzing Document",
                        description: "AI is thinking... extracting data from your document.",
                      });
                      
                      await onAnalyzeDocument(uploadedFile, filename);
                      
                      toast({
                        title: "Analysis Complete",
                        description: "Data has been extracted and applied to the row.",
                      });
                    } catch (error) {
                      console.error('Analysis error:', error);
                      toast({
                        title: "Analysis Failed",
                        description: "There was an error analyzing the document.",
                        variant: "destructive",
                      });
                    } finally {
                      setIsAnalyzing(false);
                    }
                  }}
                  className={`h-6 w-6 p-0 ${isAnalyzing ? 'text-blue-400' : 'text-blue-600 hover:text-blue-700'}`}
                  title={isAnalyzing ? "AI is thinking..." : "Analyze document and extract data"}
                >
                  <Brain className={`w-3 h-3 ${isAnalyzing ? 'animate-pulse' : ''}`} />
                </Button>
              )}
                {onOpenWorkspace && (
                  <Button
                    variant="ghost"
                    size="sm"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent cell edit mode
                      onOpenWorkspace();
                    }}
                    className="h-6 w-6 p-0"
                    title="Open full-screen workspace"
                  >
                    <Maximize2 className="w-3 h-3" />
                  </Button>
                )}
               <Button
                 variant="ghost"
                 size="sm"
                 tabIndex={-1}
                 onClick={(e) => {
                   e.stopPropagation(); // Prevent cell edit mode
                   setEditedFilename(filename);
                   setIsEditingName(true);
                 }}
                 className="h-6 w-6 p-0"
                 title="Edit filename"
               >
                 <Edit2 className="w-3 h-3" />
                </Button>
                {/* Smart Filename Generation Button - Only show if we have row data */}
                {rowData && (
                  <Button
                    variant="ghost"
                    size="sm"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation(); // Prevent cell edit mode
                      generateSmartFilename();
                    }}
                    className="h-6 w-6 p-0 text-purple-600 hover:text-purple-700"
                    title="Generate smart filename from row data"
                  >
                    <Sparkles className="w-3 h-3" />
                  </Button>
                )}
               <Button
                 variant="ghost"
                 size="sm"
                 tabIndex={-1}
                 onClick={async (e) => {
                  e.stopPropagation(); // Prevent cell edit mode
                  
                  try {
                    if (documentPath) {
                      // Use the provided document path
                      const url = supabase.storage.from('documents').getPublicUrl(documentPath).data.publicUrl;
                      // Use a proper document viewer that preserves state
                      const newTab = window.open(url, '_blank');
                      if (newTab) {
                        // Add listener to detect when user returns to this tab
                        const handleFocus = () => {
                          console.log('🔧 DocumentLinker: User returned from viewing document');
                          window.removeEventListener('focus', handleFocus);
                        };
                        window.addEventListener('focus', handleFocus);
                      }
                    } else {
                      // Fallback: fetch from database
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        return;
                      }
                      
                      const { data: document, error } = await supabase
                        .from('documents')
                        .select('file_path')
                        .eq('runsheet_id', runsheetId)
                        .eq('row_index', rowIndex)
                        .eq('user_id', user.id)
                        .single();
                      
                      if (error) {
                        toast({
                          title: "Error",
                          description: "Could not find document to view.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      if (document) {
                        const url = supabase.storage.from('documents').getPublicUrl(document.file_path).data.publicUrl;
                        // Use a proper document viewer that preserves state
                        const newTab = window.open(url, '_blank');
                        if (newTab) {
                          // Add listener to detect when user returns to this tab
                          const handleFocus = () => {
                            console.log('🔧 DocumentLinker: User returned from viewing document');
                            window.removeEventListener('focus', handleFocus);
                          };
                          window.addEventListener('focus', handleFocus);
                        }
                      } else {
                        toast({
                          title: "Error",
                          description: "Document not found in database.",
                          variant: "destructive",
                        });
                      }
                    }
                  } catch (error) {
                    toast({
                      title: "Error",
                      description: "Failed to open document.",
                      variant: "destructive",
                    });
                  }
                }}
                className="h-6 w-6 p-0"
                title="View document"
              >
                <ExternalLink className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation(); // Prevent cell edit mode
                  handleRemoveDocument();
                }}
                className="h-6 w-6 p-0 text-destructive hover:text-destructive"
                title="Remove document"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          )}
        </div>
      </Card>
    );
  }

    return (
      <>
        {showImageCombiner && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-background rounded-lg p-6 max-w-md w-full mx-4">
              <ImageCombiner
                files={selectedFiles}
                onCombined={handleImageCombined}
                onCancel={handleCancelCombiner}
              />
            </div>
          </div>
        )}
        <Card 
          className={`p-3 border-dashed transition-colors ${
            dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onClick={(e) => {
            e.stopPropagation(); // Prevent cell selection
            e.preventDefault(); // Prevent default behavior
          }}
        >
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            tabIndex={-1}
            onClick={openFileSelector}
            disabled={isUploading}
            className="h-8 text-xs"
          >
            <Upload className="w-3 h-3 mr-1" />
            {isUploading ? 'Uploading...' : 'Add File'}
          </Button>
          <ScreenshotCapture 
            onFileSelect={handleFileSelect}
            className="h-8 text-xs"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files || []);
              if (files.length > 0) {
                handleMultipleFiles(files);
              }
            }}
            accept="image/*,.pdf,.doc,.docx,.txt"
          />
        </div>
      </Card>
      </>
    );
};

export default DocumentLinker;
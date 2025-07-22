import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, File, ExternalLink, Trash2, Download, Edit2, Brain } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { ScreenshotCapture } from './ScreenshotCapture';

interface DocumentLinkerProps {
  runsheetId: string;
  rowIndex: number;
  existingDocumentUrl?: string;
  currentFilename?: string;
  documentPath?: string;
  onDocumentLinked: (filename: string) => void;
  onDocumentRemoved: () => void;
  onAnalyzeDocument?: (file: File, filename: string) => void;
  isSpreadsheetUpload?: boolean; // Flag to distinguish spreadsheet uploads from processor uploads
  autoAnalyze?: boolean; // Setting to control auto-analysis
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
  isSpreadsheetUpload = false,
  autoAnalyze = false
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [localFilename, setLocalFilename] = useState(currentFilename || '');
  const [hasLocalChanges, setHasLocalChanges] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null); // Store file for analysis
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Update local filename when props change, but only if we haven't made local changes
  React.useEffect(() => {
    if (!hasLocalChanges) {
      setLocalFilename(currentFilename || '');
    }
  }, [currentFilename, hasLocalChanges]);

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

  const handleFileSelect = async (file: File) => {
    if (!file) return;

    // Check if runsheet is saved first
    if (!runsheetId || runsheetId.trim() === '') {
      toast({
        title: "Save runsheet first",
        description: "Please save your runsheet before uploading documents.",
        variant: "destructive",
      });
      return;
    }

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

      // Create FormData for the upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('runsheetId', runsheetId);
      formData.append('rowIndex', rowIndex.toString());
      formData.append('originalFilename', file.name);

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
      handleFileSelect(files[0]);
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

  if (localFilename && localFilename.trim() !== '') {
    // Use the local filename (updated immediately) or fallback to prop
    const filename = localFilename || currentFilename || 'document';
    
    return (
      <Card 
        className="p-3 border-dashed"
        onClick={(e) => {
          e.stopPropagation(); // Prevent cell selection
          e.preventDefault(); // Prevent default behavior
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {isEditingName ? (
              <Input
                value={editedFilename}
                onChange={(e) => setEditedFilename(e.target.value)}
                className="h-6 text-xs flex-1"
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
                className="text-sm font-medium truncate flex-1 cursor-pointer hover:text-primary" 
                title={filename}
                onClick={() => {
                  setEditedFilename(filename);
                  setIsEditingName(true);
                }}
              >
                {filename}
              </span>
            )}
          </div>
          {!isEditingName && (
            <div className="flex items-center gap-1">
              {/* Show Analyze button only for spreadsheet uploads with stored file */}
              {isSpreadsheetUpload && uploadedFile && onAnalyzeDocument && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAnalyzeDocument(uploadedFile, filename);
                  }}
                  className="h-6 w-6 p-0 text-blue-600 hover:text-blue-700"
                  title="Analyze document and extract data"
                >
                  <Brain className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
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
              <Button
                variant="ghost"
                size="sm"
                onClick={async (e) => {
                  e.stopPropagation(); // Prevent cell edit mode
                  
                  try {
                    if (documentPath) {
                      // Use the provided document path
                      const url = supabase.storage.from('documents').getPublicUrl(documentPath).data.publicUrl;
                      window.open(url, '_blank');
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
                        window.open(url, '_blank');
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
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              handleFileSelect(file);
            }
          }}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </div>
    </Card>
  );
};

export default DocumentLinker;
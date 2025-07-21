import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, File, ExternalLink, Trash2, Download, Edit2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DocumentLinkerProps {
  runsheetId: string;
  rowIndex: number;
  existingDocumentUrl?: string;
  currentFilename?: string;
  documentPath?: string;
  onDocumentLinked: (filename: string) => void;
  onDocumentRemoved: () => void;
}

const DocumentLinker: React.FC<DocumentLinkerProps> = ({
  runsheetId,
  rowIndex,
  existingDocumentUrl,
  currentFilename,
  documentPath,
  onDocumentLinked,
  onDocumentRemoved
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedFilename, setEditedFilename] = useState('');
  const [localFilename, setLocalFilename] = useState(currentFilename || '');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Update local filename when props change
  React.useEffect(() => {
    setLocalFilename(currentFilename || '');
  }, [currentFilename]);

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
    console.log('🔧 DocumentLinker: handleFileSelect called with file:', file.name, file.size);
    if (!file) return;

    // Check if runsheet is saved first
    if (!runsheetId || runsheetId.trim() === '') {
      console.log('🔧 DocumentLinker: No runsheet ID available');
      toast({
        title: "Save runsheet first",
        description: "Please save your runsheet before uploading documents.",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('🔧 DocumentLinker: Starting upload process');
      setIsUploading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      console.log('🔧 DocumentLinker: User authentication check:', user ? 'authenticated' : 'not authenticated');
      if (!user) {
        console.log('🔧 DocumentLinker: No user found, showing auth required toast');
        toast({
          title: "Authentication required",
          description: "Please sign in to upload documents.",
          variant: "destructive",
        });
        return;
      }

      // Create FormData for the upload
      console.log('🔧 DocumentLinker: Creating FormData with:', {
        fileName: file.name,
        fileSize: file.size,
        runsheetId,
        rowIndex
      });
      const formData = new FormData();
      formData.append('file', file);
      formData.append('runsheetId', runsheetId);
      formData.append('rowIndex', rowIndex.toString());
      formData.append('originalFilename', file.name);

      // Get auth token
      const { data: { session } } = await supabase.auth.getSession();
      console.log('🔧 DocumentLinker: Session check:', session ? 'session exists' : 'no session');
      if (!session) {
        throw new Error('No active session');
      }

      // Call the store-document edge function
      console.log('🔧 DocumentLinker: Making fetch request to store-document edge function');
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

      console.log('🔧 DocumentLinker: Received response:', response.status, response.statusText);
      if (!response.ok) {
        const errorData = await response.json();
        console.log('🔧 DocumentLinker: Error response data:', errorData);
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      console.log('🔧 DocumentLinker: Upload successful, result:', result);
      
      // Use original filename instead of smart-generated filename
      console.log('🔧 DocumentLinker: Calling onDocumentLinked with original filename:', file.name);
      onDocumentLinked(file.name);
      
      console.log('🔧 DocumentLinker: Showing success toast');
      toast({
        title: "Document uploaded",
        description: `${file.name} has been linked to this row.`,
      });

    } catch (error) {
      console.error('Upload error:', error);
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
      console.error('Remove error:', error);
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

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('🔧 DocumentLinker: Starting rename process for filename:', editedFilename);

      // Get current document info
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !document) {
        console.error('🔧 DocumentLinker: Document fetch error:', fetchError);
        throw new Error('Document not found');
      }

      console.log('🔧 DocumentLinker: Current document:', document);

      // Create new file path with the sanitized edited filename for storage  
      const pathParts = document.file_path.split('/');
      const sanitizedEditedFilename = sanitizeFilenameForStorage(editedFilename);
      const newFilePath = `${pathParts[0]}/${pathParts[1]}/${sanitizedEditedFilename}`;
      
      console.log('🔧 DocumentLinker: Old file path:', document.file_path);
      console.log('🔧 DocumentLinker: New file path:', newFilePath);

      // Check if file exists before trying to move it
      const { data: existingFile, error: checkError } = await supabase.storage
        .from('documents')
        .list(pathParts.slice(0, -1).join('/'), {
          search: pathParts[pathParts.length - 1]
        });

      console.log('🔧 DocumentLinker: File exists check:', existingFile, checkError);
      
      if (existingFile && existingFile.length > 0) {
        // File exists, try to move it
        console.log('🔧 DocumentLinker: File exists, attempting to move');
        const { error: moveError } = await supabase.storage
          .from('documents')
          .move(document.file_path, newFilePath);

        if (moveError) {
          console.error('🔧 DocumentLinker: Move error:', moveError);
          throw moveError;
        }
        console.log('🔧 DocumentLinker: File moved successfully');
      } else {
        console.log('🔧 DocumentLinker: Original file not found in storage, skipping move operation');
        // File doesn't exist in storage, just update the database record
      }

      // Update document record
      console.log('🔧 DocumentLinker: Updating database record');
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          stored_filename: editedFilename,
          file_path: newFilePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (updateError) {
        console.error('🔧 DocumentLinker: Database update error:', updateError);
        // Try to move file back on error (only if we moved it)
        if (existingFile && existingFile.length > 0) {
          await supabase.storage.from('documents').move(newFilePath, document.file_path);
        }
        throw updateError;
      }

      console.log('🔧 DocumentLinker: Database updated successfully');

      // Update local state immediately
      setLocalFilename(editedFilename);

      // Update parent with new filename
      console.log('🔧 DocumentLinker: Calling onDocumentLinked with filename:', editedFilename);
      onDocumentLinked(editedFilename);

      // Force immediate state update
      setIsEditingName(false);
      setEditedFilename('');
      
      toast({
        title: "Document renamed",
        description: `File renamed to "${editedFilename}".`,
      });

    } catch (error) {
      console.error('🔧 DocumentLinker: Rename error:', error);
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
    console.log('🔧 DocumentLinker: openFileSelector called, fileInputRef:', fileInputRef.current);
    if (fileInputRef.current) {
      console.log('🔧 DocumentLinker: About to trigger file input click');
      fileInputRef.current.click();
      console.log('🔧 DocumentLinker: File input click triggered');
    } else {
      console.log('🔧 DocumentLinker: ERROR - fileInputRef.current is null!');
    }
  };

  if (localFilename && localFilename.trim() !== '') {
    // Use the local filename (updated immediately) or fallback to prop
    const filename = localFilename || currentFilename || 'document';
    
    console.log('🔧 DocumentLinker: Rendering with localFilename:', localFilename);
    console.log('🔧 DocumentLinker: Rendering with currentFilename:', currentFilename);
    console.log('🔧 DocumentLinker: Using filename:', filename);
    
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
                  console.log('🔧 DocumentLinker: View button clicked');
                  console.log('🔧 DocumentLinker: documentPath:', documentPath);
                  console.log('🔧 DocumentLinker: runsheetId:', runsheetId);
                  console.log('🔧 DocumentLinker: rowIndex:', rowIndex);
                  
                  try {
                    if (documentPath) {
                      console.log('🔧 DocumentLinker: Using provided document path:', documentPath);
                      // Use the provided document path
                      const url = supabase.storage.from('documents').getPublicUrl(documentPath).data.publicUrl;
                      console.log('🔧 DocumentLinker: Generated URL:', url);
                      window.open(url, '_blank');
                    } else {
                      console.log('🔧 DocumentLinker: No document path provided, falling back to database query');
                      // Fallback: fetch from database
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) {
                        console.log('🔧 DocumentLinker: No user found for database fallback');
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
                        console.error('🔧 DocumentLinker: Error fetching document from database:', error);
                        toast({
                          title: "Error",
                          description: "Could not find document to view.",
                          variant: "destructive",
                        });
                        return;
                      }
                      
                      if (document) {
                        console.log('🔧 DocumentLinker: Found document in database:', document);
                        const url = supabase.storage.from('documents').getPublicUrl(document.file_path).data.publicUrl;
                        console.log('🔧 DocumentLinker: Generated URL from database:', url);
                        window.open(url, '_blank');
                      } else {
                        console.log('🔧 DocumentLinker: No document found in database');
                        toast({
                          title: "Error",
                          description: "Document not found in database.",
                          variant: "destructive",
                        });
                      }
                    }
                  } catch (error) {
                    console.error('🔧 DocumentLinker: Error viewing document:', error);
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
      <div className="flex items-center justify-center">
        <Button
          variant="ghost"
          size="sm"
          onClick={openFileSelector}
          disabled={isUploading}
          className="h-8 text-xs"
        >
          <Upload className="w-3 h-3 mr-1" />
          {isUploading ? 'Uploading...' : 'Add Document'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            console.log('🔧 DocumentLinker: File input onChange triggered', e.target.files);
            const file = e.target.files?.[0];
            console.log('🔧 DocumentLinker: Selected file:', file);
            if (file) {
              console.log('🔧 DocumentLinker: About to call handleFileSelect');
              handleFileSelect(file);
            } else {
              console.log('🔧 DocumentLinker: No file selected');
            }
          }}
          onClick={(e) => {
            console.log('🔧 DocumentLinker: File input onClick triggered');
          }}
          onFocus={(e) => {
            console.log('🔧 DocumentLinker: File input onFocus triggered');
          }}
          onBlur={(e) => {
            console.log('🔧 DocumentLinker: File input onBlur triggered');
          }}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </div>
    </Card>
  );
};

export default DocumentLinker;
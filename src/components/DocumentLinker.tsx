import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, File, ExternalLink, Trash2, Download, Edit2, Check, X, RotateCcw } from 'lucide-react';
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileSelect = async (file: File) => {
    console.log('🔧 DocumentLinker: handleFileSelect called with file:', file.name, file.size);
    if (!file) return;

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
      
      console.log('🔧 DocumentLinker: Calling onDocumentLinked with filename:', result.storedFilename);
      onDocumentLinked(result.storedFilename);
      
      console.log('🔧 DocumentLinker: Showing success toast');
      toast({
        title: "Document uploaded",
        description: `${result.storedFilename} has been linked to this row.`,
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

      // Get current document info
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !document) {
        throw new Error('Document not found');
      }

      // Create new file path with the edited filename
      const pathParts = document.file_path.split('/');
      const newFilePath = `${pathParts[0]}/${pathParts[1]}/${editedFilename}`;

      // Move file in storage
      const { error: moveError } = await supabase.storage
        .from('documents')
        .move(document.file_path, newFilePath);

      if (moveError) {
        throw moveError;
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
        // Try to move file back on error
        await supabase.storage.from('documents').move(newFilePath, document.file_path);
        throw updateError;
      }

      // Update parent with new filename
      console.log('Calling onDocumentLinked with filename:', editedFilename);
      onDocumentLinked(editedFilename);

      setIsEditingName(false);
      
      toast({
        title: "Document renamed",
        description: `File renamed to "${editedFilename}".`,
      });

    } catch (error) {
      console.error('Rename error:', error);
      toast({
        title: "Failed to rename document",
        description: "There was an error renaming the document.",
        variant: "destructive",
      });
      setIsEditingName(false);
    }
  };

  const handleRevertToOriginal = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get current document info including original filename
      const { data: document, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('row_index', rowIndex)
        .eq('user_id', user.id)
        .single();

      if (fetchError || !document) {
        throw new Error('Document not found');
      }

      const originalFilename = document.original_filename;
      
      // Don't do anything if already using original name
      if (document.stored_filename === originalFilename) {
        toast({
          title: "Already using original name",
          description: "This document is already using its original filename.",
        });
        return;
      }

      // Create new file path with the original filename
      const pathParts = document.file_path.split('/');
      const newFilePath = `${pathParts[0]}/${pathParts[1]}/${originalFilename}`;

      // Move file in storage
      const { error: moveError } = await supabase.storage
        .from('documents')
        .move(document.file_path, newFilePath);

      if (moveError) {
        throw moveError;
      }

      // Update document record
      const { error: updateError } = await supabase
        .from('documents')
        .update({
          stored_filename: originalFilename,
          file_path: newFilePath,
          updated_at: new Date().toISOString()
        })
        .eq('id', document.id);

      if (updateError) {
        // Try to move file back on error
        await supabase.storage.from('documents').move(newFilePath, document.file_path);
        throw updateError;
      }

      // Update parent with original filename
      onDocumentLinked(originalFilename);
      
      toast({
        title: "Reverted to original name",
        description: `File name reverted to "${originalFilename}".`,
      });

    } catch (error) {
      console.error('Revert error:', error);
      toast({
        title: "Failed to revert filename",
        description: "There was an error reverting to the original filename.",
        variant: "destructive",
      });
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

  if (currentFilename && currentFilename.trim() !== '') {
    // Use the current filename from the Document File Name column
    const filename = currentFilename || 'document';
    
    return (
      <Card className="p-3 border-dashed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-1">
            <File className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            {isEditingName ? (
              <div className="flex items-center gap-1 flex-1">
                <Input
                  value={editedFilename}
                  onChange={(e) => setEditedFilename(e.target.value)}
                  className="h-6 text-xs flex-1"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRenameDocument();
                    if (e.key === 'Escape') setIsEditingName(false);
                  }}
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleRenameDocument}
                  className="h-6 w-6 p-0 text-green-600"
                >
                  <Check className="w-3 h-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsEditingName(false)}
                  className="h-6 w-6 p-0 text-red-600"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
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
                onClick={handleRevertToOriginal}
                className="h-6 w-6 p-0"
                title="Revert to original filename"
              >
                <RotateCcw className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditedFilename(filename);
                  setIsEditingName(true);
                }}
                className="h-6 w-6 p-0"
                title="Rename file"
              >
                <Edit2 className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  try {
                    if (documentPath) {
                      // Use the provided document path
                      const url = supabase.storage.from('documents').getPublicUrl(documentPath).data.publicUrl;
                      window.open(url, '_blank');
                    } else {
                      // Fallback: fetch from database
                      const { data: { user } } = await supabase.auth.getUser();
                      if (!user) return;
                      
                      const { data: document, error } = await supabase
                        .from('documents')
                        .select('file_path')
                        .eq('runsheet_id', runsheetId)
                        .eq('row_index', rowIndex)
                        .eq('user_id', user.id)
                        .single();
                      
                      if (error) {
                        console.error('Error fetching document:', error);
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
                      }
                    }
                  } catch (error) {
                    console.error('Error viewing document:', error);
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
                onClick={handleRemoveDocument}
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
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </div>
    </Card>
  );
};

export default DocumentLinker;
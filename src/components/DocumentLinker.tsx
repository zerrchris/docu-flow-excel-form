import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { Upload, File, ExternalLink, Trash2, Download } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface DocumentLinkerProps {
  runsheetId: string;
  rowIndex: number;
  existingDocumentUrl?: string;
  onDocumentLinked: (documentUrl: string, filename: string) => void;
  onDocumentRemoved: () => void;
}

const DocumentLinker: React.FC<DocumentLinkerProps> = ({
  runsheetId,
  rowIndex,
  existingDocumentUrl,
  onDocumentLinked,
  onDocumentRemoved
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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
      
      onDocumentLinked(result.fileUrl, result.storedFilename);
      
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
    fileInputRef.current?.click();
  };

  if (existingDocumentUrl) {
    const filename = existingDocumentUrl.split('/').pop() || 'document';
    
    return (
      <Card className="p-3 border-dashed">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <File className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-medium truncate max-w-[150px]" title={filename}>
              {filename}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open(existingDocumentUrl, '_blank')}
              className="h-6 w-6 p-0"
            >
              <ExternalLink className="w-3 h-3" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRemoveDocument}
              className="h-6 w-6 p-0 text-destructive hover:text-destructive"
            >
              <Trash2 className="w-3 h-3" />
            </Button>
          </div>
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
            const file = e.target.files?.[0];
            if (file) handleFileSelect(file);
          }}
          accept="image/*,.pdf,.doc,.docx,.txt"
        />
      </div>
    </Card>
  );
};

export default DocumentLinker;
import React, { useState, useCallback, useRef } from 'react';
import { Upload, File as FileIcon, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface SingleFileUploaderProps {
  onUploadComplete: (document: any) => void;
  runsheetId: string;
  acceptedFileTypes?: string;
  title?: string;
  description?: string;
}

export const SingleFileUploader: React.FC<SingleFileUploaderProps> = ({
  onUploadComplete,
  runsheetId,
  acceptedFileTypes = ".pdf",
  title = "Upload Document",
  description = "Click to upload or drag and drop your file here"
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileUpload = async (file: File) => {
    if (!file) return;

    setIsUploading(true);
    setUploadError(null);

    try {
      // Create FormData for file upload
      const formData = new FormData();
      formData.append('file', file);
      formData.append('runsheetId', runsheetId);
      formData.append('rowIndex', '0');

      // Get auth session
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      // Upload via edge function
      const response = await supabase.functions.invoke('store-document', {
        body: formData,
        headers: {
          Authorization: `Bearer ${session.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Upload failed');
      }

      if (!response.data?.document) {
        throw new Error('No document returned from upload');
      }

      // Success
      onUploadComplete(response.data.document);
      
      toast({
        title: "Upload Successful",
        description: `${file.name} uploaded successfully`,
      });

    } catch (error) {
      console.error('Upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Upload failed';
      setUploadError(errorMessage);
      
      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFileUpload(files[0]); // Only take the first file for single upload
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFileUpload(files[0]);
    }
  };

  const handleClick = () => {
    if (!isUploading) {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptedFileTypes}
        onChange={handleFileInputChange}
        className="hidden"
        disabled={isUploading}
      />
      
      <div
        className={`
          border-2 border-dashed rounded-lg p-8 text-center transition-all duration-200 cursor-pointer
          ${isDragOver 
            ? 'border-primary bg-primary/5 scale-105' 
            : 'border-gray-300 hover:border-gray-400'
          }
          ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
      >
        <div className="flex flex-col items-center space-y-4">
          {isUploading ? (
            <Loader2 className="h-8 w-8 text-primary animate-spin" />
          ) : uploadError ? (
            <AlertCircle className="h-8 w-8 text-destructive" />
          ) : (
            <Upload className="h-8 w-8 text-gray-400" />
          )}
          
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              {title}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {isUploading ? 'Uploading...' : description}
            </p>
            {acceptedFileTypes && (
              <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                Accepted: {acceptedFileTypes.replace(/\./g, '').toUpperCase()} files
              </p>
            )}
          </div>

          {uploadError && (
            <div className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
              {uploadError}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
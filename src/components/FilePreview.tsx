import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { X, Download, ExternalLink } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface FilePreviewProps {
  file: {
    id: string;
    name: string;
    url: string;
    size: number;
    created_at: string;
    type: 'mobile' | 'uploaded';
    project?: string;
    fullPath: string;
  } | null;
  isOpen: boolean;
  onClose: () => void;
}

export const FilePreview: React.FC<FilePreviewProps> = ({ file, isOpen, onClose }) => {
  const [isLoading, setIsLoading] = useState(false);

  if (!file) return null;

  const getFileType = (filename: string) => {
    const ext = filename.toLowerCase().split('.').pop();
    if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext || '')) return 'image';
    if (['pdf'].includes(ext || '')) return 'pdf';
    if (['txt', 'md', 'json', 'xml', 'csv'].includes(ext || '')) return 'text';
    return 'other';
  };

  const fileType = getFileType(file.name);

  const handleDownload = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(file.url);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Download error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div>
            <DialogTitle className="text-lg font-semibold">{file.name}</DialogTitle>
            <p className="text-sm text-muted-foreground mt-1">
              {formatFileSize(file.size)} • {new Date(file.created_at).toLocaleDateString()}
              {file.project && <span> • Project: {file.project}</span>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownload}
              disabled={isLoading}
            >
              <Download className="h-4 w-4 mr-2" />
              Download
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(file.url, '_blank')}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              Open
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-auto">
          {fileType === 'image' && (
            <div className="flex justify-center">
              <img
                src={file.url}
                alt={file.name}
                className="max-w-full max-h-[60vh] object-contain rounded-lg"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  e.currentTarget.nextElementSibling?.classList.remove('hidden');
                }}
              />
              <div className="hidden text-center text-muted-foreground">
                <p>Unable to load image preview</p>
              </div>
            </div>
          )}

          {fileType === 'pdf' && (
            <div className="w-full h-[60vh]">
              <iframe
                src={`${file.url}#view=FitH`}
                width="100%"
                height="100%"
                className="border rounded-lg"
                title={file.name}
              />
            </div>
          )}

          {fileType === 'text' && (
            <div className="bg-muted/30 rounded-lg p-4 max-h-[60vh] overflow-auto">
              <TextFilePreview url={file.url} />
            </div>
          )}

          {fileType === 'other' && (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-6xl mb-4">📄</div>
              <h3 className="text-lg font-medium mb-2">Preview not available</h3>
              <p>This file type cannot be previewed. Use the download button to view the file.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const TextFilePreview: React.FC<{ url: string }> = ({ url }) => {
  const [content, setContent] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  React.useEffect(() => {
    const loadContent = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to load file');
        const text = await response.text();
        // Limit content to first 10KB for performance
        setContent(text.slice(0, 10240));
      } catch (err) {
        setError('Failed to load file content');
      } finally {
        setIsLoading(false);
      }
    };

    loadContent();
  }, [url]);

  if (isLoading) return <div>Loading content...</div>;
  if (error) return <div className="text-destructive">{error}</div>;

  return (
    <pre className="whitespace-pre-wrap font-mono text-sm">
      {content}
      {content.length >= 10240 && (
        <div className="text-muted-foreground mt-4">
          ... Content truncated. Download file to view complete content.
        </div>
      )}
    </pre>
  );
};
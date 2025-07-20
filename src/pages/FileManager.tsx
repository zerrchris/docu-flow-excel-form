import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowLeft, Eye, Edit2, Trash2, Search, Calendar, FileImage, Smartphone, Upload as UploadIcon } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface StoredFile {
  id: string;
  name: string;
  url: string;
  size: number;
  created_at: string;
  type: 'mobile' | 'uploaded';
}

export const FileManager: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFile, setSelectedFile] = useState<StoredFile | null>(null);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    loadStoredFiles();
  }, []);

  const loadStoredFiles = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to view your files.",
          variant: "destructive",
        });
        return;
      }

      setIsLoading(true);
      const { data, error } = await supabase.storage
        .from('documents')
        .list(user.id, {
          limit: 100,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) throw error;

      const filesWithUrls = data?.map(file => {
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(`${user.id}/${file.name}`);

        return {
          id: file.id || file.name,
          name: file.name,
          url: urlData.publicUrl,
          size: file.metadata?.size || 0,
          created_at: file.created_at || new Date().toISOString(),
          type: file.name.startsWith('mobile_document') ? 'mobile' as const : 'uploaded' as const
        };
      }) || [];

      setFiles(filesWithUrls);
    } catch (error: any) {
      console.error('Error loading files:', error);
      toast({
        title: "Error",
        description: "Failed to load stored files.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleRename = async () => {
    if (!selectedFile || !newFileName.trim()) return;

    setIsRenaming(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Get the file extension
      const fileExtension = selectedFile.name.split('.').pop();
      const cleanNewName = newFileName.trim().replace(/[^a-zA-Z0-9\-_\s]/g, '').replace(/\s+/g, '_');
      const newFullName = `${cleanNewName}.${fileExtension}`;

      // Move the file to the new name
      const { error } = await supabase.storage
        .from('documents')
        .move(`${user.id}/${selectedFile.name}`, `${user.id}/${newFullName}`);

      if (error) throw error;

      toast({
        title: "File Renamed",
        description: `File renamed to "${newFullName}" successfully.`,
      });

      setShowRenameDialog(false);
      setSelectedFile(null);
      setNewFileName('');
      loadStoredFiles(); // Refresh the list
    } catch (error: any) {
      console.error('Error renaming file:', error);
      toast({
        title: "Rename Failed",
        description: error.message || "Failed to rename file.",
        variant: "destructive",
      });
    } finally {
      setIsRenaming(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedFile) return;

    setIsDeleting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const { error } = await supabase.storage
        .from('documents')
        .remove([`${user.id}/${selectedFile.name}`]);

      if (error) throw error;

      toast({
        title: "File Deleted",
        description: `"${selectedFile.name}" has been deleted successfully.`,
      });

      setShowDeleteDialog(false);
      setSelectedFile(null);
      loadStoredFiles(); // Refresh the list
    } catch (error: any) {
      console.error('Error deleting file:', error);
      toast({
        title: "Delete Failed",
        description: error.message || "Failed to delete file.",
        variant: "destructive",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    const MB = bytes / (1024 * 1024);
    return MB > 1 ? `${MB.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const openRenameDialog = (file: StoredFile) => {
    setSelectedFile(file);
    // Remove file extension for editing
    const nameWithoutExt = file.name.replace(/\.[^/.]+$/, '');
    setNewFileName(nameWithoutExt);
    setShowRenameDialog(true);
  };

  const openDeleteDialog = (file: StoredFile) => {
    setSelectedFile(file);
    setShowDeleteDialog(true);
  };

  const filteredFiles = files.filter(file =>
    file.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-50 bg-background border-b">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to App
            </Button>
            <h1 className="text-xl font-semibold">File Manager</h1>
          </div>
          
          <Button
            variant="outline"
            size="sm"
            onClick={loadStoredFiles}
            disabled={isLoading}
          >
            {isLoading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
      </div>

      <div className="container mx-auto p-4 space-y-6">
        {/* Search and Stats */}
        <Card className="p-4">
          <div className="flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search files..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <div className="flex gap-4 text-sm text-muted-foreground">
              <span>{files.length} total files</span>
              <span>•</span>
              <span>{files.filter(f => f.type === 'mobile').length} mobile captured</span>
              <span>•</span>
              <span>{files.filter(f => f.type === 'uploaded').length} uploaded</span>
            </div>
          </div>
        </Card>

        {/* Files Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6].map(i => (
              <Card key={i} className="p-4 animate-pulse">
                <div className="space-y-3">
                  <div className="w-full h-32 bg-muted rounded"></div>
                  <div className="h-4 bg-muted rounded w-3/4"></div>
                  <div className="h-3 bg-muted rounded w-1/2"></div>
                </div>
              </Card>
            ))}
          </div>
        ) : filteredFiles.length === 0 ? (
          <Card className="p-8 text-center">
            <FileImage className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-medium mb-2">
              {searchTerm ? 'No files found' : 'No stored files'}
            </h3>
            <p className="text-muted-foreground mb-4">
              {searchTerm 
                ? 'Try adjusting your search terms'
                : 'Upload documents or use Mobile Capture to get started'
              }
            </p>
            {!searchTerm && (
              <Button onClick={() => navigate('/mobile-capture')} className="gap-2">
                <Smartphone className="h-4 w-4" />
                Go to Mobile Capture
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFiles.map((file) => (
              <Card key={file.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="space-y-3">
                  {/* File Preview */}
                  <div className="relative w-full h-32 bg-muted rounded overflow-hidden">
                    <img
                      src={file.url}
                      alt={file.name}
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  </div>

                  {/* File Info */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-medium text-sm truncate flex-1" title={file.name}>
                        {file.name}
                      </h3>
                      <Badge variant={file.type === 'mobile' ? 'default' : 'secondary'} className="text-xs">
                        {file.type === 'mobile' ? (
                          <><Smartphone className="h-3 w-3 mr-1" /> Mobile</>
                        ) : (
                          <><UploadIcon className="h-3 w-3 mr-1" /> Upload</>
                        )}
                      </Badge>
                    </div>
                    
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(file.created_at)}</span>
                      <span>•</span>
                      <span>{formatFileSize(file.size)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => window.open(file.url, '_blank')}
                      className="flex-1 gap-2"
                    >
                      <Eye className="h-3 w-3" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openRenameDialog(file)}
                      className="gap-2"
                    >
                      <Edit2 className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openDeleteDialog(file)}
                      className="gap-2 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Rename File</DialogTitle>
            <DialogDescription>
              Enter a new name for "{selectedFile?.name}"
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Input
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
              placeholder="Enter new file name..."
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleRename();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRename} disabled={isRenaming || !newFileName.trim()}>
              {isRenaming ? 'Renaming...' : 'Rename'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Delete File</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{selectedFile?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={isDeleting}>
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
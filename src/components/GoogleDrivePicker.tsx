import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Cloud, Download, FileText, FolderOpen, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface GoogleDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  modifiedTime: string;
  webViewLink: string;
}

interface GoogleDrivePickerProps {
  isOpen: boolean;
  onClose: () => void;
  onFilesImported?: () => Promise<void>;
  onFileSelect?: (file?: File, fileName?: string) => void;
}

export const GoogleDrivePicker: React.FC<GoogleDrivePickerProps> = ({
  isOpen,
  onClose,
  onFilesImported,
  onFileSelect
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [files, setFiles] = useState<GoogleDriveFile[]>([]);
  const [accessToken, setAccessToken] = useState<string>('');
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const { toast } = useToast();

  const connectToDrive = async () => {
    try {
      setIsConnecting(true);
      
      // Get authorization URL from our edge function
      const { data, error } = await supabase.functions.invoke('google-drive-auth', {
        body: { action: 'get_auth_url' }
      });

      if (error) throw error;

      // Open Google OAuth in a popup
      const popup = window.open(
        data.auth_url,
        'google-auth',
        'width=500,height=600,scrollbars=yes,resizable=yes'
      );

      // Listen for the authorization code
      const messageListener = async (event: MessageEvent) => {
        if (event.origin !== window.location.origin) return;
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          const { code } = event.data;
          popup?.close();
          
          // Exchange code for access token
          const { data: tokenData, error: tokenError } = await supabase.functions.invoke('google-drive-auth', {
            body: { action: 'exchange_code', code }
          });

          if (tokenError) throw tokenError;

          setAccessToken(tokenData.access_token);
          await loadDriveFiles(tokenData.access_token);
          
          window.removeEventListener('message', messageListener);
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          popup?.close();
          throw new Error(event.data.error);
        }
      };

      window.addEventListener('message', messageListener);

      // Handle popup closed without completion
      const checkClosed = setInterval(() => {
        if (popup?.closed) {
          clearInterval(checkClosed);
          window.removeEventListener('message', messageListener);
          setIsConnecting(false);
        }
      }, 1000);

    } catch (error: any) {
      console.error('Drive connection error:', error);
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect to Google Drive",
        variant: "destructive",
      });
    } finally {
      setIsConnecting(false);
    }
  };

  const loadDriveFiles = async (token: string) => {
    try {
      setIsLoading(true);
      
      const response = await fetch(
        'https://www.googleapis.com/drive/v3/files?q=trashed=false&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=50',
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      if (!response.ok) throw new Error('Failed to fetch files');

      const data = await response.json();
      setFiles(data.files || []);
    } catch (error: any) {
      console.error('Error loading Drive files:', error);
      toast({
        title: "Error",
        description: "Failed to load Google Drive files",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const importSelectedFiles = async () => {
    if (selectedFiles.size === 0) return;

    try {
      setIsImporting(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      const selectedFileList = files.filter(file => selectedFiles.has(file.id));
      let successCount = 0;

      for (const file of selectedFileList) {
        try {
          // Get file content from our edge function
          const { data: fileData, error } = await supabase.functions.invoke('google-drive-auth', {
            body: { 
              action: 'get_file', 
              file_id: file.id,
              access_token: accessToken
            }
          });

          if (error) throw error;

          // Convert base64 to blob
          const binaryString = atob(fileData.content);
          const bytes = new Uint8Array(binaryString.length);
          for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          const blob = new Blob([bytes], { type: fileData.mimeType });

          // Upload to Supabase storage
          const fileName = file.name;
          const filePath = `${user.id}/google_drive/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from('documents')
            .upload(filePath, blob, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) throw uploadError;

          successCount++;
        } catch (error) {
          console.error(`Error importing ${file.name}:`, error);
        }
      }

      toast({
        title: "Import Complete",
        description: `Successfully imported ${successCount} of ${selectedFiles.size} files`,
      });

      if (onFilesImported) {
        await onFilesImported();
      }
      onClose();
    } catch (error: any) {
      console.error('Import error:', error);
      toast({
        title: "Import Failed",
        description: error.message || "Failed to import files",
        variant: "destructive",
      });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleFileSelection = (fileId: string) => {
    const newSelection = new Set(selectedFiles);
    if (newSelection.has(fileId)) {
      newSelection.delete(fileId);
    } else {
      newSelection.add(fileId);
    }
    setSelectedFiles(newSelection);
  };

  const formatFileSize = (bytes?: string) => {
    if (!bytes) return 'Unknown';
    const size = parseInt(bytes);
    if (size === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.startsWith('image/')) return '🖼️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('document')) return '📝';
    if (mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('folder')) return '📁';
    return '📎';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Cloud className="h-5 w-5" />
            Import from Google Drive
          </DialogTitle>
          <DialogDescription>
            Connect to your Google Drive and import files directly to your document manager.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!accessToken ? (
            <div className="text-center py-8">
              <Cloud className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <h3 className="text-lg font-medium mb-2">Connect to Google Drive</h3>
              <p className="text-muted-foreground mb-4">
                Authorize access to import files from your Google Drive account.
              </p>
              <Button onClick={connectToDrive} disabled={isConnecting}>
                {isConnecting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Cloud className="h-4 w-4 mr-2" />
                    Connect to Google Drive
                  </>
                )}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary" className="text-green-600">
                    Connected to Google Drive
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {selectedFiles.size} file(s) selected
                  </span>
                </div>
                <Button
                  onClick={importSelectedFiles}
                  disabled={selectedFiles.size === 0 || isImporting}
                >
                  {isImporting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Import Selected ({selectedFiles.size})
                    </>
                  )}
                </Button>
              </div>

              <div className="border rounded-lg max-h-96 overflow-auto">
                {isLoading ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading files...</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Select</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Size</TableHead>
                        <TableHead>Modified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {files.map((file) => (
                        <TableRow key={file.id}>
                          <TableCell>
                            <input
                              type="checkbox"
                              checked={selectedFiles.has(file.id)}
                              onChange={() => toggleFileSelection(file.id)}
                              className="rounded"
                            />
                          </TableCell>
                          <TableCell className="flex items-center gap-2">
                            <span>{getFileIcon(file.mimeType)}</span>
                            <span className="truncate">{file.name}</span>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {file.mimeType.split('/').pop()?.toUpperCase() || 'Unknown'}
                            </Badge>
                          </TableCell>
                          <TableCell>{formatFileSize(file.size)}</TableCell>
                          <TableCell>
                            {new Date(file.modifiedTime).toLocaleDateString()}
                          </TableCell>
                        </TableRow>
                      ))}
                      {files.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                            No files found in your Google Drive
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
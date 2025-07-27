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
  const [selectedFile, setSelectedFile] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const connectToDrive = async () => {
    try {
      setIsConnecting(true);
      
      // Get authorization URL from our edge function
      const { data, error } = await supabase.functions.invoke('google-drive-auth', {
        body: { 
          action: 'get_auth_url',
          origin: window.location.origin 
        }
      });

      if (error) throw error;

      // Open Google OAuth in a popup
      const popup = window.open(
        data.authUrl,
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
            body: { 
              action: 'exchange_code', 
              code,
              origin: window.location.origin 
            }
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
      
      // Filter query to only include spreadsheet files
      const query = 'trashed=false and (mimeType="application/vnd.google-apps.spreadsheet" or mimeType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" or mimeType="application/vnd.ms-excel" or mimeType="text/csv")';
      
      const response = await fetch(
        `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=50`,
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

  const openFile = async (fileId: string) => {
    try {
      setIsProcessing(true);
      const file = files.find(f => f.id === fileId);
      if (!file) return;

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
      const fileObject = new File([blob], file.name, { type: fileData.mimeType });

      // Pass file to parent component
      if (onFileSelect) {
        onFileSelect(fileObject, file.name);
      }
      
      onClose();
    } catch (error: any) {
      console.error('Error opening file:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to open file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const selectFile = (fileId: string) => {
    setSelectedFile(fileId);
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh] w-[95vw]">
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
                    Click on any file to open it
                  </span>
                </div>
              </div>

              <div className="border rounded-lg max-h-[60vh] overflow-auto">
                {isLoading || isProcessing ? (
                  <div className="text-center py-8">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>{isLoading ? 'Loading spreadsheets...' : 'Opening file...'}</p>
                  </div>
                ) : (
                  <div className="min-w-full overflow-x-auto">
                    <Table className="w-full min-w-[600px]">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="min-w-[200px]">Name</TableHead>
                          <TableHead className="w-24">Type</TableHead>
                          <TableHead className="w-20">Size</TableHead>
                          <TableHead className="w-28">Modified</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {files.map((file) => (
                          <TableRow 
                            key={file.id} 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => openFile(file.id)}
                          >
                            <TableCell>
                              <span className="truncate">{file.name}</span>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline">
                                {file.mimeType.includes('spreadsheet') ? 'SPREADSHEET' : 
                                 file.mimeType.includes('excel') ? 'EXCEL' :
                                 file.mimeType.includes('csv') ? 'CSV' : 'SPREADSHEET'}
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
                            <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                              No spreadsheet files found in your Google Drive
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
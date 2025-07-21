import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FolderOpen, FileSpreadsheet, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface GoogleDrivePickerProps {
  onFileSelect: (file: File, fileName: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
}

export const GoogleDrivePicker: React.FC<GoogleDrivePickerProps> = ({
  onFileSelect,
  isOpen,
  onClose,
}) => {
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const authenticateWithGoogle = async () => {
    setIsAuthenticating(true);
    
    try {
      console.log('Starting Google authentication...');
      console.log('Origin:', window.location.origin);
      
      // Get OAuth URL from our edge function
      const { data: authData, error: authError } = await supabase.functions.invoke('google-drive-auth', {
        body: { action: 'get_auth_url', origin: window.location.origin }
      });

      console.log('Auth response:', { authData, authError });

      if (authError) {
        console.error('Auth error:', authError);
        toast.error(`Failed to get auth URL: ${authError.message || JSON.stringify(authError)}`);
        throw authError;
      }

      if (!authData || !authData.authUrl) {
        console.error('No auth URL received:', authData);
        toast.error('No authorization URL received from server');
        throw new Error('No auth URL received from server');
      }

      console.log('Generated auth URL:', authData.authUrl);

      // Try to open popup with better detection
      const popup = window.open(authData.authUrl, 'google-auth', 'width=600,height=700,scrollbars=yes,resizable=yes');
      
      if (!popup || popup.closed || typeof popup.closed == 'undefined') {
        // Popup was blocked, redirect to new tab instead
        setIsAuthenticating(false);
        toast.error('Popup blocked! Opening Google authentication in a new tab...', {
          duration: 3000,
        });
        // Open in new tab as fallback
        window.open(authData.authUrl, '_blank');
        return;
      }

      // Listen for messages from the popup
      const messageListener = (event: MessageEvent) => {
        console.log('Received message:', event.data, 'from origin:', event.origin);
        
        if (event.origin !== window.location.origin) {
          console.log('Origin mismatch, ignoring message');
          return;
        }
        
        if (event.data.type === 'GOOGLE_AUTH_SUCCESS') {
          console.log('Authentication successful, closing popup and handling auth');
          popup.close();
          window.removeEventListener('message', messageListener);
          clearInterval(checkClosed);
          setIsAuthenticating(false);
          handleAuthCompletion(event.data.code);
        } else if (event.data.type === 'GOOGLE_AUTH_ERROR') {
          console.log('Authentication error:', event.data.error);
          popup.close();
          window.removeEventListener('message', messageListener);
          clearInterval(checkClosed);
          setIsAuthenticating(false);
          toast.error('Google authentication failed: ' + event.data.error);
        }
      };

      window.addEventListener('message', messageListener);

      // Check if popup is closed manually
      const checkClosed = setInterval(() => {
        if (popup.closed) {
          console.log('Popup was closed manually');
          clearInterval(checkClosed);
          window.removeEventListener('message', messageListener);
          setIsAuthenticating(false);
          
          // Check for fallback localStorage method
          const savedCode = localStorage.getItem('google_auth_code');
          if (savedCode) {
            console.log('Found saved auth code, proceeding with authentication');
            localStorage.removeItem('google_auth_code');
            handleAuthCompletion(savedCode);
          }
        }
      }, 1000);

    } catch (error) {
      setIsAuthenticating(false);
      toast.error('Failed to start Google authentication');
      console.error('Auth error:', error);
    }
  };

  const handleAuthCompletion = async (code: string) => {
    try {
      // Exchange code for access token
      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('google-drive-auth', {
        body: { 
          action: 'exchange_code', 
          code,
          origin: window.location.origin 
        }
      });

      if (tokenError) throw tokenError;

      if (tokenData.access_token) {
        toast.success('Successfully connected to Google Drive');
        setAccessToken(tokenData.access_token);
        loadDriveFiles(tokenData.access_token);
      } else {
        throw new Error('No access token received');
      }
    } catch (error) {
      toast.error('Failed to authenticate with Google Drive');
      console.error('Auth error:', error);
    }
  };

  const loadDriveFiles = async (token: string) => {
    setIsLoadingFiles(true);
    try {
      console.log('🔧 Loading Google Drive files with token:', token ? 'present' : 'missing');
      
      // Query for spreadsheet files
      const query = "mimeType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' or " +
                   "mimeType='application/vnd.ms-excel' or " +
                   "mimeType='application/vnd.google-apps.spreadsheet' or " +
                   "mimeType='text/csv'";
      
      console.log('🔧 Query:', query);
      const url = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size)`;
      console.log('🔧 Request URL:', url);
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      console.log('🔧 Response status:', response.status);
      console.log('🔧 Response ok:', response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('🔧 API Error:', errorText);
        throw new Error(`API request failed: ${response.status} ${errorText}`);
      }
      
      const data = await response.json();
      console.log('🔧 API Response data:', data);
      console.log('🔧 Files found:', data.files?.length || 0);
      
      setFiles(data.files || []);
    } catch (error) {
      console.error('🔧 Error loading files:', error);
      toast.error('Failed to load Google Drive files: ' + error.message);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const downloadFile = async (file: DriveFile) => {
    if (!accessToken) return;
    
    setIsDownloading(file.id);
    try {
      const { data, error } = await supabase.functions.invoke('google-drive-auth', {
        body: {
          action: 'get_file',
          fileId: file.id,
          access_token: accessToken,
        },
      });

      if (error) throw error;

      // Convert base64 to blob
      const binaryString = atob(data.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      const blob = new Blob([bytes], { type: data.mimeType });
      const fileObj = new File([blob], data.name, { type: data.mimeType });
      
      onFileSelect(fileObj, data.name);
      onClose();
      toast.success(`Successfully loaded ${data.name}`);
    } catch (error) {
      toast.error('Failed to download file from Google Drive');
      console.error('Download error:', error);
    } finally {
      setIsDownloading(null);
    }
  };

  const getFileIcon = (mimeType: string) => {
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType.includes('csv')) {
      return <FileSpreadsheet className="h-4 w-4" />;
    }
    return <FolderOpen className="h-4 w-4" />;
  };

  const formatFileSize = (size?: string) => {
    if (!size) return '';
    const bytes = parseInt(size);
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle>Import from Google Drive</DialogTitle>
        </DialogHeader>
        
        <div className="flex flex-col gap-4 flex-1 min-h-0">
          {!accessToken ? (
            <Card>
              <CardHeader className="text-center">
                <CardTitle>Connect to Google Drive</CardTitle>
                <CardDescription>
                  Authorize access to import spreadsheets from your Google Drive
                </CardDescription>
              </CardHeader>
              <CardContent className="text-center">
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Access your Google Drive spreadsheets to import them directly into your runsheet.
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Note: If you see a popup blocker warning, please allow popups for this site or use the new tab that opens.
                  </p>
                  <Button 
                    onClick={authenticateWithGoogle}
                    disabled={isAuthenticating}
                    className="w-full"
                  >
                    {isAuthenticating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Connecting...
                      </>
                    ) : (
                      <>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Connect Google Drive
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <div className="flex flex-col gap-4 flex-1 min-h-0">
              <div className="flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-semibold">Select a spreadsheet</h3>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => loadDriveFiles(accessToken)}
                  disabled={isLoadingFiles}
                >
                  {isLoadingFiles ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    'Refresh'
                  )}
                </Button>
              </div>
              
              <div className="flex-1 overflow-y-auto space-y-2 min-h-0 max-h-[50vh]">
                {isLoadingFiles ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin" />
                    <span className="ml-2">Loading files...</span>
                  </div>
                ) : files.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No spreadsheet files found in your Google Drive
                  </div>
                ) : (
                  files.map((file) => (
                    <Card 
                      key={file.id} 
                      className="cursor-pointer hover:bg-accent/50 transition-colors flex-shrink-0"
                      onClick={() => downloadFile(file)}
                    >
                      <CardContent className="flex items-center justify-between p-4">
                        <div className="flex items-center gap-3">
                          {getFileIcon(file.mimeType)}
                          <div>
                            <div className="font-medium">{file.name}</div>
                            <div className="text-sm text-muted-foreground">
                              {formatFileSize(file.size)}
                            </div>
                          </div>
                        </div>
                        {isDownloading === file.id && (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
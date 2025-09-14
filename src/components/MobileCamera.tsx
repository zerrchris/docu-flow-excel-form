import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Camera as CameraIcon, Upload, Image as ImageIcon, ZoomIn, FileText, Calendar, X, Combine } from 'lucide-react';
import { combineImages } from '@/utils/imageCombiner';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import RunsheetSelectionDialog from './RunsheetSelectionDialog';

interface MobileCameraProps {
  onPhotoUploaded?: (url: string, fileName: string) => void;
}

export const MobileCamera: React.FC<MobileCameraProps> = ({ onPhotoUploaded }) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<Array<{ url: string; name: string }>>([]);
  const [selectedRunsheet, setSelectedRunsheet] = useState<any>(null);
  const [showRunsheetSelectionDialog, setShowRunsheetSelectionDialog] = useState(false);
  const [fullscreenPhoto, setFullscreenPhoto] = useState<{url: string, name: string} | null>(null);
  const [runsheetDocuments, setRunsheetDocuments] = useState<Array<any>>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [capturedPages, setCapturedPages] = useState<Array<{ dataUrl: string; name: string }>>([]);
  const [isUploadingToRunsheet, setIsUploadingToRunsheet] = useState(false);
  const [showNamingDialog, setShowNamingDialog] = useState(false);
  const [documentName, setDocumentName] = useState('');

  const checkCameraPermissions = async () => {
    if (!Capacitor.isNativePlatform()) {
      return true; // On web, we'll use file input fallback
    }

    try {
      const permissions = await Camera.checkPermissions();
      if (permissions.camera === 'granted' && permissions.photos === 'granted') {
        return true;
      }

      const requestResult = await Camera.requestPermissions();
      return requestResult.camera === 'granted' && requestResult.photos === 'granted';
    } catch (error) {
      console.error('Error checking camera permissions:', error);
      return false;
    }
  };

  const startDocumentCapture = async () => {
    // Show runsheet selection dialog first
    setShowRunsheetSelectionDialog(true);
  };

  const handleRunsheetSelected = async (runsheet: any, isNew?: boolean) => {
    setSelectedRunsheet(runsheet);
    setShowRunsheetSelectionDialog(false);
    
    if (runsheet) {
      toast({
        title: isNew ? "Runsheet Created" : "Runsheet Selected",
        description: `Ready to capture photos for "${runsheet.name}"`,
      });
      // Load existing documents for this runsheet
      await loadRunsheetDocuments(runsheet.id);
    } else {
      toast({
        title: "No Runsheet Selected",
        description: "Please select a runsheet to continue",
        variant: "destructive"
      });
      setRunsheetDocuments([]);
    }
  };

  const loadRunsheetDocuments = async (runsheetId: string) => {
    setLoadingDocuments(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: documents, error } = await supabase
        .from('documents')
        .select('*')
        .eq('runsheet_id', runsheetId)
        .eq('user_id', user.id)
        .order('row_index', { ascending: true });

      if (error) {
        console.error('Error loading runsheet documents:', error);
        return;
      }

      setRunsheetDocuments(documents || []);
    } catch (error) {
      console.error('Error loading runsheet documents:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  const takePicture = async () => {
    try {
      const hasPermissions = await checkCameraPermissions();
      if (!hasPermissions) {
        toast({
          title: "Camera Permission Required",
          description: "Please allow camera access to take photos.",
          variant: "destructive",
        });
        return;
      }

      setIsUploading(true);

      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera,
      });

      if (image.dataUrl) {
        // Add to captured pages instead of uploading immediately
        const timestamp = Date.now();
        const fileName = `page_${capturedPages.length + 1}_${timestamp}.jpg`;
        setCapturedPages(prev => [...prev, { dataUrl: image.dataUrl!, name: fileName }]);
        
        toast({
          title: "Page Captured",
          description: `Page ${capturedPages.length + 1} captured. Take more photos or upload to runsheet.`,
        });
      }
    } catch (error) {
      console.error('Error taking picture:', error);
      toast({
        title: "Camera Error",
        description: "Failed to take picture. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const selectFromGallery = async () => {
    try {
      const hasPermissions = await checkCameraPermissions();
      if (!hasPermissions) {
        toast({
          title: "Photo Permission Required",
          description: "Please allow photo library access.",
          variant: "destructive",
        });
        return;
      }

      setIsUploading(true);

      const image = await Camera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos,
      });

      if (image.dataUrl) {
        // Add to captured pages instead of uploading immediately
        const timestamp = Date.now();
        const fileName = `gallery_${capturedPages.length + 1}_${timestamp}.jpg`;
        setCapturedPages(prev => [...prev, { dataUrl: image.dataUrl!, name: fileName }]);
        
        toast({
          title: "Photo Added",
          description: `Photo added to capture session. Take more photos or upload to runsheet.`,
        });
      }
    } catch (error) {
      console.error('Error selecting from gallery:', error);
      toast({
        title: "Gallery Error",
        description: "Failed to select photo. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const showUploadDialog = () => {
    if (!selectedRunsheet) {
      toast({
        title: "No Runsheet Selected",
        description: "Please select a runsheet first.",
        variant: "destructive",
      });
      return;
    }

    if (capturedPages.length === 0) {
      toast({
        title: "No Pages Captured",
        description: "Please capture some photos first.",
        variant: "destructive",
      });
      return;
    }

    // Generate default name
    const timestamp = new Date().toLocaleString();
    setDocumentName(`Document_${timestamp}`);
    setShowNamingDialog(true);
  };

  const uploadCombinedDocument = async () => {
    if (!documentName.trim()) {
      toast({
        title: "Name Required",
        description: "Please enter a name for the document.",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingToRunsheet(true);
    setShowNamingDialog(false);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to upload photos.",
          variant: "destructive",
        });
        return;
      }

      // Convert captured pages to files
      const files: File[] = [];
      for (let i = 0; i < capturedPages.length; i++) {
        const page = capturedPages[i];
        const response = await fetch(page.dataUrl);
        const blob = await response.blob();
        const file = new File([blob], `page_${i + 1}.jpg`, { type: 'image/jpeg' });
        files.push(file);
      }

      // Combine images using the image combiner utility
      const combinedResult = await combineImages(files, {
        type: 'vertical',
        quality: 0.8,
        maxWidth: 1200,
        filename: `${documentName.trim()}.jpg`
      });

      // Create form data
      const formData = new FormData();
      formData.append('file', combinedResult.file);
      formData.append('runsheetId', selectedRunsheet.id);
      formData.append('originalFilename', combinedResult.file.name);

      // Call edge function to add document to next available row
      const { data: result, error } = await supabase.functions.invoke(
        'add-mobile-document-to-runsheet',
        {
          body: formData,
        }
      );

      if (error) {
        throw error;
      }

      if (!result.success) {
        throw new Error(result.error || 'Failed to add document to runsheet');
      }

      // Add to recent photos
      const newPhoto = { url: result.fileUrl, name: result.storedFilename };
      setRecentPhotos(prev => [newPhoto, ...prev.slice(0, 4)]);

      // Add to runsheet documents list
      if (result.document) {
        setRunsheetDocuments(prev => [...prev, result.document].sort((a, b) => a.row_index - b.row_index));
      }

      // Notify parent component
      onPhotoUploaded?.(result.fileUrl, result.storedFilename);

      // Clear captured pages after successful upload
      setCapturedPages([]);
      setDocumentName('');

      toast({
        title: "Document Uploaded",
        description: `"${documentName}" uploaded successfully with ${files.length} pages combined.`,
      });

    } catch (error: any) {
      console.error('Error uploading combined document:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingToRunsheet(false);
    }
  };

  const clearCapturedPages = () => {
    setCapturedPages([]);
    toast({
      title: "Pages Cleared",
      description: "All captured pages have been cleared.",
    });
  };

  const removePage = (index: number) => {
    setCapturedPages(prev => prev.filter((_, i) => i !== index));
    toast({
      title: "Page Removed",
      description: `Page ${index + 1} has been removed.`,
    });
  };

  // Fallback file input for web browsers
  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          // Add to captured pages instead of uploading immediately
          const timestamp = Date.now();
          const fileName = `file_${capturedPages.length + 1}_${timestamp}.jpg`;
          setCapturedPages(prev => [...prev, { dataUrl: e.target!.result as string, name: fileName }]);
          
          toast({
            title: "File Added",
            description: `File added to capture session. Take more photos or upload to runsheet.`,
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="text-center space-y-2">
        <h2 className="text-xl font-semibold">Document Capture</h2>
        <p className="text-muted-foreground">
          {selectedRunsheet 
            ? `Ready to capture for: ${selectedRunsheet.name}`
            : "Select a runsheet to start capturing documents"
          }
        </p>
        {capturedPages.length > 0 && (
          <p className="text-sm text-primary font-medium">
            {capturedPages.length} page{capturedPages.length !== 1 ? 's' : ''} captured
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Select Runsheet Button */}
        <Button 
          onClick={startDocumentCapture}
          variant={selectedRunsheet ? "outline" : "default"}
          className="h-24 flex flex-col gap-2"
        >
          <Upload className="h-6 w-6" />
          <span className="text-sm">
            {selectedRunsheet ? "Change Runsheet" : "Select Runsheet"}
          </span>
        </Button>

        {/* Camera Button */}
        <Button 
          onClick={takePicture}
          disabled={isUploading}
          variant="default"
          className="h-24 flex flex-col gap-2"
        >
          <CameraIcon className="h-6 w-6" />
          <span className="text-sm">Take Photo</span>
          {isUploading && <span className="text-xs">Uploading...</span>}
        </Button>

        {/* Gallery Button */}
        {Capacitor.isNativePlatform() ? (
          <Button 
            onClick={selectFromGallery}
            disabled={isUploading}
            variant="outline"
            className="h-24 flex flex-col gap-2"
          >
            <ImageIcon className="h-6 w-6" />
            <span className="text-sm">Choose from Gallery</span>
          </Button>
        ) : (
          <div className="relative">
            <Button 
              disabled={isUploading}
              variant="outline"
              className="h-24 w-full flex flex-col gap-2"
              onClick={() => document.getElementById('file-input')?.click()}
            >
              <ImageIcon className="h-6 w-6" />
              <span className="text-sm">Choose File</span>
            </Button>
            <input
              id="file-input"
              type="file"
              accept="image/*"
              onChange={handleFileInputChange}
              className="hidden"
            />
          </div>
        )}
      </div>

      {/* Captured Pages Preview */}
      {capturedPages.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Captured Pages ({capturedPages.length})</h3>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={clearCapturedPages}
                disabled={isUploadingToRunsheet}
              >
                Clear All
              </Button>
              <Button
                size="sm"
                onClick={showUploadDialog}
                disabled={!selectedRunsheet || isUploadingToRunsheet}
                className="gap-1"
              >
                {isUploadingToRunsheet ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Combine className="h-3 w-3" />
                    Upload to Runsheet
                  </>
                )}
              </Button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {capturedPages.map((page, index) => (
              <div key={index} className="relative">
                <img
                  src={page.dataUrl}
                  alt={`Page ${index + 1}`}
                  className="w-full h-20 object-cover rounded border"
                />
                <div className="absolute top-1 left-1 bg-black/70 text-white text-xs px-1 rounded">
                  {index + 1}
                </div>
                <Button
                  size="sm"
                  variant="destructive"
                  className="absolute top-1 right-1 h-5 w-5 p-0 text-xs"
                  onClick={() => removePage(index)}
                >
                  ×
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-1 right-1 h-5 w-5 p-0"
                  onClick={() => setFullscreenPhoto({ url: page.dataUrl, name: `Page ${index + 1}` })}
                >
                  <ZoomIn className="h-2 w-2" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Photos */}
      {recentPhotos.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium">Recent Photos</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {recentPhotos.map((photo, index) => (
              <div key={index} className="relative">
                <img
                  src={photo.url}
                  alt={photo.name}
                  className="w-full h-20 object-cover rounded cursor-pointer border"
                  onClick={() => setFullscreenPhoto(photo)}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  className="absolute bottom-1 right-1 h-6 w-6 p-0"
                  onClick={() => setFullscreenPhoto(photo)}
                >
                  <ZoomIn className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Runsheet Documents */}
      {selectedRunsheet && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">Documents in "{selectedRunsheet.name}"</h3>
            <span className="text-xs text-muted-foreground">
              {runsheetDocuments.length} document{runsheetDocuments.length !== 1 ? 's' : ''}
            </span>
          </div>
          
          {loadingDocuments ? (
            <div className="text-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary mx-auto"></div>
              <p className="text-xs text-muted-foreground mt-2">Loading documents...</p>
            </div>
          ) : runsheetDocuments.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {runsheetDocuments.map((doc, index) => (
                <div key={doc.id} className="flex items-center gap-3 p-2 bg-muted/50 rounded-md text-sm">
                  <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{doc.stored_filename}</p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>Row {doc.row_index + 1}</span>
                      <span>•</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(doc.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                  {doc.file_path && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 w-6 p-0 flex-shrink-0"
                      onClick={() => {
                        const { data: urlData } = supabase.storage
                          .from('documents')
                          .getPublicUrl(doc.file_path);
                        setFullscreenPhoto({ url: urlData.publicUrl, name: doc.stored_filename });
                      }}
                    >
                      <ZoomIn className="h-3 w-3" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-4 text-muted-foreground">
              <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No documents yet</p>
              <p className="text-xs">Start capturing to see your documents here</p>
            </div>
          )}
        </div>
      )}

      {/* Runsheet Selection Dialog */}
      <RunsheetSelectionDialog
        open={showRunsheetSelectionDialog}
        onOpenChange={setShowRunsheetSelectionDialog}
        onRunsheetSelected={handleRunsheetSelected}
        title="Select Runsheet for Mobile Capture"
        description="Choose which runsheet to add your captured documents to. Photos will be added to the next available row."
      />

      {/* Document Naming Dialog */}
      <Dialog open={showNamingDialog} onOpenChange={setShowNamingDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Name Your Document</DialogTitle>
            <DialogDescription>
              Enter a name for this {capturedPages.length}-page document before uploading to the runsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="document-name">Document Name</Label>
              <Input
                id="document-name"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="Enter document name..."
                onKeyDown={(e) => e.key === 'Enter' && uploadCombinedDocument()}
              />
            </div>
            <div className="flex gap-2 justify-end">
              <Button
                variant="outline"
                onClick={() => setShowNamingDialog(false)}
                disabled={isUploadingToRunsheet}
              >
                Cancel
              </Button>
              <Button
                onClick={uploadCombinedDocument}
                disabled={isUploadingToRunsheet || !documentName.trim()}
              >
                {isUploadingToRunsheet ? (
                  <>
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white mr-2"></div>
                    Uploading...
                  </>
                ) : (
                  'Upload Document'
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Photo Dialog */}
      <Dialog open={!!fullscreenPhoto} onOpenChange={() => setFullscreenPhoto(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="p-4">
            <DialogTitle className="text-lg">{fullscreenPhoto?.name}</DialogTitle>
            <DialogDescription>
              Captured document photo
            </DialogDescription>
          </DialogHeader>
          {fullscreenPhoto && (
            <div className="relative flex-1 min-h-0">
              <img
                src={fullscreenPhoto.url}
                alt={fullscreenPhoto.name}
                className="w-full h-auto max-h-[70vh] object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
};
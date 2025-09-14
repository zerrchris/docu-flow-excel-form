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

    // Make this runsheet the active one so it shows up on /runsheet
    try {
      if (runsheet?.id) {
        sessionStorage.setItem('currentRunsheetId', runsheet.id);
      }
    } catch (e) {
      console.warn('Failed to set active runsheet id in sessionStorage', e);
    }
    
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

      // Refresh the runsheet documents list to show the new document
      if (selectedRunsheet) {
        await loadRunsheetDocuments(selectedRunsheet.id);
      }

      // Notify spreadsheet to refresh document map
      try {
        window.dispatchEvent(new CustomEvent('documentRecordCreated', {
          detail: {
            runsheetId: selectedRunsheet?.id,
            rowIndex: result.rowIndex,
            allPossibleIds: {
              activeRunsheetId: selectedRunsheet?.id,
              finalRunsheetId: selectedRunsheet?.id,
            },
          },
        }));
      } catch (e) {
        console.warn('Failed to dispatch documentRecordCreated event', e);
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
    <div className="relative min-h-screen bg-background">
      {/* Main Content Area */}
      <div className="pb-32 px-4 pt-6">
        {/* Header Section */}
        <div className="text-center space-y-3 mb-6">
          <h2 className="text-2xl font-bold">Document Capture</h2>
          <div className="space-y-2">
            {selectedRunsheet ? (
              <>
                <p className="text-muted-foreground text-base">
                  Capturing for: <span className="font-medium text-foreground">{selectedRunsheet.name}</span>
                </p>
                {capturedPages.length > 0 && (
                  <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-3 py-1 rounded-full">
                    <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                    <span className="text-sm font-medium">
                      {capturedPages.length} page{capturedPages.length !== 1 ? 's' : ''} captured
                    </span>
                  </div>
                )}
              </>
            ) : (
              <div className="space-y-3">
                <p className="text-muted-foreground text-base">
                  Select a runsheet to organize your captured documents
                </p>
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <p className="text-amber-800 text-sm font-medium">
                    📋 Runsheet Required
                  </p>
                  <p className="text-amber-700 text-xs mt-1">
                    Choose a runsheet to ensure your documents are properly organized and linked to your data.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Runsheet Selection - Always visible if none selected */}
        {!selectedRunsheet && (
          <div className="mb-6">
            <Button 
              onClick={startDocumentCapture}
              size="lg"
              className="w-full h-16 text-lg flex items-center gap-3"
            >
              <Upload className="h-6 w-6" />
              Select Runsheet to Begin Capture
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-2">
              Camera and gallery will be available after runsheet selection
            </p>
          </div>
        )}

        {/* Selected Runsheet Info */}
        {selectedRunsheet && (
          <div className="mb-6 p-4 bg-primary/5 border border-primary/20 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
                  <FileText className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedRunsheet.name}</p>
                  <p className="text-sm text-muted-foreground">Active runsheet</p>
                </div>
              </div>
              <Button 
                onClick={startDocumentCapture}
                variant="ghost"
                size="sm"
                className="text-primary"
              >
                Change
              </Button>
            </div>
          </div>
        )}

        {/* Captured Pages Preview */}
        {capturedPages.length > 0 && (
          <div className="space-y-4 mb-6">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Captured Pages</h3>
              <Button
                size="sm"
                variant="outline"
                onClick={clearCapturedPages}
                disabled={isUploadingToRunsheet}
                className="h-10 px-4"
              >
                Clear All
              </Button>
            </div>
            
            {/* Larger preview grid for better mobile interaction */}
            <div className="grid grid-cols-2 gap-4">
              {capturedPages.map((page, index) => (
                <div key={index} className="relative group">
                  <div className="aspect-[3/4] relative rounded-lg overflow-hidden border-2 border-border">
                    <img
                      src={page.dataUrl}
                      alt={`Page ${index + 1}`}
                      className="w-full h-full object-cover"
                    />
                    {/* Page number overlay */}
                    <div className="absolute top-2 left-2 bg-black/80 text-white text-sm px-2 py-1 rounded">
                      {index + 1}
                    </div>
                    {/* Remove button with larger touch target */}
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2 h-8 w-8 p-0 text-xs"
                      onClick={() => removePage(index)}
                      disabled={isUploadingToRunsheet}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent Photos */}
        {recentPhotos.length > 0 && (
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Recent Uploads</h3>
            <div className="grid grid-cols-1 gap-3">
              {recentPhotos.map((photo, index) => (
                <div
                  key={index}
                  className="flex items-center gap-3 p-3 border rounded-lg bg-card"
                >
                  <img
                    src={photo.url}
                    alt={photo.name}
                    className="w-12 h-12 object-cover rounded"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{photo.name}</p>
                    <p className="text-xs text-muted-foreground">Uploaded successfully</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setFullscreenPhoto(photo)}
                    className="h-8 w-8 p-0"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Document List */}
        {selectedRunsheet && runsheetDocuments.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">Runsheet Documents</h3>
              {loadingDocuments && (
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-primary"></div>
              )}
            </div>
            <div className="space-y-2">
              {runsheetDocuments.map((doc, index) => (
                <div key={doc.id} className="flex items-center gap-3 p-3 border rounded-lg bg-card">
                  <div className="w-8 h-8 bg-primary/10 rounded flex items-center justify-center">
                    <FileText className="h-4 w-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{doc.stored_filename}</p>
                    <p className="text-xs text-muted-foreground">Row {doc.row_index + 1}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-t border-border p-4 space-y-3">
        {selectedRunsheet ? (
          <>
            {/* Primary Action Buttons - Only show when runsheet is selected */}
            <div className="grid grid-cols-2 gap-3">
              <Button 
                onClick={takePicture}
                disabled={isUploading}
                size="lg"
                className="h-14 flex flex-col gap-1 relative"
              >
                <CameraIcon className="h-6 w-6" />
                <span className="text-sm font-medium">
                  {capturedPages.length === 0 ? "Camera" : `Page ${capturedPages.length + 1}`}
                </span>
                {isUploading && (
                  <div className="absolute inset-0 bg-black/20 rounded-md flex items-center justify-center">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  </div>
                )}
              </Button>

              {Capacitor.isNativePlatform() ? (
                <Button 
                  onClick={selectFromGallery}
                  disabled={isUploading}
                  variant="outline"
                  size="lg"
                  className="h-14 flex flex-col gap-1"
                >
                  <ImageIcon className="h-6 w-6" />
                  <span className="text-sm font-medium">Gallery</span>
                </Button>
              ) : (
                <div className="relative">
                  <Button 
                    disabled={isUploading}
                    variant="outline"
                    size="lg"
                    className="h-14 w-full flex flex-col gap-1"
                    onClick={() => document.getElementById('file-input')?.click()}
                  >
                    <ImageIcon className="h-6 w-6" />
                    <span className="text-sm font-medium">Choose File</span>
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

            {/* Upload Button - Only show when pages are captured */}
            {capturedPages.length > 0 && (
              <Button
                onClick={showUploadDialog}
                disabled={isUploadingToRunsheet}
                className="w-full h-12 text-base font-semibold gap-2"
              >
                {isUploadingToRunsheet ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Uploading {capturedPages.length} page{capturedPages.length !== 1 ? 's' : ''}...
                  </>
                ) : (
                  <>
                    <Combine className="h-5 w-5" />
                    Upload {capturedPages.length} Page{capturedPages.length !== 1 ? 's' : ''} to Runsheet
                  </>
                )}
              </Button>
            )}
          </>
        ) : (
          /* Runsheet Selection Required */
          <div className="text-center space-y-3">
            <Button 
              onClick={startDocumentCapture}
              size="lg"
              className="w-full h-14 text-lg"
            >
              <Upload className="h-6 w-6 mr-3" />
              Select Runsheet First
            </Button>
            <p className="text-xs text-muted-foreground">
              Runsheet selection is required for organized document capture
            </p>
          </div>
        )}
      </div>

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
    </div>
  );
};
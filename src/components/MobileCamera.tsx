import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera as CameraIcon, Upload, Image as ImageIcon, ZoomIn } from 'lucide-react';
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

  const handleRunsheetSelected = (runsheet: any, isNew?: boolean) => {
    setSelectedRunsheet(runsheet);
    setShowRunsheetSelectionDialog(false);
    
    if (runsheet) {
      toast({
        title: isNew ? "Runsheet Created" : "Runsheet Selected",
        description: `Photos will be added to "${runsheet.name}"`,
      });
      // Proceed directly to taking picture
      takePicture();
    } else {
      toast({
        title: "No Runsheet Selected",
        description: "Please select a runsheet to continue",
        variant: "destructive"
      });
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

      if (!selectedRunsheet) {
        toast({
          title: "No Runsheet Selected",
          description: "Please select a runsheet first.",
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
        await uploadPhotoToRunsheet(image.dataUrl);
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

      if (!selectedRunsheet) {
        toast({
          title: "No Runsheet Selected",
          description: "Please select a runsheet first.",
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
        await uploadPhotoToRunsheet(image.dataUrl);
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

  const uploadPhotoToRunsheet = async (dataUrl: string) => {
    try {
      if (!selectedRunsheet) {
        throw new Error('No runsheet selected');
      }

      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

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

      // Generate filename
      const timestamp = Date.now();
      const fileName = `mobile_document_${timestamp}.jpg`;

      // Create file from blob
      const file = new File([blob], fileName, { type: 'image/jpeg' });

      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      formData.append('runsheetId', selectedRunsheet.id);
      formData.append('originalFilename', fileName);

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

      // Notify parent component
      onPhotoUploaded?.(result.fileUrl, result.storedFilename);

      toast({
        title: "Photo Added",
        description: result.message,
      });

    } catch (error: any) {
      console.error('Error uploading photo to runsheet:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Fallback file input for web browsers
  const handleFileInputChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!selectedRunsheet) {
        toast({
          title: "No Runsheet Selected",
          description: "Please select a runsheet first.",
          variant: "destructive",
        });
        return;
      }

      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          await uploadPhotoToRunsheet(e.target.result as string);
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
            ? `Adding photos to: ${selectedRunsheet.name}`
            : "Select a runsheet to start capturing documents"
          }
        </p>
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
          disabled={isUploading || !selectedRunsheet}
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
            disabled={isUploading || !selectedRunsheet}
            variant="outline"
            className="h-24 flex flex-col gap-2"
          >
            <ImageIcon className="h-6 w-6" />
            <span className="text-sm">Choose from Gallery</span>
          </Button>
        ) : (
          <div className="relative">
            <Button 
              disabled={isUploading || !selectedRunsheet}
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

      {/* Runsheet Selection Dialog */}
      <RunsheetSelectionDialog
        open={showRunsheetSelectionDialog}
        onOpenChange={setShowRunsheetSelectionDialog}
        onRunsheetSelected={handleRunsheetSelected}
        title="Select Runsheet for Mobile Capture"
        description="Choose which runsheet to add your captured documents to. Photos will be added to the next available row."
      />

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
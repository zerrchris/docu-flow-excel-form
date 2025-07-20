import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Camera as CameraIcon, Upload, Image as ImageIcon } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface MobileCameraProps {
  onPhotoUploaded?: (url: string, fileName: string) => void;
}

export const MobileCamera: React.FC<MobileCameraProps> = ({ onPhotoUploaded }) => {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [recentPhotos, setRecentPhotos] = useState<Array<{ url: string; name: string }>>([]);

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
        await uploadPhoto(image.dataUrl);
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
        await uploadPhoto(image.dataUrl);
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

  const uploadPhoto = async (dataUrl: string) => {
    try {
      // Convert data URL to blob
      const response = await fetch(dataUrl);
      const blob = await response.blob();

      // Generate unique filename
      const timestamp = Date.now();
      const fileName = `mobile_document_${timestamp}.jpg`;

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

      // Upload to Supabase storage
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(`${user.id}/${fileName}`, blob, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (error) {
        throw error;
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(data.path);

      const publicUrl = urlData.publicUrl;

      // Add to recent photos
      const newPhoto = { url: publicUrl, name: fileName };
      setRecentPhotos(prev => [newPhoto, ...prev.slice(0, 4)]); // Keep last 5 photos

      // Notify parent component
      onPhotoUploaded?.(publicUrl, fileName);

      toast({
        title: "Photo Uploaded",
        description: "Document photo has been saved successfully.",
      });

    } catch (error: any) {
      console.error('Error uploading photo:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload photo. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Fallback for web platforms
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check if it's an image
    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid File",
        description: "Please select an image file.",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);

    try {
      // Convert to data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          await uploadPhoto(e.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Upload Error",
        description: "Failed to process image file.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const isMobile = Capacitor.isNativePlatform();

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="text-center">
          <h3 className="text-lg font-semibold mb-2">Document Camera</h3>
          <p className="text-sm text-muted-foreground">
            Take photos of documents to analyze later
          </p>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {isMobile ? (
            <>
              <Button
                onClick={takePicture}
                disabled={isUploading}
                className="gap-2 h-12"
                size="lg"
              >
                <CameraIcon className="h-5 w-5" />
                {isUploading ? 'Uploading...' : 'Take Photo'}
              </Button>
              
              <Button
                onClick={selectFromGallery}
                disabled={isUploading}
                variant="outline"
                className="gap-2 h-12"
                size="lg"
              >
                <ImageIcon className="h-5 w-5" />
                Select from Gallery
              </Button>
            </>
          ) : (
            <div className="space-y-2">
              <Button
                onClick={() => document.getElementById('file-upload')?.click()}
                disabled={isUploading}
                className="gap-2 h-12 w-full"
                size="lg"
              >
                <Upload className="h-5 w-5" />
                {isUploading ? 'Uploading...' : 'Upload Document Photo'}
              </Button>
              <input
                id="file-upload"
                type="file"
                accept="image/*"
                onChange={handleFileUpload}
                className="hidden"
              />
              <p className="text-xs text-muted-foreground text-center">
                For best experience, use the mobile app to take photos directly
              </p>
            </div>
          )}
        </div>

        {/* Recent Photos */}
        {recentPhotos.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Recent Photos</h4>
            <div className="grid grid-cols-2 gap-2">
              {recentPhotos.map((photo, index) => (
                <div key={index} className="relative aspect-square">
                  <img
                    src={photo.url}
                    alt={`Document ${index + 1}`}
                    className="w-full h-full object-cover rounded border"
                  />
                  <div className="absolute bottom-1 left-1 right-1 bg-black/60 text-white text-xs p-1 rounded text-center truncate">
                    {photo.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
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
  const [currentDocumentPages, setCurrentDocumentPages] = useState<string[]>([]);
  const [isCapturingDocument, setIsCapturingDocument] = useState(false);
  const [documentPageCount, setDocumentPageCount] = useState(1);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [showProjectDialog, setShowProjectDialog] = useState(false);
  const [currentProject, setCurrentProject] = useState('');
  const [projectName, setProjectName] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [instrumentNumber, setInstrumentNumber] = useState('');
  const [bookPage, setBookPage] = useState('');

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

  const startDocumentCapture = () => {
    console.log('Starting document capture, current project:', currentProject);
    // Check if we have a current project, if not show project dialog first
    if (!currentProject || currentProject.trim() === '') {
      console.log('No current project, showing project dialog');
      setShowProjectDialog(true);
    } else {
      console.log('Project exists, showing document name dialog');
      setShowNameDialog(true);
    }
  };

  const handleStartProject = () => {
    setCurrentProject(projectName);
    setShowProjectDialog(false);
    setShowNameDialog(true);
  };

  const handleStartWithName = () => {
    setShowNameDialog(false);
    // Proceed to take the first picture
    takePictureAfterNaming();
  };

  const takePictureAfterNaming = async () => {
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
        // Add to current document pages instead of uploading immediately
        setCurrentDocumentPages(prev => [...prev, image.dataUrl!]);
        
        if (!isCapturingDocument) {
          setIsCapturingDocument(true);
          setDocumentPageCount(1);
        } else {
          setDocumentPageCount(prev => prev + 1);
        }

        toast({
          title: "Page Captured",
          description: `Page ${documentPageCount + (isCapturingDocument ? 0 : 1)} added. Continue taking pictures or finish document.`,
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

      // Generate filename with document metadata
      const timestamp = Date.now();
      const instNum = instrumentNumber ? `_${instrumentNumber.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const bookPg = bookPage ? `_${bookPage.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const docName = documentName ? `_${documentName.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const fileName = `mobile_document${instNum}${bookPg}${docName}_${timestamp}.jpg`;

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

      // Upload to Supabase storage with project folder structure
      const projectPath = currentProject ? `${currentProject.replace(/[^a-zA-Z0-9]/g, '_')}/` : '';
      const filePath = `${user.id}/${projectPath}${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, blob, {
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

  const finishDocument = async () => {
    if (currentDocumentPages.length === 0) return;

    setIsUploading(true);
    try {
      // Upload all pages of the current document
      for (let i = 0; i < currentDocumentPages.length; i++) {
        await uploadPhoto(currentDocumentPages[i]);
      }

      toast({
        title: "Document Completed",
        description: `${currentDocumentPages.length} pages uploaded successfully.`,
      });

      // Reset for next document
      setCurrentDocumentPages([]);
      setIsCapturingDocument(false);
      setDocumentPageCount(1);
      setDocumentName('');
      setInstrumentNumber('');
      setBookPage('');
    } catch (error) {
      toast({
        title: "Upload Failed",
        description: "Failed to upload document pages.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const cancelDocument = () => {
    setCurrentDocumentPages([]);
    setIsCapturingDocument(false);
    setDocumentPageCount(1);
    setDocumentName('');
    setInstrumentNumber('');
    setBookPage('');
    toast({
      title: "Document Cancelled",
      description: "Document capture cancelled.",
    });
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

  const isMobile = Capacitor.isNativePlatform() || 
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="text-center space-y-2">
          <h3 className="text-lg font-semibold">Document Camera</h3>
          {currentProject ? (
            <div className="flex items-center justify-center gap-2">
              <p className="text-sm text-muted-foreground">
                Project: <span className="font-medium text-primary">{currentProject}</span>
              </p>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowProjectDialog(true)}
                className="text-xs"
              >
                Change
              </Button>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Take photos of documents to analyze later
            </p>
          )}
        </div>

        {/* Document Progress */}
        {isCapturingDocument && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
            <div className="text-center mb-3">
              <h4 className="font-medium text-primary">Document in Progress</h4>
              <p className="text-sm text-muted-foreground">
                {currentDocumentPages.length} page(s) captured
              </p>
            </div>
            
            {/* Preview of captured pages */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              {currentDocumentPages.map((pageUrl, index) => (
                <div key={index} className="aspect-square">
                  <img
                    src={pageUrl}
                    alt={`Page ${index + 1}`}
                    className="w-full h-full object-cover rounded border"
                  />
                  <div className="text-xs text-center mt-1">Page {index + 1}</div>
                </div>
              ))}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={finishDocument}
                disabled={isUploading}
                className="gap-2"
                size="sm"
              >
                ✓ Finish Document
              </Button>
              <Button
                onClick={cancelDocument}
                disabled={isUploading}
                variant="outline"
                className="gap-2"
                size="sm"
              >
                ✗ Cancel
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-3">
          {isMobile ? (
            <>
              <Button
                onClick={isCapturingDocument ? takePictureAfterNaming : startDocumentCapture}
                disabled={isUploading}
                className="gap-2 h-12"
                size="lg"
              >
                <CameraIcon className="h-5 w-5" />
                {isUploading ? 'Processing...' : 
                 isCapturingDocument ? `Take Page ${currentDocumentPages.length + 1}` : 'Take Photo'}
              </Button>
              
              {!isCapturingDocument && (
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
              )}
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

      {/* Document Naming Dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Name Your Document</DialogTitle>
            <DialogDescription>
              Please provide details to help identify this document
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="document-name">Document Name (Optional)</Label>
              <Input
                id="document-name"
                value={documentName}
                onChange={(e) => setDocumentName(e.target.value)}
                placeholder="e.g., Property Deed, Mortgage..."
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="instrument-number">Instrument Number</Label>
              <Input
                id="instrument-number"
                value={instrumentNumber}
                onChange={(e) => setInstrumentNumber(e.target.value)}
                placeholder="e.g., 202400123456"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="book-page">Book/Page</Label>
              <Input
                id="book-page"
                value={bookPage}
                onChange={(e) => setBookPage(e.target.value)}
                placeholder="e.g., Book 1234, Page 567"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNameDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartWithName}>
              Start Taking Photos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Naming Dialog */}
      <Dialog open={showProjectDialog} onOpenChange={setShowProjectDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Start New Project</DialogTitle>
            <DialogDescription>
              Name your project to group related documents together
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">Project Name</Label>
              <Input
                id="project-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g., Property Survey 2024, Mortgage Docs..."
              />
            </div>
            {currentProject && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">
                  Current project: <span className="font-medium">{currentProject}</span>
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleStartProject} disabled={!projectName.trim()}>
              Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
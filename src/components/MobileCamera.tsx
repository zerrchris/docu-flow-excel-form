import React, { useState } from 'react';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Camera as CameraIcon, Upload, Image as ImageIcon, Plus, Search, ArrowLeft, ZoomIn, FolderOpen } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { offlineStorage } from '@/utils/offlineStorage';
import { syncService } from '@/utils/syncService';
import RunsheetSelectionDialog from './RunsheetSelectionDialog';

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
  const [showProjectSelectionDialog, setShowProjectSelectionDialog] = useState(false);
  const [showExistingProjectsDialog, setShowExistingProjectsDialog] = useState(false);
  const [currentProject, setCurrentProject] = useState('');
  const [selectedRunsheet, setSelectedRunsheet] = useState<any>(null);
  const [showRunsheetSelectionDialog, setShowRunsheetSelectionDialog] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [instrumentNumber, setInstrumentNumber] = useState('');
  const [bookPage, setBookPage] = useState('');
  const [existingProjects, setExistingProjects] = useState<Array<{name: string, lastModified: string}>>([]);
  const [recentProjects, setRecentProjects] = useState<Array<{name: string, lastModified: string}>>([]);
  const [projectSearchTerm, setProjectSearchTerm] = useState('');
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

  const loadExistingProjects = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get all folders in the user's directory
      const { data, error } = await supabase.storage
        .from('documents')
        .list(user.id, { limit: 100, offset: 0 });

      if (error) {
        console.error('Error loading projects:', error);
        return;
      }

      // Extract project folders with their last modified dates
      const projects: Array<{name: string, lastModified: string}> = [];
      
      for (const item of data || []) {
        if (item.id === null && item.name) {
          // This is a folder, get its last modified date by checking files inside
          const { data: folderFiles } = await supabase.storage
            .from('documents')
            .list(`${user.id}/${item.name}`, { 
              limit: 1, 
              sortBy: { column: 'updated_at', order: 'desc' }
            });
          
          const displayName = item.name.replace(/_/g, ' ');
          const lastModified = folderFiles?.[0]?.updated_at || item.updated_at || new Date().toISOString();
          
          projects.push({ name: displayName, lastModified });
        }
      }

      // Sort by last modified date (most recent first)
      projects.sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime());
      
      setExistingProjects(projects);
      // Take first 5 for recent projects
      setRecentProjects(projects.slice(0, 5));
    } catch (error) {
      console.error('Error loading existing projects:', error);
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
      setCurrentProject(runsheet.name); // Use runsheet name as project for file organization
      toast({
        title: isNew ? "Runsheet Created" : "Runsheet Selected",
        description: `Documents will be organized in "${runsheet.name}"`,
      });
    } else {
      setCurrentProject(''); // No runsheet selected
      toast({
        title: "No Runsheet Selected",
        description: "Documents will be stored without runsheet organization",
      });
    }
    
    // Proceed to document naming
    setShowNameDialog(true);
  };

  const handleStartProject = () => {
    setCurrentProject(projectName);
    setShowProjectDialog(false);
    setShowNameDialog(true);
  };

  const handleNewProject = () => {
    setShowProjectSelectionDialog(false);
    setCurrentProject('');
    setProjectName('');
    setShowProjectDialog(true);
  };

  const handleContinueProject = (project: string) => {
    setCurrentProject(project);
    setShowProjectSelectionDialog(false);
    setShowNameDialog(true);
  };

  const handleAddToExistingProject = async () => {
    setShowProjectSelectionDialog(false);
    await loadExistingProjects();
    setShowExistingProjectsDialog(true);
  };

  const startNewProject = () => {
    // Clear current project and show project dialog
    setCurrentProject('');
    setProjectName('');
    // Cancel any current document being captured
    if (isCapturingDocument) {
      cancelDocument();
    }
    setShowProjectDialog(true);
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
      // Generate filename with document metadata
      const timestamp = Date.now();
      const instNum = instrumentNumber ? `_${instrumentNumber.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const bookPg = bookPage ? `_${bookPage.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const docName = documentName ? `_${documentName.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const fileName = `mobile_document${instNum}${bookPg}${docName}_${timestamp}.jpg`;

      // Check if online - if offline, store locally
      if (!navigator.onLine) {
        await offlineStorage.storeImage({
          dataUrl,
          fileName,
          projectCode: currentProject?.replace(/[^a-zA-Z0-9]/g, '_'),
          projectName: currentProject,
          documentName
        });

        // Add to recent photos with offline indicator
        const newPhoto = { url: dataUrl, name: `${fileName} (offline)` };
        setRecentPhotos(prev => [newPhoto, ...prev.slice(0, 4)]);

        toast({
          title: "Photo Stored Offline",
          description: "Photo saved locally. Will sync when online.",
        });

        // Notify parent component with placeholder
        onPhotoUploaded?.(dataUrl, fileName);
        return;
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
      
      // If upload fails and we're online, try storing offline as fallback
      if (navigator.onLine) {
        try {
          const timestamp = Date.now();
          const instNum = instrumentNumber ? `_${instrumentNumber.replace(/[^a-zA-Z0-9]/g, '')}` : '';
          const bookPg = bookPage ? `_${bookPage.replace(/[^a-zA-Z0-9]/g, '')}` : '';
          const docName = documentName ? `_${documentName.replace(/[^a-zA-Z0-9]/g, '')}` : '';
          const fileName = `mobile_document${instNum}${bookPg}${docName}_${timestamp}.jpg`;

          await offlineStorage.storeImage({
            dataUrl,
            fileName,
            projectCode: currentProject?.replace(/[^a-zA-Z0-9]/g, '_'),
            projectName: currentProject,
            documentName
          });

          toast({
            title: "Upload Failed - Stored Offline",
            description: "Photo saved locally and will sync when possible.",
            variant: "destructive",
          });
        } catch (offlineError) {
          toast({
            title: "Upload Failed",
            description: error.message || "Failed to upload photo. Please try again.",
            variant: "destructive",
          });
        }
      }
    }
  };

  const uploadCombinedDocument = async (file: File) => {
    try {
      // Generate filename with document metadata
      const timestamp = Date.now();
      const instNum = instrumentNumber ? `_${instrumentNumber.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const bookPg = bookPage ? `_${bookPage.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const docName = documentName ? `_${documentName.replace(/[^a-zA-Z0-9]/g, '')}` : '';
      const extension = file.type === 'application/pdf' ? 'pdf' : 'jpg';
      const fileName = `mobile_document${instNum}${bookPg}${docName}_${timestamp}.${extension}`;

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication Required",
          description: "Please sign in to upload documents.",
          variant: "destructive",
        });
        return;
      }

      // Upload to Supabase storage with project folder structure
      const projectPath = currentProject ? `${currentProject.replace(/[^a-zA-Z0-9]/g, '_')}/` : '';
      const filePath = `${user.id}/${projectPath}${fileName}`;
      
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          contentType: file.type,
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

    } catch (error: any) {
      console.error('Error uploading combined document:', error);
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload combined document. Please try again.",
        variant: "destructive",
      });
    }
  };

  const finishDocument = async () => {
    if (currentDocumentPages.length === 0) return;

    setIsUploading(true);
    try {
      if (currentDocumentPages.length === 1) {
        // Single page - upload directly
        await uploadPhoto(currentDocumentPages[0]);
      } else {
        // Multiple pages - handle based on online status
        if (!navigator.onLine) {
          // Offline: Store multi-page document locally
          const timestamp = Date.now();
          const instNum = instrumentNumber ? `_${instrumentNumber.replace(/[^a-zA-Z0-9]/g, '')}` : '';
          const bookPg = bookPage ? `_${bookPage.replace(/[^a-zA-Z0-9]/g, '')}` : '';
          const docName = documentName ? `_${documentName.replace(/[^a-zA-Z0-9]/g, '')}` : '';
          const fileName = `mobile_document${instNum}${bookPg}${docName}_${timestamp}.pdf`;

          await offlineStorage.storeDocument({
            pages: currentDocumentPages,
            fileName,
            projectCode: currentProject?.replace(/[^a-zA-Z0-9]/g, '_'),
            projectName: currentProject,
            documentName
          });

          toast({
            title: "Document Stored Offline",
            description: `${currentDocumentPages.length} pages saved locally. Will sync when online.`,
          });
        } else {
          // Online: Combine into PDF and upload
          const { combineImages } = await import('@/utils/imageCombiner');
          
          // Convert data URLs to File objects
          const files: File[] = [];
          for (let i = 0; i < currentDocumentPages.length; i++) {
            const response = await fetch(currentDocumentPages[i]);
            const blob = await response.blob();
            const file = new File([blob], `page_${i + 1}.jpg`, { type: 'image/jpeg' });
            files.push(file);
          }

          // Combine into PDF
          const { file: combinedFile } = await combineImages(files, {
            type: 'pdf',
            quality: 0.8,
            maxWidth: 1200
          });

          // Upload the combined PDF
          await uploadCombinedDocument(combinedFile);

          toast({
            title: "Document Completed",
            description: `${currentDocumentPages.length} pages combined and uploaded successfully.`,
          });
        }
      }

      // Reset for next document
      setCurrentDocumentPages([]);
      setIsCapturingDocument(false);
      setDocumentPageCount(1);
      setDocumentName('');
      setInstrumentNumber('');
      setBookPage('');
    } catch (error) {
      console.error('Error finishing document:', error);
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

    setIsUploading(true);

    try {
      // Convert PDF to high-resolution image if needed
      let processedFile = file;
      if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
        console.log('🔧 MobileCamera: PDF detected, converting to high-resolution image...');
        
        try {
          const { convertPDFToImages, createFileFromBlob } = await import('@/utils/pdfToImage');
          const pdfPages = await convertPDFToImages(file, 4); // High resolution (300+ DPI)
          
          if (pdfPages.length === 0) {
            throw new Error('PDF conversion failed - no pages extracted');
          }

          // Use the first page and convert to a File object
          const firstPage = pdfPages[0];
          const originalName = file.name.replace(/\.pdf$/i, '');
          const imageFileName = `${originalName}_converted.png`;
          
          processedFile = createFileFromBlob(firstPage.blob, imageFileName);
          
          console.log('🔧 MobileCamera: PDF converted to image:', processedFile.name, 'Size:', processedFile.size);
          
          toast({
            title: "PDF converted",
            description: "PDF has been converted to a high-resolution image for optimal processing.",
            variant: "default",
          });
        } catch (conversionError) {
          console.error('🔧 MobileCamera: PDF conversion failed:', conversionError);
          toast({
            title: "PDF conversion failed",
            description: "Failed to convert PDF. Please try uploading as an image instead.",
            variant: "destructive",
          });
          return;
        }
      } else if (!processedFile.type.startsWith('image/')) {
        // Check if it's an image (after potential PDF conversion)
        toast({
          title: "Invalid File",
          description: "Please select an image or PDF file.",
          variant: "destructive",
        });
        return;
      }

      // Convert processed file to data URL
      const reader = new FileReader();
      reader.onload = async (e) => {
        if (e.target?.result) {
          await uploadPhoto(e.target.result as string);
        }
      };
      reader.readAsDataURL(processedFile);
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
               <div className="flex gap-1 flex-wrap justify-center">
                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={() => setShowProjectDialog(true)}
                   className="text-xs"
                 >
                   Rename
                 </Button>
                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={handleAddToExistingProject}
                   className="text-xs"
                 >
                   Add to Existing
                 </Button>
                 <Button
                   variant="ghost"
                   size="sm"
                   onClick={startNewProject}
                   className="text-xs gap-1"
                 >
                   <Plus className="h-3 w-3" />
                   New Project
                 </Button>
               </div>
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
                accept="image/*,application/pdf"
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
                <div 
                  key={index} 
                  className="relative aspect-square cursor-pointer group"
                  onClick={() => setFullscreenPhoto(photo)}
                >
                  <img
                    src={photo.url}
                    alt={`Document ${index + 1}`}
                    className="w-full h-full object-cover rounded border transition-transform group-hover:scale-105"
                  />
                  <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity rounded flex items-center justify-center">
                    <ZoomIn className="h-6 w-6 text-white" />
                  </div>
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

      {/* Project Selection Dialog */}
      <Dialog open={showProjectSelectionDialog} onOpenChange={setShowProjectSelectionDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Choose Project</DialogTitle>
            <DialogDescription>
              Start a new project or continue working on an existing one
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Button 
              onClick={handleNewProject}
              className="h-12 gap-2"
              size="lg"
            >
              <Plus className="h-5 w-5" />
              Start New Project
            </Button>
            
            <Button 
              onClick={handleAddToExistingProject}
              variant="outline"
              className="h-12 gap-2"
              size="lg"
            >
              Add to Existing Project
            </Button>
            
            {recentProjects.length > 0 && (
              <>
                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Or continue recent project
                    </span>
                  </div>
                </div>
                
                <div className="max-h-40 overflow-y-auto space-y-2">
                  {recentProjects.map((project, index) => (
                    <Button
                      key={index}
                      onClick={() => handleContinueProject(project.name)}
                      variant="outline"
                      className="h-12 w-full justify-start text-left"
                      size="lg"
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{project.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(project.lastModified).toLocaleDateString()}
                        </span>
                      </div>
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProjectSelectionDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Existing Projects Dialog */}
      <Dialog open={showExistingProjectsDialog} onOpenChange={setShowExistingProjectsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Select Existing Project</DialogTitle>
            <DialogDescription>
              Choose a project to add your new document to
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search projects..."
                value={projectSearchTerm}
                onChange={(e) => setProjectSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            
            {existingProjects.length > 0 ? (
              <div className="max-h-60 overflow-y-auto space-y-2">
                {existingProjects
                  .filter(project => 
                    project.name.toLowerCase().includes(projectSearchTerm.toLowerCase())
                  )
                  .map((project, index) => (
                    <Button
                      key={index}
                      onClick={() => {
                        setCurrentProject(project.name);
                        setShowExistingProjectsDialog(false);
                        setShowNameDialog(true);
                        setProjectSearchTerm('');
                      }}
                      variant="outline"
                      className="h-16 w-full justify-start text-left"
                      size="lg"
                    >
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{project.name}</span>
                        <span className="text-xs text-muted-foreground">
                          Last edited: {new Date(project.lastModified).toLocaleDateString()}
                        </span>
                      </div>
                    </Button>
                  ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No existing projects found</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Create a new project to get started
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExistingProjectsDialog(false)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fullscreen Photo Viewer */}
      <Dialog open={!!fullscreenPhoto} onOpenChange={() => setFullscreenPhoto(null)}>
        <DialogContent className="max-w-full max-h-full w-screen h-screen p-0 bg-black/95">
          <div className="relative w-full h-full flex flex-col">
            {/* Header with back button */}
            <div className="absolute top-4 left-4 z-10">
              <Button
                onClick={() => setFullscreenPhoto(null)}
                variant="secondary"
                size="sm"
                className="gap-2 bg-black/50 hover:bg-black/70 text-white border-white/20"
              >
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </div>

            {/* Photo */}
            {fullscreenPhoto && (
              <div className="flex-1 flex items-center justify-center p-4">
                <img
                  src={fullscreenPhoto.url}
                  alt="Fullscreen document"
                  className="max-w-full max-h-full object-contain"
                />
              </div>
            )}

            {/* Footer with filename */}
            {fullscreenPhoto && (
              <div className="absolute bottom-4 left-4 right-4 bg-black/60 text-white p-3 rounded text-center">
                <p className="text-sm font-medium truncate">{fullscreenPhoto.name}</p>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Runsheet Selection Dialog */}
      <RunsheetSelectionDialog
        open={showRunsheetSelectionDialog}
        onOpenChange={setShowRunsheetSelectionDialog}
        onRunsheetSelected={handleRunsheetSelected}
        title="Select Runsheet for Documents"
        description="Choose a runsheet to organize your captured documents"
      />
    </Card>
  );
};
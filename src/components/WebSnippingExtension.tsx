import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Scissors, X, Minimize2, Maximize2, Download, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { captureScreen, cleanupPreviewUrl, type CaptureResult } from '@/utils/screenCapture';
import { uploadFileToStorage } from '@/utils/fileStorage';

interface SnippedImage {
  id: string;
  name: string;
  blob: Blob;
  previewUrl: string;
  timestamp: number;
}

interface WebSnippingExtensionProps {
  isOpen: boolean;
  onClose: () => void;
  onImagesSnipped?: (files: File[]) => void;
}

export const WebSnippingExtension: React.FC<WebSnippingExtensionProps> = ({
  isOpen,
  onClose,
  onImagesSnipped
}) => {
  const { toast } = useToast();
  const [snippedImages, setSnippedImages] = useState<SnippedImage[]>([]);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isSnipping, setIsSnipping] = useState(false);

  const handleSnipImage = useCallback(async () => {
    if (isSnipping) return;
    
    setIsSnipping(true);
    try {
      const result: CaptureResult = await captureScreen();
      
      const snippedImage: SnippedImage = {
        id: `snip-${Date.now()}-${Math.random().toString(36).substring(2)}`,
        name: `snip-${snippedImages.length + 1}`,
        blob: result.blob,
        previewUrl: result.previewUrl,
        timestamp: result.timestamp
      };

      setSnippedImages(prev => [...prev, snippedImage]);
      
      toast({
        title: "Snip saved!",
        description: `Image captured and added to gallery.`,
      });
    } catch (error) {
      toast({
        title: "Snip failed",
        description: error instanceof Error ? error.message : "Failed to capture screen",
        variant: "destructive",
      });
    } finally {
      setIsSnipping(false);
    }
  }, [isSnipping, snippedImages.length, toast]);

  const handleRemoveSnip = useCallback((id: string) => {
    setSnippedImages(prev => {
      const imageToRemove = prev.find(img => img.id === id);
      if (imageToRemove) {
        cleanupPreviewUrl(imageToRemove.previewUrl);
      }
      return prev.filter(img => img.id !== id);
    });
  }, []);

  const handleSaveAll = useCallback(async () => {
    if (snippedImages.length === 0) return;

    try {
      const files = snippedImages.map(img => 
        new File([img.blob], `${img.name}.png`, { type: 'image/png' })
      );

      // Upload to storage
      const uploadPromises = files.map(file => uploadFileToStorage(file, 'documents', 'snips'));
      await Promise.all(uploadPromises);

      if (onImagesSnipped) {
        onImagesSnipped(files);
      }

      toast({
        title: "Snips saved!",
        description: `${files.length} images saved to your documents.`,
      });

      // Clear the gallery
      snippedImages.forEach(img => cleanupPreviewUrl(img.previewUrl));
      setSnippedImages([]);
    } catch (error) {
      toast({
        title: "Save failed",
        description: "Failed to save snipped images",
        variant: "destructive",
      });
    }
  }, [snippedImages, onImagesSnipped, toast]);

  const handleClearAll = useCallback(() => {
    snippedImages.forEach(img => cleanupPreviewUrl(img.previewUrl));
    setSnippedImages([]);
  }, [snippedImages]);

  if (!isOpen) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t shadow-lg">
      <Card className="rounded-none border-0 border-t">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Scissors className="h-4 w-4 text-primary" />
            <span className="font-medium text-sm">Web Snipping Tool</span>
            {snippedImages.length > 0 && (
              <span className="text-xs text-muted-foreground">
                ({snippedImages.length} snips)
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsMinimized(!isMinimized)}
            >
              {isMinimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Content */}
        {!isMinimized && (
          <div className="p-3">
            {/* Action Buttons */}
            <div className="flex items-center gap-2 mb-3">
              <Button
                onClick={handleSnipImage}
                disabled={isSnipping}
                variant="default"
                size="sm"
                className="gap-2"
              >
                <Scissors className="h-4 w-4" />
                {isSnipping ? 'Snipping...' : 'Snip Image'}
              </Button>
              
              {snippedImages.length > 0 && (
                <>
                  <Button
                    onClick={handleSaveAll}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Save All ({snippedImages.length})
                  </Button>
                  
                  <Button
                    onClick={handleClearAll}
                    variant="ghost"
                    size="sm"
                    className="gap-2 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                    Clear All
                  </Button>
                </>
              )}
            </div>

            {/* Image Gallery */}
            {snippedImages.length > 0 && (
              <div className="border rounded-lg p-2 bg-muted/50">
                <ScrollArea className="h-24">
                  <div className="flex gap-2">
                    {snippedImages.map((image) => (
                      <div key={image.id} className="relative group flex-shrink-0">
                        <img
                          src={image.previewUrl}
                          alt={image.name}
                          className="w-20 h-16 object-cover rounded border cursor-pointer hover:ring-2 hover:ring-primary"
                          onClick={() => window.open(image.previewUrl, '_blank')}
                        />
                        <Button
                          variant="destructive"
                          size="sm"
                          className="absolute -top-1 -right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => handleRemoveSnip(image.id)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-xs p-1 rounded-b text-center truncate">
                          {image.name}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </div>
            )}

            {snippedImages.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-4">
                Click "Snip Image" to start capturing content from webpages
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};
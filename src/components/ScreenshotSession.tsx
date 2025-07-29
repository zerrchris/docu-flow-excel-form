import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Camera, FileImage, FileText, Download, Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CaptureResult, captureScreen, cleanupPreviewUrl } from '@/utils/screenCapture';
import { CapturedScreenshots } from './CapturedScreenshots';
import { combineImages } from '@/utils/imageCombiner';

interface ScreenshotSessionProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (file: File) => void;
}

export const ScreenshotSession: React.FC<ScreenshotSessionProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [screenshots, setScreenshots] = useState<CaptureResult[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [previewScreenshot, setPreviewScreenshot] = useState<CaptureResult | null>(null);
  const { toast } = useToast();

  // Cleanup preview URLs when component unmounts or screenshots change
  useEffect(() => {
    return () => {
      screenshots.forEach(screenshot => {
        cleanupPreviewUrl(screenshot.previewUrl);
      });
    };
  }, []);

  const handleCapture = async () => {
    setIsCapturing(true);
    try {
      const result = await captureScreen();
      setScreenshots(prev => [...prev, result]);
      
      toast({
        title: "Screenshot Captured",
        description: `Page ${screenshots.length + 1} captured successfully.`,
      });
    } catch (error) {
      console.error('Capture failed:', error);
      toast({
        title: "Capture Failed",
        description: error instanceof Error ? error.message : "Failed to capture screenshot.",
        variant: "destructive",
      });
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRemoveScreenshot = (index: number) => {
    const screenshotToRemove = screenshots[index];
    cleanupPreviewUrl(screenshotToRemove.previewUrl);
    
    setScreenshots(prev => prev.filter((_, i) => i !== index));
    
    toast({
      title: "Screenshot Removed",
      description: `Page ${index + 1} removed from capture session.`,
    });
  };

  const handleCombineDocuments = async (type: 'pdf' | 'vertical') => {
    if (screenshots.length === 0) {
      toast({
        title: "No Screenshots",
        description: "Please capture at least one screenshot before combining.",
        variant: "destructive",
      });
      return;
    }

    setIsCombining(true);
    try {
      const files = screenshots.map(screenshot => screenshot.file);
      const { file } = await combineImages(files, { 
        type,
        maxWidth: 1200,
        quality: 0.9
      });

      // Clean up preview URLs
      screenshots.forEach(screenshot => {
        cleanupPreviewUrl(screenshot.previewUrl);
      });

      onComplete(file);
      setScreenshots([]);
      onClose();

      toast({
        title: "Document Created",
        description: `${screenshots.length} pages combined into ${type === 'pdf' ? 'PDF' : 'vertical image'}.`,
      });
    } catch (error) {
      console.error('Combine failed:', error);
      toast({
        title: "Combine Failed",
        description: "Failed to combine screenshots. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCombining(false);
    }
  };

  const handleClose = () => {
    // Clean up preview URLs
    screenshots.forEach(screenshot => {
      cleanupPreviewUrl(screenshot.previewUrl);
    });
    setScreenshots([]);
    setPreviewScreenshot(null);
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={handleClose}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Camera className="h-5 w-5" />
              Document Screenshot Capture
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col h-[70vh]">
            {/* Instructions */}
            <Card className="p-4 mb-4 bg-muted/50">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-blue-500 mt-0.5 shrink-0" />
                <div className="space-y-2 text-sm">
                  <p className="font-medium">How to capture multi-page documents:</p>
                  <ol className="list-decimal list-inside space-y-1 text-muted-foreground ml-2">
                    <li>Click "Capture Page" to take a screenshot of the current page</li>
                    <li>Scroll to the next page in your document</li>
                    <li>Click "Capture Page" again for the next page</li>
                    <li>Repeat until you've captured all pages</li>
                    <li>Choose "Combine as PDF" or "Combine Vertically" to create the final document</li>
                  </ol>
                </div>
              </div>
            </Card>

            {/* Controls */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleCapture}
                  disabled={isCapturing || isCombining}
                  className="gap-2"
                >
                  {isCapturing ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Camera className="h-4 w-4" />
                  )}
                  {isCapturing ? 'Capturing...' : 'Capture Page'}
                </Button>
                
                <Badge variant="secondary" className="gap-1">
                  <FileImage className="h-3 w-3" />
                  {screenshots.length} pages
                </Badge>
              </div>

              {screenshots.length > 0 && (
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleCombineDocuments('pdf')}
                    disabled={isCombining}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    {isCombining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <FileText className="h-4 w-4" />
                    )}
                    Combine as PDF
                  </Button>
                  
                  <Button
                    onClick={() => handleCombineDocuments('vertical')}
                    disabled={isCombining}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    {isCombining ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4" />
                    )}
                    Combine Vertically
                  </Button>
                </div>
              )}
            </div>

            <Separator />

            {/* Screenshots Display */}
            <div className="flex-1 overflow-hidden mt-4">
              <CapturedScreenshots
                screenshots={screenshots}
                onRemove={handleRemoveScreenshot}
                onPreview={setPreviewScreenshot}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      {previewScreenshot && (
        <Dialog open={!!previewScreenshot} onOpenChange={() => setPreviewScreenshot(null)}>
          <DialogContent className="max-w-4xl max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Screenshot Preview</DialogTitle>
            </DialogHeader>
            <div className="flex justify-center">
              <img
                src={previewScreenshot.previewUrl}
                alt="Screenshot preview"
                className="max-w-full max-h-[70vh] object-contain"
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
};
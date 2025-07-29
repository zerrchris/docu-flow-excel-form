import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, X, FileImage, FileText, Minimize2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { CaptureResult } from '@/utils/screenCapture';
import { combineImages } from '@/utils/imageCombiner';
import { AreaSelector } from './AreaSelector';

interface FloatingCaptureWindowProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: (file: File) => void;
}

export const FloatingCaptureWindow: React.FC<FloatingCaptureWindowProps> = ({
  isOpen,
  onClose,
  onComplete
}) => {
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [showAreaSelector, setShowAreaSelector] = useState(false);
  const { toast } = useToast();

  // Position the window in a fixed location
  const [position, setPosition] = useState({ x: 20, y: 20 });

  useEffect(() => {
    if (!isOpen) {
      setCaptures([]);
      setIsMinimized(false);
      setShowAreaSelector(false);
    }
  }, [isOpen]);

  const handleStartCapture = async () => {
    setIsCapturing(true);
    setShowAreaSelector(true);
  };

  const handleAreaSelected = async (croppedBlob: Blob) => {
    try {
      const timestamp = Date.now();
      const file = new File([croppedBlob], `capture-${timestamp}.png`, {
        type: 'image/png',
        lastModified: timestamp
      });

      const previewUrl = URL.createObjectURL(croppedBlob);

      const newCapture: CaptureResult = {
        blob: croppedBlob,
        file,
        timestamp,
        previewUrl
      };

      setCaptures(prev => [...prev, newCapture]);
      setShowAreaSelector(false);
      setIsCapturing(false);

      toast({
        title: "Area Captured",
        description: `Captured area ${captures.length + 1}. Continue capturing or combine when ready.`,
      });
    } catch (error) {
      console.error('Failed to process captured area:', error);
      toast({
        title: "Capture Failed",
        description: "Failed to process the captured area. Please try again.",
        variant: "destructive",
      });
      setIsCapturing(false);
      setShowAreaSelector(false);
    }
  };

  const handleCancelCapture = () => {
    setShowAreaSelector(false);
    setIsCapturing(false);
  };

  const handleRemoveCapture = (index: number) => {
    setCaptures(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleCombineDocuments = async () => {
    if (captures.length === 0) {
      toast({
        title: "No Captures",
        description: "Please capture at least one area before combining.",
        variant: "destructive",
      });
      return;
    }

    setIsCombining(true);
    try {
      const files = captures.map(capture => capture.file);
      const result = await combineImages(files, { 
        type: 'vertical', 
        maxWidth: 1200,
        quality: 0.9 
      });

      onComplete(result.file);
      
      // Cleanup
      captures.forEach(capture => URL.revokeObjectURL(capture.previewUrl));
      setCaptures([]);
      
      toast({
        title: "Document Combined",
        description: `Successfully combined ${files.length} captures into a single image.`,
      });
    } catch (error) {
      console.error('Failed to combine documents:', error);
      toast({
        title: "Combination Failed",
        description: "Failed to combine the captured areas. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCombining(false);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Floating Window */}
      <div
        className="fixed z-[9999] bg-background border rounded-lg shadow-2xl"
        style={{
          left: position.x,
          top: position.y,
          width: isMinimized ? '200px' : '320px',
          maxHeight: isMinimized ? '60px' : '500px'
        }}
      >
        <Card className="border-0 shadow-none">
          {/* Header */}
          <div className="flex items-center justify-between p-3 border-b">
            <div className="flex items-center gap-2">
              <Camera className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Document Capture</span>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => setIsMinimized(!isMinimized)}
              >
                <Minimize2 className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={onClose}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>

          {/* Content */}
          {!isMinimized && (
            <div className="p-3 space-y-3">
              {/* Instructions */}
              <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                Navigate to your document tab, then click "Capture Area" to select the document portion with crosshairs.
              </div>

              {/* Capture Controls */}
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleStartCapture}
                  disabled={isCapturing}
                  size="sm"
                  className="w-full"
                  variant="gradient"
                >
                  <Camera className="h-4 w-4" />
                  {isCapturing ? 'Ready to Select...' : 'Capture Area'}
                </Button>

                {captures.length > 0 && (
                  <Button
                    onClick={handleCombineDocuments}
                    disabled={isCombining}
                    size="sm"
                    variant="secondary"
                    className="w-full"
                  >
                    <FileImage className="h-4 w-4" />
                    Save Image ({captures.length})
                  </Button>
                )}
              </div>

              {/* Captured Areas Preview */}
              {captures.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-medium">Captured Areas ({captures.length})</div>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {captures.map((capture, index) => (
                      <div key={capture.timestamp} className="flex items-center gap-2 p-1 border rounded text-xs">
                        <img 
                          src={capture.previewUrl} 
                          alt={`Capture ${index + 1}`}
                          className="w-8 h-8 object-cover rounded"
                        />
                        <span className="flex-1">Area {index + 1}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => handleRemoveCapture(index)}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Area Selector Overlay */}
      {showAreaSelector && (
        <AreaSelector
          onAreaSelected={handleAreaSelected}
          onCancel={handleCancelCapture}
        />
      )}
    </>
  );
};
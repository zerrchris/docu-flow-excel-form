import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera, Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScreenshotSession } from './ScreenshotSession';
import { FloatingCaptureWindow } from './FloatingCaptureWindow';
import { isScreenCaptureSupported } from '@/utils/screenCapture';

interface ScreenshotCaptureProps {
  onFileSelect: (file: File) => void;
  className?: string;
}

export const ScreenshotCapture: React.FC<ScreenshotCaptureProps> = ({
  onFileSelect,
  className = ""
}) => {
  const [isSessionOpen, setIsSessionOpen] = useState(false);
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const { toast } = useToast();

  const handleStartCapture = () => {
    if (!isScreenCaptureSupported()) {
      toast({
        title: "Not Supported",
        description: "Screen capture is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.",
        variant: "destructive",
      });
      return;
    }

    setIsSessionOpen(true);
  };

  const handleStartDocumentCapture = () => {
    if (!isScreenCaptureSupported()) {
      toast({
        title: "Not Supported", 
        description: "Screen capture is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.",
        variant: "destructive",
      });
      return;
    }

    setIsFloatingOpen(true);
  };

  const handleSessionComplete = (file: File) => {
    onFileSelect(file);
    setIsSessionOpen(false);
  };

  const handleFloatingComplete = (file: File) => {
    onFileSelect(file);
    setIsFloatingOpen(false);
  };

  return (
    <>
      <div className={`flex gap-2 ${className}`}>
        <Button
          onClick={handleStartCapture}
          variant="outline"
          className="gap-2"
        >
          <Camera className="h-4 w-4" />
          Quick Capture
        </Button>
        
        <Button
          onClick={handleStartDocumentCapture}
          variant="gradient"
          className="gap-2"
        >
          <Target className="h-4 w-4" />
          Document Capture
        </Button>
      </div>

      <ScreenshotSession
        isOpen={isSessionOpen}
        onClose={() => setIsSessionOpen(false)}
        onComplete={handleSessionComplete}
      />

      <FloatingCaptureWindow
        isOpen={isFloatingOpen}
        onClose={() => setIsFloatingOpen(false)}
        onComplete={handleFloatingComplete}
      />
    </>
  );
};
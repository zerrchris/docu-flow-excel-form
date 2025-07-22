import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
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
  const [isFloatingOpen, setIsFloatingOpen] = useState(false);
  const { toast } = useToast();

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

  const handleFloatingComplete = (file: File) => {
    onFileSelect(file);
    setIsFloatingOpen(false);
  };

  return (
    <>
      <Button
        onClick={handleStartDocumentCapture}
        variant="gradient"
        className={`gap-2 ${className}`}
      >
        <Target className="h-4 w-4" />
        Document Capture
      </Button>

      <FloatingCaptureWindow
        isOpen={isFloatingOpen}
        onClose={() => setIsFloatingOpen(false)}
        onComplete={handleFloatingComplete}
      />
    </>
  );
};
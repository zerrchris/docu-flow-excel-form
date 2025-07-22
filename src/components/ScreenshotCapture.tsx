import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { ScreenshotSession } from './ScreenshotSession';
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

  const handleSessionComplete = (file: File) => {
    onFileSelect(file);
    setIsSessionOpen(false);
  };

  return (
    <>
      <Button
        onClick={handleStartCapture}
        variant="outline"
        className={`gap-2 ${className}`}
      >
        <Camera className="h-4 w-4" />
        Capture Screenshots
      </Button>

      <ScreenshotSession
        isOpen={isSessionOpen}
        onClose={() => setIsSessionOpen(false)}
        onComplete={handleSessionComplete}
      />
    </>
  );
};
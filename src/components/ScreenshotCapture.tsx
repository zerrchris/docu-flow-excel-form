import React from 'react';
import { Button } from '@/components/ui/button';
import { Target } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { isScreenCaptureSupported } from '@/utils/screenCapture';

interface ScreenshotCaptureProps {
  onFileSelect: (file: File) => void;
  className?: string;
}

export const ScreenshotCapture: React.FC<ScreenshotCaptureProps> = ({
  onFileSelect,
  className = ""
}) => {
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

    // Open popup window
    const popup = window.open(
      '/capture-popup',
      'DocumentCapture',
      'width=300,height=400,left=50,top=50,resizable=no,scrollbars=no,toolbar=no,menubar=no,location=no,status=no'
    );

    if (!popup) {
      toast({
        title: "Popup Blocked",
        description: "Please allow popups for this site to use document capture.",
        variant: "destructive",
      });
      return;
    }

    // Listen for messages from the popup
    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === 'DOCUMENT_CAPTURED' && event.data.file) {
        // Convert the file data back to a File object
        const { name, type, data } = event.data.file;
        const byteArray = new Uint8Array(data);
        const file = new File([byteArray], name, { type });
        
        onFileSelect(file);
        popup.close();
        window.removeEventListener('message', handleMessage);
        
        toast({
          title: "Document Captured",
          description: "Successfully captured and processed the document.",
        });
      }
      
      if (event.data.type === 'CAPTURE_CANCELLED') {
        popup.close();
        window.removeEventListener('message', handleMessage);
      }
    };

    window.addEventListener('message', handleMessage);

    // Clean up if popup is closed manually
    const checkClosed = setInterval(() => {
      if (popup.closed) {
        window.removeEventListener('message', handleMessage);
        clearInterval(checkClosed);
      }
    }, 1000);
  };

  return (
    <Button
      onClick={handleStartDocumentCapture}
      variant="gradient"
      className={`gap-2 ${className}`}
    >
      <Target className="h-4 w-4" />
      Document Capture
    </Button>
  );
};
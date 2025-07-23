import React from 'react';
import { Button } from '@/components/ui/button';
import { Scissors } from 'lucide-react';
import { isScreenCaptureSupported } from '@/utils/screenCapture';
import { useToast } from '@/hooks/use-toast';

interface WebSnippingButtonProps {
  onOpenSnipping: () => void;
  className?: string;
}

export const WebSnippingButton: React.FC<WebSnippingButtonProps> = ({
  onOpenSnipping,
  className = ""
}) => {
  const { toast } = useToast();

  const handleClick = () => {
    if (!isScreenCaptureSupported()) {
      toast({
        title: "Not Supported",
        description: "Screen capture is not supported in this browser. Please use a modern browser like Chrome, Firefox, or Edge.",
        variant: "destructive",
      });
      return;
    }

    onOpenSnipping();
  };

  return (
    <Button
      onClick={handleClick}
      variant="outline"
      size="sm"
      className={`gap-2 ${className}`}
    >
      <Scissors className="h-4 w-4" />
      Web Snipping
    </Button>
  );
};
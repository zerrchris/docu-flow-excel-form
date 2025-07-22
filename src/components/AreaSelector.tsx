import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { X, Check } from 'lucide-react';

interface AreaSelectorProps {
  onAreaSelected: (croppedBlob: Blob) => void;
  onCancel: () => void;
}

interface SelectionArea {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

export const AreaSelector: React.FC<AreaSelectorProps> = ({
  onAreaSelected,
  onCancel
}) => {
  const [isSelecting, setIsSelecting] = useState(false);
  const [selection, setSelection] = useState<SelectionArea | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    captureFullScreen();
  }, []);

  const captureFullScreen = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: window.screen.width },
          height: { ideal: window.screen.height }
        },
        audio: false
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      video.play();

      await new Promise((resolve) => {
        video.onloadedmetadata = resolve;
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      ctx.drawImage(video, 0, 0);
      stream.getTracks().forEach(track => track.stop());

      const dataUrl = canvas.toDataURL('image/png');
      setScreenshot(dataUrl);
    } catch (error) {
      console.error('Failed to capture screen:', error);
      onCancel();
    }
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!overlayRef.current) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    setIsSelecting(true);
    setSelection({
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting || !selection || !overlayRef.current) return;
    
    const rect = overlayRef.current.getBoundingClientRect();
    setSelection(prev => prev ? {
      ...prev,
      endX: e.clientX - rect.left,
      endY: e.clientY - rect.top
    } : null);
  };

  const handleMouseUp = () => {
    setIsSelecting(false);
  };

  const handleConfirmSelection = async () => {
    if (!selection || !screenshot || !canvasRef.current) return;

    try {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Could not get canvas context');

      // Load the screenshot image
      const img = new Image();
      img.onload = () => {
        // Calculate the actual selection coordinates relative to the original image
        const scaleX = img.width / window.innerWidth;
        const scaleY = img.height / window.innerHeight;
        
        const x = Math.min(selection.startX, selection.endX) * scaleX;
        const y = Math.min(selection.startY, selection.endY) * scaleY;
        const width = Math.abs(selection.endX - selection.startX) * scaleX;
        const height = Math.abs(selection.endY - selection.startY) * scaleY;

        // Set canvas size to the selection size
        canvas.width = width;
        canvas.height = height;

        // Draw the cropped area
        ctx.drawImage(img, x, y, width, height, 0, 0, width, height);

        // Convert to blob
        canvas.toBlob((blob) => {
          if (blob) {
            onAreaSelected(blob);
          }
        }, 'image/png', 1.0);
      };
      img.src = screenshot;
    } catch (error) {
      console.error('Failed to crop selection:', error);
      onCancel();
    }
  };

  const getSelectionStyle = () => {
    if (!selection) return {};
    
    const x = Math.min(selection.startX, selection.endX);
    const y = Math.min(selection.startY, selection.endY);
    const width = Math.abs(selection.endX - selection.startX);
    const height = Math.abs(selection.endY - selection.startY);
    
    return {
      left: x,
      top: y,
      width,
      height
    };
  };

  return (
    <div className="fixed inset-0 z-[10000]">
      {/* Screenshot Background */}
      {screenshot && (
        <img 
          src={screenshot} 
          alt="Screen capture"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
      
      {/* Overlay for selection */}
      <div
        ref={overlayRef}
        className="absolute inset-0 cursor-crosshair"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
      >
        {/* Dark overlay with hole for selection */}
        <div className="absolute inset-0 bg-black/50" />
        
        {/* Selection rectangle */}
        {selection && (
          <div
            className="absolute border-2 border-primary bg-primary/10"
            style={getSelectionStyle()}
          />
        )}
      </div>
      
      {/* Hidden canvas for cropping */}
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Control buttons */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex gap-2 z-[10001]">
        <div className="bg-background/90 backdrop-blur rounded-lg p-2 flex gap-2">
          <div className="text-sm text-foreground px-2 py-1">
            {selection ? 'Click and drag to select area, then confirm' : 'Click and drag to select the document area'}
          </div>
          {selection && (
            <Button
              onClick={handleConfirmSelection}
              size="sm"
              variant="gradient"
            >
              <Check className="h-4 w-4" />
              Confirm
            </Button>
          )}
          <Button
            onClick={onCancel}
            size="sm"
            variant="destructive"
          >
            <X className="h-4 w-4" />
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
};
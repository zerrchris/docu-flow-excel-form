import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Eye } from 'lucide-react';
import { CaptureResult } from '@/utils/screenCapture';

interface CapturedScreenshotsProps {
  screenshots: CaptureResult[];
  onRemove: (index: number) => void;
  onPreview: (screenshot: CaptureResult) => void;
}

export const CapturedScreenshots: React.FC<CapturedScreenshotsProps> = ({
  screenshots,
  onRemove,
  onPreview
}) => {
  if (screenshots.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p>No screenshots captured yet.</p>
        <p className="text-sm mt-1">Click "Capture Page" to start capturing.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-foreground">
          Captured Pages ({screenshots.length})
        </h4>
      </div>
      
      <div className="grid grid-cols-2 gap-3 max-h-64 overflow-y-auto">
        {screenshots.map((screenshot, index) => (
          <Card key={screenshot.timestamp} className="relative group overflow-hidden">
            <div className="aspect-[4/3] bg-muted">
              <img
                src={screenshot.previewUrl}
                alt={`Screenshot ${index + 1}`}
                className="w-full h-full object-cover"
              />
              
              {/* Overlay with controls */}
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => onPreview(screenshot)}
                  className="h-8 w-8 p-0"
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={() => onRemove(index)}
                  className="h-8 w-8 p-0"
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            {/* Page number indicator */}
            <div className="absolute top-2 left-2 bg-black/70 text-white text-xs px-2 py-1 rounded">
              Page {index + 1}
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
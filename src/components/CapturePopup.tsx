import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, X, FileImage, FileText, RefreshCw } from 'lucide-react';
import { CaptureResult } from '@/utils/screenCapture';
import { combineImages } from '@/utils/imageCombiner';
import { AreaSelector } from './AreaSelector';

export const CapturePopup: React.FC = () => {
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [showAreaSelector, setShowAreaSelector] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    document.title = 'Document Capture';
  }, []);

  const showMessage = (msg: string, type: 'info' | 'error' = 'info') => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

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

      showMessage(`Captured area ${captures.length + 1}. Continue capturing or combine when ready.`);
    } catch (error) {
      console.error('Failed to process captured area:', error);
      showMessage('Failed to process the captured area. Please try again.', 'error');
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

  const handleCombineDocuments = async (type: 'pdf' | 'vertical') => {
    if (captures.length === 0) {
      showMessage('Please capture at least one area before combining.', 'error');
      return;
    }

    setIsCombining(true);
    try {
      const files = captures.map(capture => capture.file);
      const result = await combineImages(files, { 
        type, 
        maxWidth: 1200,
        quality: 0.9 
      });

      // Convert file to array buffer for message passing
      const arrayBuffer = await result.file.arrayBuffer();
      const fileData = {
        name: result.file.name,
        type: result.file.type,
        data: Array.from(new Uint8Array(arrayBuffer))
      };

      // Send the file back to the parent window
      if (window.opener) {
        window.opener.postMessage({
          type: 'DOCUMENT_CAPTURED',
          file: fileData
        }, window.location.origin);
      }
      
      // Cleanup
      captures.forEach(capture => URL.revokeObjectURL(capture.previewUrl));
      setCaptures([]);
      
      showMessage(`Successfully combined ${files.length} captures into a ${type === 'pdf' ? 'PDF' : 'single image'}.`);
    } catch (error) {
      console.error('Failed to combine documents:', error);
      showMessage('Failed to combine the captured areas. Please try again.', 'error');
    } finally {
      setIsCombining(false);
    }
  };

  const handleClose = () => {
    if (window.opener) {
      window.opener.postMessage({ type: 'CAPTURE_CANCELLED' }, window.location.origin);
    }
    window.close();
  };

  return (
    <div className="min-h-screen bg-background p-4">
      <Card className="w-full max-w-sm mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            <span className="font-semibold">Document Capture</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Instructions */}
          <div className="text-sm text-muted-foreground bg-muted/50 p-3 rounded">
            <div className="font-medium mb-1">Instructions:</div>
            <ol className="text-xs space-y-1 list-decimal list-inside">
              <li>Navigate to your document in another tab/window</li>
              <li>Click "Capture Area" below</li>
              <li>Use crosshairs to select document portion</li>
              <li>Repeat for multiple pages/sections</li>
              <li>Combine when finished</li>
            </ol>
          </div>

          {/* Message */}
          {message && (
            <div className={`text-sm p-2 rounded ${message.includes('Failed') ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {message}
            </div>
          )}

          {/* Capture Controls */}
          <div className="space-y-2">
            <Button
              onClick={handleStartCapture}
              disabled={isCapturing}
              size="lg"
              className="w-full"
              variant="gradient"
            >
              <Camera className="h-4 w-4" />
              {isCapturing ? 'Ready to Select...' : 'Capture Area'}
            </Button>

            {captures.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleCombineDocuments('pdf')}
                  disabled={isCombining}
                  size="sm"
                  variant="secondary"
                >
                  {isCombining ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  PDF ({captures.length})
                </Button>
                <Button
                  onClick={() => handleCombineDocuments('vertical')}
                  disabled={isCombining}
                  size="sm"
                  variant="secondary"
                >
                  {isCombining ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                  Image ({captures.length})
                </Button>
              </div>
            )}
          </div>

          {/* Captured Areas Preview */}
          {captures.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Captured Areas ({captures.length})</div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {captures.map((capture, index) => (
                  <div key={capture.timestamp} className="flex items-center gap-2 p-2 border rounded">
                    <img 
                      src={capture.previewUrl} 
                      alt={`Capture ${index + 1}`}
                      className="w-12 h-12 object-cover rounded"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Area {index + 1}</div>
                      <div className="text-xs text-muted-foreground">
                        {new Date(capture.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
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
      </Card>

      {/* Area Selector Overlay */}
      {showAreaSelector && (
        <AreaSelector
          onAreaSelected={handleAreaSelected}
          onCancel={handleCancelCapture}
        />
      )}
    </div>
  );
};
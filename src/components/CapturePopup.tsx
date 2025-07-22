import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Camera, X, FileImage, FileText, RefreshCw, Plus } from 'lucide-react';
import { captureScreen, CaptureResult } from '@/utils/screenCapture';
import { combineImages } from '@/utils/imageCombiner';

export const CapturePopup: React.FC = () => {
  const [captures, setCaptures] = useState<CaptureResult[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isCombining, setIsCombining] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    document.title = 'Document Capture';
  }, []);

  const showMessage = (msg: string, type: 'info' | 'error' = 'info') => {
    setMessage(msg);
    setTimeout(() => setMessage(''), 3000);
  };

  const handleCaptureImage = async () => {
    setIsCapturing(true);
    try {
      const result = await captureScreen();
      
      setCaptures(prev => [...prev, result]);
      
      const isFirstCapture = captures.length === 0;
      showMessage(
        isFirstCapture 
          ? 'First page captured! Scroll to next page and capture again, or finish when done.'
          : `Page ${captures.length + 1} captured! Continue capturing or finish when done.`
      );
    } catch (error) {
      console.error('Failed to capture screen:', error);
      showMessage(
        error instanceof Error ? error.message : 'Failed to capture screen. Please try again.',
        'error'
      );
    } finally {
      setIsCapturing(false);
    }
  };

  const handleRemoveCapture = (index: number) => {
    setCaptures(prev => {
      const updated = [...prev];
      URL.revokeObjectURL(updated[index].previewUrl);
      updated.splice(index, 1);
      return updated;
    });
  };

  const handleFinishDocument = async (type: 'pdf' | 'vertical') => {
    if (captures.length === 0) {
      showMessage('Please capture at least one page before finishing.', 'error');
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
      
      showMessage(`Document successfully created with ${files.length} page${files.length > 1 ? 's' : ''}.`);
    } catch (error) {
      console.error('Failed to combine documents:', error);
      showMessage('Failed to combine the captured pages. Please try again.', 'error');
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

  const getButtonText = () => {
    if (captures.length === 0) {
      return 'Capture First Page';
    }
    return `Capture Page ${captures.length + 1}`;
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
              <li>Make sure your document is full-screen in another tab</li>
              <li>Click "Capture First Page" to take a screenshot</li>
              <li>Scroll to the next page in your document</li>
              <li>Click "Capture Page 2" to capture the next page</li>
              <li>Repeat until all pages are captured</li>
              <li>Click "Finish Document" to combine all pages</li>
            </ol>
          </div>

          {/* Message */}
          {message && (
            <div className={`text-sm p-2 rounded ${message.includes('Failed') || message.includes('try again') ? 'bg-destructive/10 text-destructive' : 'bg-primary/10 text-primary'}`}>
              {message}
            </div>
          )}

          {/* Capture Controls */}
          <div className="space-y-2">
            <Button
              onClick={handleCaptureImage}
              disabled={isCapturing}
              size="lg"
              className="w-full"
              variant="gradient"
            >
              {isCapturing ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Capturing...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  {getButtonText()}
                </>
              )}
            </Button>

            {captures.length > 0 && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  onClick={() => handleFinishDocument('pdf')}
                  disabled={isCombining}
                  size="sm"
                  variant="secondary"
                >
                  {isCombining ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
                  Finish as PDF
                </Button>
                <Button
                  onClick={() => handleFinishDocument('vertical')}
                  disabled={isCombining}
                  size="sm"
                  variant="secondary"
                >
                  {isCombining ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileImage className="h-4 w-4" />}
                  Finish as Image
                </Button>
              </div>
            )}
          </div>

          {/* Captured Pages Preview */}
          {captures.length > 0 && (
            <div className="space-y-2">
              <div className="text-sm font-medium">Captured Pages ({captures.length})</div>
              <div className="max-h-48 overflow-y-auto space-y-2">
                {captures.map((capture, index) => (
                  <div key={capture.timestamp} className="flex items-center gap-2 p-2 border rounded">
                    <img 
                      src={capture.previewUrl} 
                      alt={`Page ${index + 1}`}
                      className="w-12 h-12 object-cover rounded"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Page {index + 1}</div>
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
    </div>
  );
};
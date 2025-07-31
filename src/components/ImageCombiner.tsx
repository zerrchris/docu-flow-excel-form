import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, Combine } from 'lucide-react';
import { combineImages, CombineOptions } from '@/utils/imageCombiner';
import { useToast } from '@/hooks/use-toast';

interface ImageCombinerProps {
  files: File[];
  onCombined: (file: File, previewUrl: string) => void;
  onCancel: () => void;
}

const ImageCombiner: React.FC<ImageCombinerProps> = ({ files, onCombined, onCancel }) => {
  const [combineType, setCombineType] = useState<'vertical' | 'grid'>('vertical');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleCombine = async () => {
    if (files.length === 0) return;

    setIsProcessing(true);
    try {
      const options: CombineOptions = {
        type: combineType,
        quality: 0.8,
        maxWidth: 1200
      };

      const { file, previewUrl } = await combineImages(files, options);
      onCombined(file, previewUrl);
      
      toast({
        title: "Images combined successfully",
        description: `Created combined image with ${files.length} images.`,
      });
    } catch (error) {
      console.error('Error combining images:', error);
      toast({
        title: "Error combining images",
        description: "Please try again with different settings.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="space-y-4">
        <div className="flex items-center gap-2 mb-4">
          <Combine className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-semibold">Combine Images</h3>
        </div>
        
        <p className="text-sm text-muted-foreground">
          You've selected {files.length} images. Choose how to combine them:
        </p>

        <div className="space-y-2">
          <Label htmlFor="combine-type">Combination Type</Label>
          <Select value={combineType} onValueChange={(value) => setCombineType(value as any)}>
            <SelectTrigger>
              <SelectValue placeholder="Select combination type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="vertical">Vertical Collage (stack images vertically)</SelectItem>
              <SelectItem value="grid">Grid Layout (arrange in grid)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="text-xs text-muted-foreground space-y-1">
          <p><strong>Vertical:</strong> Creates one long image by stacking vertically</p>
          <p><strong>Grid:</strong> Arranges images in a square grid layout</p>
        </div>

        <div className="flex gap-2 pt-4">
          <Button 
            onClick={handleCombine} 
            disabled={isProcessing}
            className="flex-1"
          >
            {isProcessing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Combining...
              </>
            ) : (
              <>
                <Combine className="mr-2 h-4 w-4" />
                Combine Images
              </>
            )}
          </Button>
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Cancel
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default ImageCombiner;
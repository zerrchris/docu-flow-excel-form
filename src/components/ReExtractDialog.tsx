import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RotateCw, Sparkles } from 'lucide-react';

interface ReExtractDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fieldName: string;
  currentValue: string;
  onReExtract: (notes: string) => Promise<void>;
  isLoading?: boolean;
}

const ReExtractDialog: React.FC<ReExtractDialogProps> = ({
  isOpen,
  onClose,
  fieldName,
  currentValue,
  onReExtract,
  isLoading = false
}) => {
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!notes.trim()) {
      return;
    }
    
    await onReExtract(notes.trim());
    setNotes('');
    onClose();
  };

  const handleClose = () => {
    setNotes('');
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Re-extract "{fieldName}"
          </DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label className="text-sm font-medium text-muted-foreground">
              Current Value:
            </Label>
            <div className="mt-1 p-3 bg-muted/30 rounded-md text-sm">
              {currentValue || <span className="text-muted-foreground italic">Empty</span>}
            </div>
          </div>
          
          <div>
            <Label htmlFor="notes" className="text-sm font-medium">
              What's wrong? Provide feedback:
            </Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="E.g., 'The date should be from the top right corner' or 'Missing the second grantor name' or 'This should be empty - no value found'"
              className="mt-1 min-h-[80px]"
              disabled={isLoading}
            />
          </div>
          
          <div className="text-xs text-muted-foreground">
            The AI will re-analyze the document focusing on your feedback to correct this specific field.
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={handleClose} disabled={isLoading}>
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!notes.trim() || isLoading}
            className="gap-2"
          >
            {isLoading ? (
              <>
                <RotateCw className="h-4 w-4 animate-spin" />
                Re-extracting...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Re-extract Field
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ReExtractDialog;
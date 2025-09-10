import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { RotateCw, Sparkles, BookOpen } from 'lucide-react';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { toast } from '@/hooks/use-toast';

interface ReExtractDialogProps {
  isOpen: boolean;
  onClose: () => void;
  fieldName: string;
  currentValue: string;
  onReExtract: (notes: string) => Promise<void>;
  isLoading?: boolean;
  columns?: string[];
}

const ReExtractDialog: React.FC<ReExtractDialogProps> = ({
  isOpen,
  onClose,
  fieldName,
  currentValue,
  onReExtract,
  isLoading = false,
  columns = []
}) => {
  const [notes, setNotes] = useState('');
  const [saveToPreferences, setSaveToPreferences] = useState(false);

  const handleSubmit = async () => {
    if (!notes.trim()) {
      return;
    }
    
    try {
      await onReExtract(notes.trim());
      
      // Save feedback to extraction preferences if requested
      if (saveToPreferences && columns.includes(fieldName)) {
        const currentPreferences = await ExtractionPreferencesService.getDefaultPreferences();
        if (currentPreferences) {
          const updatedInstructions = { 
            ...currentPreferences.column_instructions as Record<string, string>,
            [fieldName]: notes.trim()
          };
          
          const success = await ExtractionPreferencesService.saveDefaultPreferences(
            currentPreferences.columns,
            updatedInstructions
          );
          
          if (success) {
            toast({
              title: "Feedback saved",
              description: `Extraction instructions for "${fieldName}" have been updated for future use.`,
              variant: "default"
            });
          }
        }
      }
      
      setNotes('');
      setSaveToPreferences(false);
      onClose();
    } catch (error) {
      console.error('Error in re-extraction:', error);
    }
  };

  const handleClose = () => {
    setNotes('');
    setSaveToPreferences(false);
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
              {currentValue ? (
                currentValue
              ) : (
                <span className="text-muted-foreground italic">
                  Empty - No data was extracted for this field
                </span>
              )}
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
              placeholder={currentValue ? 
                "E.g., 'The date should be from the top right corner' or 'Missing the second grantor name' or 'This should be empty - no value found'" : 
                "E.g., 'Look for the property address in the middle section' or 'The date might be stamped at the top' or 'Check for signatures at the bottom'"
              }
              className="mt-1 min-h-[80px]"
              disabled={isLoading}
            />
          </div>
          
          {columns.includes(fieldName) && (
            <div className="flex items-start space-x-2 p-3 bg-muted/20 rounded-md">
              <Checkbox
                id="save-to-preferences"
                checked={saveToPreferences}
                onCheckedChange={(checked) => setSaveToPreferences(checked === true)}
                disabled={isLoading}
              />
              <div className="grid gap-1.5 leading-none">
                <Label 
                  htmlFor="save-to-preferences" 
                  className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                >
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" />
                    Save as extraction instruction
                  </div>
                </Label>
                <p className="text-xs text-muted-foreground">
                  Apply this feedback to all future extractions of "{fieldName}"
                </p>
              </div>
            </div>
          )}
          
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
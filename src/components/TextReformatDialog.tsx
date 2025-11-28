import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Loader2, Wand2, Copy, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TextReformatDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (reformattedText: string) => void;
  originalText: string;
  cellInfo: {
    rowIndex: number;
    column: string;
  };
}

const TextReformatDialog: React.FC<TextReformatDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  originalText,
  cellInfo
}) => {
  const [formatInstructions, setFormatInstructions] = useState('');
  const [examples, setExamples] = useState('');
  const [reformattedText, setReformattedText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  // Preset format examples for common legal document formatting
  const presetFormats = [
    {
      name: "Township-Range with Sections",
      instruction: "Convert to format: [Township][Direction]-[Range][Direction] on first line, then each section on new line as 'Sec. [Number]: [Description]'. Abbreviate quarters (NW, SE, E2W2, etc.) and use 'All' for entire section.",
      example: "Example: Township 1 South Range 2 West Section 1 NW Section 2 All → 1S-2W\\nSec. 1: NW\\nSec. 2: All"
    },
    {
      name: "Simple Township-Range Format",
      instruction: "Convert to format: [Township]-[Range] on first line, then each section on new line as 'Section [Number]: [Description]'",
      example: "Example: Township 1 Range 2 Section 1 All Section 2 SW → 1-2\\nSection 1: All\\nSection 2: SW"
    },
    {
      name: "Date Standardization", 
      instruction: "Convert to MM/DD/YYYY format",
      example: "Example: January 15, 2023 → 01/15/2023"
    },
    {
      name: "Name Format (Last, First)",
      instruction: "Convert to Last Name, First Name format",
      example: "Example: John Smith → Smith, John"
    }
  ];

  const handlePresetSelect = (preset: typeof presetFormats[0]) => {
    setFormatInstructions(preset.instruction);
    setExamples(preset.example);
  };

  const handleReformat = async () => {
    if (!formatInstructions.trim()) {
      toast({
        title: "Format instructions required",
        description: "Please provide instructions for how to reformat the text.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('reformat-text', {
        body: {
          originalText,
          formatInstructions,
          examples: examples || undefined
        }
      });

      if (error) throw error;

      if (data?.reformattedText) {
        setReformattedText(data.reformattedText);
        toast({
          title: "Text reformatted",
          description: "Preview the result and click 'Apply' to update the cell.",
        });
      } else {
        throw new Error('No reformatted text returned');
      }
    } catch (error) {
      console.error('Error reformatting text:', error);
      toast({
        title: "Reformatting failed",
        description: "Failed to reformat the text. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleApply = () => {
    if (reformattedText) {
      onConfirm(reformattedText);
      onClose();
      // Reset state
      setFormatInstructions('');
      setExamples('');
      setReformattedText('');
    }
  };

  const handleCopy = async () => {
    if (reformattedText) {
      await navigator.clipboard.writeText(reformattedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copied to clipboard",
        description: "The reformatted text has been copied.",
      });
    }
  };

  const handleClose = () => {
    onClose();
    // Reset state
    setFormatInstructions('');
    setExamples('');
    setReformattedText('');
    setCopied(false);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="h-5 w-5" />
            Reformat Cell Text
          </DialogTitle>
          <DialogDescription>
            Use AI to reformat the text in cell {cellInfo.column}-{cellInfo.rowIndex + 1} while preserving all original information.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original Text */}
          <div>
            <Label htmlFor="original-text" className="text-sm font-medium">
              Original Text
            </Label>
            <Card className="p-3 mt-1">
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                {originalText}
              </p>
            </Card>
          </div>

          {/* Preset Formats */}
          <div>
            <Label className="text-sm font-medium">Quick Format Presets</Label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
              {presetFormats.map((preset, index) => (
                <Button
                  key={index}
                  variant="outline"
                  size="sm"
                  onClick={() => handlePresetSelect(preset)}
                  className="justify-start text-left h-auto p-3 w-full"
                >
                  <div className="w-full overflow-hidden">
                    <div className="font-medium text-xs whitespace-normal break-words">{preset.name}</div>
                    <div className="text-xs text-muted-foreground mt-1 whitespace-normal break-words">
                      {preset.example.split('→')[0].trim()}...
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          </div>

          {/* Format Instructions */}
          <div>
            <Label htmlFor="format-instructions" className="text-sm font-medium">
              Format Instructions *
            </Label>
            <Textarea
              id="format-instructions"
              placeholder="Describe how you want the text to be reformatted..."
              value={formatInstructions}
              onChange={(e) => setFormatInstructions(e.target.value)}
              className="mt-1"
              rows={3}
            />
          </div>

          {/* Examples */}
          <div>
            <Label htmlFor="examples" className="text-sm font-medium">
              Examples (Optional)
            </Label>
            <Textarea
              id="examples"
              placeholder="Provide examples of the desired format..."
              value={examples}
              onChange={(e) => setExamples(e.target.value)}
              className="mt-1"
              rows={2}
            />
          </div>

          {/* Preview Button */}
          <Button 
            onClick={handleReformat} 
            disabled={isLoading || !formatInstructions.trim()}
            className="w-full"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Reformatting...
              </>
            ) : (
              <>
                <Wand2 className="mr-2 h-4 w-4" />
                Preview Reformatted Text
              </>
            )}
          </Button>

          {/* Reformatted Text Preview */}
          {reformattedText && (
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">Reformatted Preview</Label>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="h-8"
                >
                  {copied ? (
                    <Check className="h-3 w-3" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                </Button>
              </div>
              <Card className="p-3 mt-1 bg-green-50 border-green-200">
                <p className="text-sm whitespace-pre-wrap">
                  {reformattedText}
                </p>
              </Card>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleApply} 
            disabled={!reformattedText}
            className="bg-primary hover:bg-primary/90"
          >
            Apply to Cell
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default TextReformatDialog;
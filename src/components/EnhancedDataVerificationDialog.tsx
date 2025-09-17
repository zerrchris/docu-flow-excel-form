import React, { useState, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, AlertTriangle, Edit3, Save, X, RefreshCw, FileText, Sparkles } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { SubjectLandsQuickFill } from '@/components/SubjectLandsQuickFill';

interface ExtractedField {
  key: string;
  value: string;
  confidence?: 'high' | 'medium' | 'low';
  isEdited?: boolean;
}

interface EnhancedDataVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: Record<string, string>) => void;
  onReanalyze?: () => void;
  extractedData: Record<string, string>;
  fileName?: string;
  isLoading?: boolean;
  availableColumns: string[];
}

const EnhancedDataVerificationDialog: React.FC<EnhancedDataVerificationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  onReanalyze,
  extractedData,
  fileName,
  isLoading = false,
  availableColumns
}) => {
  const { toast } = useToast();
  
  // Process extracted data into fields
  const [fields, setFields] = useState<ExtractedField[]>(() => {
    return Object.entries(extractedData).map(([key, value]) => ({
      key,
      value: value || '',
      confidence: value?.trim() ? 'high' : 'low',
      isEdited: false
    }));
  });

  // Add empty fields for columns that weren't extracted
  React.useEffect(() => {
    const extractedKeys = new Set(Object.keys(extractedData));
    const missingFields = availableColumns
      .filter(col => !extractedKeys.has(col))
      .map(col => ({
        key: col,
        value: '',
        confidence: 'low' as 'high' | 'medium' | 'low',
        isEdited: false
      }));
    
    const existingFields = Object.entries(extractedData).map(([key, value]) => ({
      key,
      value: value || '',
      confidence: (value?.trim() ? 'high' : 'low') as 'high' | 'medium' | 'low',
      isEdited: false
    }));

    setFields([...existingFields, ...missingFields]);
  }, [extractedData, availableColumns]);

  const updateField = useCallback((index: number, newValue: string) => {
    setFields(prev => prev.map((field, i) => 
      i === index 
        ? { ...field, value: newValue, isEdited: true, confidence: newValue.trim() ? 'high' : 'low' }
        : field
    ));
  }, []);

  const handleSubjectLandsApply = useCallback((text: string, templateName: string) => {
    const subjectLandsIndex = fields.findIndex(field => 
      field.key.toLowerCase().includes('subject') && field.key.toLowerCase().includes('land')
    );
    
    if (subjectLandsIndex !== -1) {
      updateField(subjectLandsIndex, text);
      toast({
        title: "Subject Lands Applied",
        description: `Template "${templateName}" has been applied to the Subject Lands field`
      });
    }
  }, [fields, updateField, toast]);

  const handleConfirm = useCallback(() => {
    const finalData = fields.reduce((acc, field) => {
      acc[field.key] = field.value;
      return acc;
    }, {} as Record<string, string>);

    onConfirm(finalData);
  }, [fields, onConfirm]);

  const getConfidenceBadge = (confidence: string, hasValue: boolean) => {
    if (!hasValue) {
      return <Badge variant="outline" className="text-xs text-muted-foreground">Empty</Badge>;
    }
    
    switch (confidence) {
      case 'high':
        return <Badge className="text-xs bg-green-500 text-white">High Confidence</Badge>;
      case 'medium':
        return <Badge className="text-xs bg-yellow-500 text-white">Medium Confidence</Badge>;
      case 'low':
        return <Badge className="text-xs bg-orange-500 text-white">Low Confidence</Badge>;
      default:
        return null;
    }
  };

  const successfulFields = fields.filter(field => field.value.trim() !== '');
  const emptyFields = fields.filter(field => field.value.trim() === '');
  const editedFields = fields.filter(field => field.isEdited);

  if (isLoading) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RefreshCw className="h-5 w-5 animate-spin text-primary" />
              Analyzing Document
            </DialogTitle>
            <DialogDescription>
              Please wait while we extract data from {fileName || 'your document'}...
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center justify-center py-8">
            <Sparkles className="h-12 w-12 text-primary animate-pulse mb-4" />
            <p className="text-muted-foreground">AI is analyzing your document...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="flex-shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Verify & Edit Extracted Data
          </DialogTitle>
          <DialogDescription>
            Review and edit the data extracted from <strong>{fileName}</strong> before adding it to your runsheet.
          </DialogDescription>
        </DialogHeader>

        {/* Statistics */}
        <div className="flex gap-4 p-4 bg-muted/30 rounded-lg flex-shrink-0">
          <div className="text-center">
            <div className="text-2xl font-bold text-green-600">{successfulFields.length}</div>
            <div className="text-xs text-muted-foreground">Fields Found</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-orange-600">{emptyFields.length}</div>
            <div className="text-xs text-muted-foreground">Empty Fields</div>
          </div>
          <div className="text-center">
            <div className="text-2xl font-bold text-blue-600">{editedFields.length}</div>
            <div className="text-xs text-muted-foreground">Edited</div>
          </div>
        </div>

        {/* Scrollable content */}
        <ScrollArea className="flex-1 max-h-[50vh]">
          <div className="space-y-6 p-1">
            {/* Successfully extracted fields */}
            {successfulFields.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-green-700 dark:text-green-300 mb-3 flex items-center gap-2">
                  <CheckCircle className="h-4 w-4" />
                  Successfully Extracted ({successfulFields.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {successfulFields.map((field, index) => {
                    const originalIndex = fields.findIndex(f => f.key === field.key);
                    return (
                      <div key={field.key} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <Label htmlFor={`field-${originalIndex}`} className="text-sm font-medium">
                            {field.key}
                          </Label>
                          <div className="flex gap-1">
                            {getConfidenceBadge(field.confidence!, !!field.value)}
                            {field.isEdited && <Badge variant="outline" className="text-xs text-blue-600">Edited</Badge>}
                          </div>
                        </div>
                        <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-md">
                          {field.value.length > 100 ? (
                            <Textarea
                              id={`field-${originalIndex}`}
                              value={field.value}
                              onChange={(e) => updateField(originalIndex, e.target.value)}
                              className="min-h-[80px] bg-transparent border-0 focus:ring-0"
                            />
                          ) : (
                            <Input
                              id={`field-${originalIndex}`}
                              value={field.value}
                              onChange={(e) => updateField(originalIndex, e.target.value)}
                              className="bg-transparent border-0 focus:ring-0"
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Separator if both sections exist */}
            {successfulFields.length > 0 && emptyFields.length > 0 && <Separator />}

            {/* Empty fields */}
            {emptyFields.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-3 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Empty Fields - Add Data Manually ({emptyFields.length})
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {emptyFields.map((field) => {
                    const originalIndex = fields.findIndex(f => f.key === field.key);
                    return (
                      <div key={field.key} className="space-y-2">
                         <div className="flex items-center justify-between">
                           <Label htmlFor={`empty-field-${originalIndex}`} className="text-sm font-medium">
                             {field.key}
                           </Label>
                           <div className="flex items-center gap-2">
                             {field.isEdited && <Badge variant="outline" className="text-xs text-blue-600">Added</Badge>}
                             {(field.key.toLowerCase().includes('subject') && field.key.toLowerCase().includes('land')) && (
                               <SubjectLandsQuickFill 
                                 onApplyTemplate={handleSubjectLandsApply}
                                 disabled={isLoading}
                               />
                             )}
                           </div>
                         </div>
                         <Input
                           id={`empty-field-${originalIndex}`}
                           value={field.value}
                           onChange={(e) => updateField(originalIndex, e.target.value)}
                           placeholder={`Enter ${field.key.toLowerCase()}...`}
                           className="bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800"
                         />
                       </div>
                     );
                   })}
                 </div>
                 <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                   These fields were not found in the document. You can fill them manually or leave them empty.
                 </p>
               </div>
             )}
           </div>
         </ScrollArea>

         {/* Footer */}
         <DialogFooter className="gap-2 flex-shrink-0 pt-4 border-t">
          <Button variant="outline" onClick={onClose}>
            <X className="h-4 w-4 mr-1" />
            Cancel
          </Button>
          
          {onReanalyze && (
            <Button variant="outline" onClick={onReanalyze}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Re-analyze
            </Button>
          )}
          
          <Button onClick={handleConfirm} className="bg-green-600 hover:bg-green-700">
            <Save className="h-4 w-4 mr-1" />
            Add to Next Available Row ({successfulFields.length + editedFields.filter(f => f.value.trim() && !successfulFields.includes(f)).length} fields)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EnhancedDataVerificationDialog;
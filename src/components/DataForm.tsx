import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { RotateCw, CheckCircle, Plus, Settings, ChevronDown, ChevronUp, Upload, Wand2, Trash2, Sparkles, AlertTriangle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import ReExtractDialog from '@/components/ReExtractDialog';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { toast } from '@/hooks/use-toast';

interface DataFormProps {
  fields: string[];
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onCancelAnalysis?: () => void;
  onAddToSpreadsheet: () => Promise<void>;
  onResetDocument?: () => void;
  onBackToRunsheet?: () => void; // Add back to runsheet handler
  isAnalyzing: boolean;
  isUploading?: boolean;
  hasAddedToSpreadsheet?: boolean;
  // New props for re-extraction
  fileUrl?: string;
  fileName?: string;
  columnInstructions?: Record<string, string>;
}

const DataForm: React.FC<DataFormProps> = ({ 
  fields, 
  formData, 
  onChange,
  onAnalyze,
  onCancelAnalysis,
  onAddToSpreadsheet,
  onResetDocument,
  onBackToRunsheet,
  isAnalyzing,
  isUploading = false,
  hasAddedToSpreadsheet = false,
  fileUrl,
  fileName,
  columnInstructions = {}
}) => {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [isGeneratingName, setIsGeneratingName] = useState(false);
  
  // Re-extraction state
  const [reExtractDialog, setReExtractDialog] = useState<{
    isOpen: boolean;
    fieldName: string;
    currentValue: string;
  }>({
    isOpen: false,
    fieldName: '',
    currentValue: ''
  });
  const [isReExtracting, setIsReExtracting] = useState(false);
  
  // Warning dialog for back to runsheet
  const [showBackWarning, setShowBackWarning] = useState(false);

  // Generate smart filename using user's naming preferences
  const generateSmartFilename = async () => {
    try {
      console.log('Starting smart filename generation...');
      setIsGeneratingName(true);
      
      let namingPrefs = {
        priority_columns: ['name', 'title', 'invoice_number', 'document_number', 'reference', 'id'],
        max_filename_parts: 3,
        separator: '_',
        include_extension: true,
        fallback_pattern: 'document_{row_index}_{timestamp}'
      };

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        console.log('User found, fetching naming preferences...');
        // Get user's naming preferences if logged in
        const { data: preferences, error } = await supabase
          .from('user_document_naming_preferences')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        console.log('Preferences query result:', { preferences, error });

        // Use user preferences if found, otherwise stick with defaults
        if (preferences) {
          namingPrefs = preferences;
        }
      } else {
        console.log('No user found, using default naming preferences');
      }

      console.log('Using naming preferences:', namingPrefs);
      console.log('Current form data:', formData);

      // Build filename from available form data using priority columns
      const filenameParts: string[] = [];
      
      for (const column of namingPrefs.priority_columns) {
        const value = formData[column];
        if (value && value.trim() && value.trim() !== 'N/A') {
          // Clean the value: remove special characters, limit length
          let cleanValue = value.trim()
            .replace(/[^a-zA-Z0-9\-_\s]/g, '')
            .replace(/\s+/g, namingPrefs.separator)
            .substring(0, 30);
          
          if (cleanValue) {
            filenameParts.push(cleanValue);
          }
          
          // Stop when we have enough parts
          if (filenameParts.length >= namingPrefs.max_filename_parts) {
            break;
          }
        }
      }

      // Generate filename
      let filename;
      if (filenameParts.length > 0) {
        filename = filenameParts.join(namingPrefs.separator);
      } else {
        // Use fallback pattern
        filename = namingPrefs.fallback_pattern
          .replace('{row_index}', '1')
          .replace('{timestamp}', Date.now().toString());
      }

      // Add extension if preferences say so
      if (namingPrefs.include_extension) {
        filename += '.pdf';
      }

      console.log('Generated filename:', filename);

      // Update the form field
      onChange('Document File Name', filename);
      
    } catch (error) {
      console.error('Error generating smart filename:', error);
    } finally {
      setIsGeneratingName(false);
    }
  };

  // Auto-close field settings after 5 seconds
  useEffect(() => {
    if (showFieldSettings) {
      const timer = setTimeout(() => {
        setShowFieldSettings(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [showFieldSettings]);

  // Initialize all fields as visible when fields change - completely reset on field change
  useEffect(() => {
    // Filter out debug fields like __operationId from user-visible fields
    const userVisibleFields = fields.filter(field => !field.startsWith('__'));
    
    // Create a completely new visibility object with ONLY current user-visible fields
    const initialVisibility: Record<string, boolean> = {};
    userVisibleFields.forEach(field => {
      initialVisibility[field] = true; // Always start with all fields visible
    });
    // Completely replace the state - don't preserve any old field visibility
    setVisibleFields(initialVisibility);
    console.log('DataForm: Completely resetting visible fields for new fields:', userVisibleFields);
    console.log('DataForm: Old visible fields cleared, new visible fields:', Object.keys(initialVisibility));
    console.log('DEBUG: DataForm fields prop received:', fields);
    console.log('DEBUGs: DataForm formData keys:', Object.keys(formData));
    console.log('DEBUG: visibleFieldsList will be:', userVisibleFields.filter(field => initialVisibility[field] === true));
  }, [fields]);

  // Listen for document form refresh events
  useEffect(() => {
    const handleDocumentFormRefresh = (event: CustomEvent) => {
      const { currentFields } = event.detail;
      console.log('DataForm: Received document form refresh event with current fields:', currentFields);
      
      // Force refresh visible fields to match current fields only  
      const refreshedVisibility: Record<string, boolean> = {};
      currentFields.forEach((field: string) => {
        refreshedVisibility[field] = true;
      });
      setVisibleFields(refreshedVisibility);
      console.log('DataForm: Refreshed visible fields to match current fields');
    };

    window.addEventListener('documentFormRefresh', handleDocumentFormRefresh as EventListener);
    
    return () => {
      window.removeEventListener('documentFormRefresh', handleDocumentFormRefresh as EventListener);
    };
  }, []);
  
  // Listen for document form reset events (kept for compatibility)
  useEffect(() => {
    const handleDocumentFormReset = (event: CustomEvent) => {
      const { newFields } = event.detail;
      console.log('DataForm: Received document form reset event with new fields:', newFields);
      
      // Immediately reset visible fields to match new fields
      const resetVisibility: Record<string, boolean> = {};
      newFields.forEach((field: string) => {
        resetVisibility[field] = true;
      });
      setVisibleFields(resetVisibility);
    };

    window.addEventListener('documentFormReset', handleDocumentFormReset as EventListener);
    
    return () => {
      window.removeEventListener('documentFormReset', handleDocumentFormReset as EventListener);
    };
  }, []);


  // Clear all field values while keeping the field structure
  const clearFields = () => {
    console.log('Clearing all field values');
    
    // Clear all current fields
    fields.forEach(field => {
      onChange(field, '');
    });
    
    console.log('All fields cleared');
  };

  const toggleFieldVisibility = (field: string) => {
    setVisibleFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  // Handle re-extraction for a specific field
  const handleReExtract = (fieldName: string) => {
    // Allow re-extraction if we have a fileUrl OR if the field already has data (indicating analysis has been done)
    if (!fileUrl && (!formData[fieldName] || formData[fieldName].trim() === '')) {
      toast({
        title: "No document or data",
        description: "Please upload and analyze a document first before re-extracting fields.",
        variant: "destructive"
      });
      return;
    }

    setReExtractDialog({
      isOpen: true,
      fieldName,
      currentValue: formData[fieldName] || ''
    });
  };

  const handleReExtractWithNotes = async (notes: string, saveToPreferences?: boolean) => {
    setIsReExtracting(true);
    
    try {
      console.log('🔧 DataForm: Starting re-extraction for field:', reExtractDialog.fieldName);
      console.log('🔧 DataForm: fileUrl:', fileUrl);
      console.log('🔧 DataForm: fileName:', fileName);
      console.log('🔧 DataForm: userNotes:', notes);
      
      let imageData = null;
      
      // If fileUrl is a blob URL, convert to base64
      if (fileUrl && fileUrl.startsWith('blob:')) {
        try {
          console.log('🔧 DataForm: Converting blob URL to base64...');
          const response = await fetch(fileUrl);
          const blob = await response.blob();
          const reader = new FileReader();
          
          imageData = await new Promise<string>((resolve, reject) => {
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          console.log('🔧 DataForm: Successfully converted to base64, length:', imageData?.length);
        } catch (err) {
          console.error('Failed to convert blob to base64:', err);
          toast({
            title: "Image Processing Error",
            description: "Failed to process image for re-extraction",
            variant: "destructive"
          });
          return;
        }
      }

      console.log('🔧 DataForm: Calling re-extract-field with:', {
        hasFileUrl: !!fileUrl,
        hasImageData: !!imageData,
        fieldName: reExtractDialog.fieldName,
        fieldInstructions: columnInstructions[reExtractDialog.fieldName],
        userNotes: notes,
        currentValue: reExtractDialog.currentValue
      });

      const response = await supabase.functions.invoke('re-extract-field', {
        body: {
          fileUrl: imageData ? null : fileUrl,
          imageData,
          fileName,
          fieldName: reExtractDialog.fieldName,
          fieldInstructions: columnInstructions[reExtractDialog.fieldName] || `Extract the ${reExtractDialog.fieldName} field accurately`,
          userNotes: notes,
          currentValue: reExtractDialog.currentValue
        }
      });

      console.log('🔧 DataForm: Edge function response:', response);

      if (response.error) {
        console.error('🔧 DataForm: Edge function error:', response.error);
        throw response.error;
      }

      if (!response.data) {
        console.error('🔧 DataForm: No data in response:', response);
        throw new Error('No data returned from re-extraction');
      }

      const { extractedValue } = response.data;
      console.log('🔧 DataForm: Extracted value:', extractedValue);
      
      // Update the specific field with the re-extracted value
      onChange(reExtractDialog.fieldName, extractedValue);
      
      // Save feedback to extraction preferences if requested
      if (saveToPreferences) {
        const success = await ExtractionPreferencesService.appendToColumnInstructions(
          reExtractDialog.fieldName,
          notes
        );
        
        if (success) {
          console.log(`✅ Saved feedback to extraction preferences for "${reExtractDialog.fieldName}"`);
        } else {
          console.error(`❌ Failed to save feedback to extraction preferences for "${reExtractDialog.fieldName}"`);
        }
      }
      
      toast({
        title: "Field re-extracted",
        description: `Successfully re-extracted "${reExtractDialog.fieldName}" with your feedback.${saveToPreferences ? ' Feedback saved for future extractions.' : ''}`,
      });

    } catch (error) {
      console.error('🔧 DataForm: Error re-extracting field:', error);
      toast({
        title: "Re-extraction failed", 
        description: `Failed to re-extract the field: ${error?.message || 'Unknown error'}. Please try again.`,
        variant: "destructive"
      });
    } finally {
      setIsReExtracting(false);
    }
  };

  // Only show fields that exist in current fields AND are marked visible (filter out debug fields)
  const userVisibleFields = fields.filter(field => !field.startsWith('__'));
  const visibleFieldsList = userVisibleFields.filter(field => visibleFields[field] === true);
  
  return (
    <div className="space-y-4">
      {/* Field Settings Toggle */}
      <Collapsible open={showFieldSettings} onOpenChange={setShowFieldSettings}>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full justify-between">
            <div className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Hide/Display Fields ({visibleFieldsList.length}/{fields.length})
            </div>
            {showFieldSettings ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </CollapsibleTrigger>
        
        <CollapsibleContent className="space-y-2 mt-2">
          <div className="text-xs text-muted-foreground mb-2">
            Select which fields to show in the form:
          </div>
          <div className="grid grid-cols-1 gap-2 p-3 border rounded-md bg-muted/30">
            {userVisibleFields.map((field) => (
              <div key={field} className="flex items-center space-x-2">
                <Checkbox
                  id={`visible-${field}`}
                  checked={visibleFields[field] || false}
                  onCheckedChange={() => toggleFieldVisibility(field)}
                />
                <Label 
                  htmlFor={`visible-${field}`} 
                  className="text-sm font-normal cursor-pointer flex-1"
                >
                  {field}
                </Label>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Clear Fields Button */}
      <div className="space-y-2">
        <Button
          variant="outline"
          size="sm"
          onClick={clearFields}
          className="w-full gap-2"
        >
          <Trash2 className="h-4 w-4" />
          Clear Fields
        </Button>
        <div className="text-xs text-muted-foreground text-center px-2">
          Clear Fields removes all data from the form.
        </div>
      </div>

      {/* Form Fields - Only show visible ones */}
      <div className="space-y-2">
        {visibleFieldsList.map((field) => (
          <div key={field}>
            <Label htmlFor={field} className="text-sm font-medium">
              {field}
            </Label>
            {field === 'Document File Name' && (
              <div className="space-y-1">
                <div className="text-xs text-muted-foreground">
                  This will be the name of the document file (optional - defaults to uploaded filename if left empty). Click the magic wand button to auto-generate using your smart naming preferences.
                </div>
                <div className="flex gap-2">
                  <Textarea
                    id={field}
                    value={formData[field] || ''}
                    onChange={(e) => onChange(field, e.target.value)}
                    className="flex-1 min-h-[40px] resize-none"
                    rows={Math.max(1, Math.ceil((formData[field] || '').length / 50))}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={generateSmartFilename}
                    disabled={isGeneratingName}
                    className="px-3 h-10"
                    title="Generate smart filename using your naming preferences"
                  >
                    {isGeneratingName ? (
                      <RotateCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            )}
            {field !== 'Document File Name' && (
              <div className="space-y-1">
                <div className="flex gap-2">
                  <Textarea
                    id={field}
                    value={formData[field] || ''}
                    onChange={(e) => onChange(field, e.target.value)}
                    className="flex-1 min-h-[40px] resize-none"
                    rows={Math.max(1, Math.ceil((formData[field] || '').length / 50))}
                  />
                  {(fileUrl || (formData[field] && formData[field].trim() !== '')) && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleReExtract(field)}
                      disabled={isReExtracting || isAnalyzing}
                      className="px-3 h-10 shrink-0"
                      title="Re-extract this field with AI using your feedback"
                    >
                      <Sparkles className="h-4 w-4" />
                    </Button>
                  )}
                </div>
                {(fileUrl || (formData[field] && formData[field].trim() !== '')) && (
                  <div className="text-xs text-muted-foreground">
                    Click <Sparkles className="inline h-3 w-3" /> to re-extract this field with AI feedback
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
        
        {visibleFieldsList.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No fields selected. Use the "Hide/Display Fields" button above to show fields.
          </div>
        )}
      </div>

      {/* Data Verification Notice */}
      {Object.values(formData).some(value => value.trim() !== '') && (
        <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <h4 className="text-sm font-medium text-blue-900 dark:text-blue-100">
                Data Extracted Successfully
              </h4>
              <p className="text-sm text-blue-700 dark:text-blue-300 mt-1">
                Please review and verify the extracted data above. You can edit any field if needed, then click "Add to Runsheet" to add this data to the next available row.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-4">
        <div className="flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
          <Button 
            variant="gradient"
            onClick={() => onAnalyze()}
            disabled={isAnalyzing}
            className="w-full sm:w-auto"
          >
            {isAnalyzing ? (
              <>
                <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                Extracting Data...
              </>
            ) : (
              'Analyze Document'
            )}
          </Button>
          
          {isAnalyzing && onCancelAnalysis && (
            <Button
              variant="secondary"
              onClick={onCancelAnalysis}
              className="w-full sm:w-auto"
            >
              Cancel Analysis
            </Button>
          )}
          
          <Button
            variant="success"
            onClick={() => {
              if (visibleFieldsList.length === 0) {
                alert('No fields are visible. Please use the "Hide/Display Fields" button above to show fields first.');
                return;
              }
              
              // Directly add to spreadsheet - user has already verified data in the form fields
              onAddToSpreadsheet();
            }}
            className="w-full sm:w-auto"
            disabled={isUploading}
            title={visibleFieldsList.length === 0 ? "Please enable some fields first using 'Hide/Display Fields'" : ""}
          >
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 mr-1 animate-pulse" />
                Processing...
              </>
            ) : (
              <>
                <CheckCircle className="h-4 w-4 mr-1" />
                Add to Runsheet
              </>
            )}
          </Button>

          {onBackToRunsheet && (
            <Button
              variant="outline"
              onClick={() => {
                // Check if there's processed data that hasn't been added
                const hasProcessedData = Object.values(formData).some(value => value.trim() !== '');
                if (hasProcessedData) {
                  setShowBackWarning(true);
                } else {
                  onBackToRunsheet();
                }
              }}
              className="w-full sm:w-auto"
            >
              Back to Runsheet
            </Button>
          )}
        </div>
        
        {onResetDocument && hasAddedToSpreadsheet && (
          <Button
            variant="outline"
            onClick={onResetDocument}
            className="w-full sm:w-auto"
          >
            Upload New Document
          </Button>
        )}
      </div>

      {/* Re-extraction Dialog */}
      <ReExtractDialog
        isOpen={reExtractDialog.isOpen}
        onClose={() => setReExtractDialog(prev => ({ ...prev, isOpen: false }))}
        fieldName={reExtractDialog.fieldName}
        currentValue={reExtractDialog.currentValue}
        onReExtract={handleReExtractWithNotes}
        isLoading={isReExtracting}
      />


      {/* Back to Runsheet Warning Dialog */}
      <Dialog open={showBackWarning} onOpenChange={setShowBackWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              Document Not Added to Runsheet
            </DialogTitle>
            <DialogDescription>
              You have processed document data that hasn't been added to your runsheet yet. 
              If you go back now, this data will be lost.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => setShowBackWarning(false)}
            >
              Cancel
            </Button>
            <Button 
              variant="success"
              onClick={() => {
                setShowBackWarning(false);
                // Directly add to spreadsheet - user has already verified data in the form fields
                onAddToSpreadsheet();
              }}
            >
              Add to Runsheet First
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowBackWarning(false);
                onBackToRunsheet?.();
              }}
            >
              Go Back Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DataForm;
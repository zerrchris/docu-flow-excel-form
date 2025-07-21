import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCw, CheckCircle, Plus, Settings, ChevronDown, ChevronUp, Upload, Wand2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

interface DataFormProps {
  fields: string[];
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onAddToSpreadsheet: () => void;
  onResetDocument?: () => void;
  isAnalyzing: boolean;
  isUploading?: boolean;
  hasAddedToSpreadsheet?: boolean;
}

const DataForm: React.FC<DataFormProps> = ({ 
  fields, 
  formData, 
  onChange,
  onAnalyze,
  onAddToSpreadsheet,
  onResetDocument,
  isAnalyzing,
  isUploading = false,
  hasAddedToSpreadsheet = false
}) => {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [showFieldSettings, setShowFieldSettings] = useState(false);
  const [isGeneratingName, setIsGeneratingName] = useState(false);

  // Generate smart filename using user's naming preferences
  const generateSmartFilename = async () => {
    try {
      setIsGeneratingName(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's naming preferences
      const { data: preferences } = await supabase
        .from('user_document_naming_preferences')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      // Use default preferences if none found
      const namingPrefs = preferences || {
        priority_columns: ['name', 'title', 'invoice_number', 'document_number', 'reference', 'id'],
        max_filename_parts: 3,
        separator: '_',
        include_extension: true,
        fallback_pattern: 'document_{row_index}_{timestamp}'
      };

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
    // Create a completely new visibility object with ONLY current fields
    const initialVisibility: Record<string, boolean> = {};
    fields.forEach(field => {
      initialVisibility[field] = true; // Always start with all fields visible
    });
    // Completely replace the state - don't preserve any old field visibility
    setVisibleFields(initialVisibility);
    console.log('DataForm: Completely resetting visible fields for new fields:', fields);
    console.log('DataForm: Old visible fields cleared, new visible fields:', Object.keys(initialVisibility));
    console.log('DEBUG: DataForm fields prop received:', fields);
    console.log('DEBUG: DataForm formData keys:', Object.keys(formData));
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

  // Manual refresh function to force fields to match current spreadsheet columns
  const refreshFields = () => {
    console.log('Manual refresh triggered - completely resetting to current spreadsheet columns:', fields);
    console.log('Current formData keys before refresh:', Object.keys(formData));
    
    // Step 1: Clear ALL existing form data completely
    const allCurrentKeys = Object.keys(formData);
    allCurrentKeys.forEach(key => {
      onChange(key, ''); // Clear every single field
    });
    
    // Step 2: Create completely new visibility object with ONLY current fields
    const refreshedVisibility: Record<string, boolean> = {};
    fields.forEach(field => {
      refreshedVisibility[field] = true;
      // Ensure each current field exists in form data
      onChange(field, '');
    });
    
    // Step 3: Force update visible fields state
    setVisibleFields(refreshedVisibility);
    
    console.log('Manual refresh complete - form reset to show only these fields:', fields);
    console.log('New visible fields:', Object.keys(refreshedVisibility));
    
    // Step 4: Force a re-render by triggering a small state change
    setShowFieldSettings(false);
  };

  const toggleFieldVisibility = (field: string) => {
    setVisibleFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  // Only show fields that exist in current fields AND are marked visible
  const visibleFieldsList = fields.filter(field => visibleFields[field] === true);
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
            {fields.map((field) => (
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

      {/* Refresh Fields Button */}
      <Button
        variant="outline"
        size="sm"
        onClick={refreshFields}
        className="w-full gap-2"
      >
        <RefreshCw className="h-4 w-4" />
        Refresh Fields
      </Button>

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
              <Textarea
                id={field}
                value={formData[field] || ''}
                onChange={(e) => onChange(field, e.target.value)}
                className="mt-1 min-h-[40px] resize-none"
                rows={Math.max(1, Math.ceil((formData[field] || '').length / 50))}
              />
            )}
          </div>
        ))}
        
        {visibleFieldsList.length === 0 && (
          <div className="text-center py-4 text-muted-foreground text-sm">
            No fields selected. Use the "Hide/Display Fields" button above to show fields.
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="space-y-2 pt-4">
        <div className="flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0">
          <Button 
            variant="gradient"
            onClick={onAnalyze}
            disabled={isAnalyzing}
            className="w-full sm:w-auto"
          >
            {isAnalyzing ? (
              <>
                <RotateCw className="mr-2 h-4 w-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              'Analyze Document'
            )}
          </Button>
          
          <Button
            variant="success"
            onClick={() => onAddToSpreadsheet()}
            className="w-full sm:w-auto"
            disabled={visibleFieldsList.length === 0 || isUploading}
          >
            {isUploading ? (
              <>
                <Upload className="h-4 w-4 mr-1 animate-pulse" />
                Uploading...
              </>
            ) : (
              <>
                <Plus className="h-4 w-4 mr-1" />
                Add to Runsheet
              </>
            )}
          </Button>
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
    </div>
  );
};

export default DataForm;
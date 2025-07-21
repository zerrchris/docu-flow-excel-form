import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCw, CheckCircle, Plus, Settings, ChevronDown, ChevronUp, Upload } from 'lucide-react';

interface DataFormProps {
  fields: string[];
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onAddToSpreadsheet: () => void;
  onResetDocument?: () => void;
  isAnalyzing: boolean;
  isUploading?: boolean;
}

const DataForm: React.FC<DataFormProps> = ({ 
  fields, 
  formData, 
  onChange,
  onAnalyze,
  onAddToSpreadsheet,
  onResetDocument,
  isAnalyzing,
  isUploading = false
}) => {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [showFieldSettings, setShowFieldSettings] = useState(false);

  // Auto-close field settings after 5 seconds
  useEffect(() => {
    if (showFieldSettings) {
      const timer = setTimeout(() => {
        setShowFieldSettings(false);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [showFieldSettings]);

  // Initialize all fields as visible when fields change
  useEffect(() => {
    const initialVisibility: Record<string, boolean> = {};
    fields.forEach(field => {
      initialVisibility[field] = visibleFields[field] ?? true;
    });
    setVisibleFields(initialVisibility);
  }, [fields]);

  const toggleFieldVisibility = (field: string) => {
    setVisibleFields(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const visibleFieldsList = fields.filter(field => visibleFields[field]);
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

      {/* Form Fields - Only show visible ones */}
      <div className="space-y-2">
        {visibleFieldsList.map((field) => (
          <div key={field}>
            <Label htmlFor={field} className="text-sm font-medium">
              {field}
            </Label>
            {field === 'Document File Name' && (
              <div className="text-xs text-muted-foreground mb-1">
                This will be the name of the document file (optional - defaults to uploaded filename if left empty)
              </div>
            )}
            <Textarea
              id={field}
              value={formData[field] || ''}
              onChange={(e) => onChange(field, e.target.value)}
              className="mt-1 min-h-[40px] resize-none"
              rows={Math.max(1, Math.ceil((formData[field] || '').length / 50))}
            />
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
        
        {onResetDocument && (
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
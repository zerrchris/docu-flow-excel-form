import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { RotateCw, CheckCircle, Plus, Settings, ChevronDown, ChevronUp } from 'lucide-react';

interface DataFormProps {
  fields: string[];
  formData: Record<string, string>;
  onChange: (field: string, value: string) => void;
  onAnalyze: () => void;
  onAddToSpreadsheet: () => void;
  isAnalyzing: boolean;
}

const DataForm: React.FC<DataFormProps> = ({ 
  fields, 
  formData, 
  onChange,
  onAnalyze,
  onAddToSpreadsheet,
  isAnalyzing 
}) => {
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [showFieldSettings, setShowFieldSettings] = useState(false);

  // Initialize all fields as visible when fields change
  useEffect(() => {
    const initialVisibility: Record<string, boolean> = {};
    fields.forEach(field => {
      initialVisibility[field] = visibleFields[field] ?? true;
    });
    setVisibleFields(initialVisibility);
  }, [fields]);

  // Sync formData changes back to parent when formData prop changes
  useEffect(() => {
    console.log('DataForm received new formData prop:', formData);
    // When formData prop changes (like from analyze), sync each field back to parent
    Object.entries(formData).forEach(([field, value]) => {
      if (value && value.trim() !== '') {
        console.log('Syncing field to parent:', field, value);
        onChange(field, value);
      }
    });
  }, [formData, onChange]);

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
            <Input
              id={field}
              value={formData[field] || ''}
              onChange={(e) => {
                console.log('Input onChange triggered for field:', field, 'value:', e.target.value);
                onChange(field, e.target.value);
              }}
              className="mt-1"
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
      <div className="flex flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0 pt-4">
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
          onClick={() => {
            console.log('Add to Spreadsheet button clicked');
            console.log('visibleFieldsList:', visibleFieldsList);
            console.log('formData passed to component:', formData);
            console.log('DataForm internal check - form values:');
            visibleFieldsList.forEach(field => {
              const inputElement = document.getElementById(field) as HTMLInputElement;
              if (inputElement) {
                console.log(`Field ${field}: input value = "${inputElement.value}", formData value = "${formData[field] || ''}"`);
              }
            });
            onAddToSpreadsheet();
          }}
          className="w-full sm:w-auto"
          disabled={visibleFieldsList.length === 0}
        >
          <Plus className="h-4 w-4 mr-1" />
          Add to Spreadsheet
        </Button>
      </div>
    </div>
  );
};

export default DataForm;
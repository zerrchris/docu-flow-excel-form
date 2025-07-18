import React from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { RotateCw, CheckCircle, Plus } from 'lucide-react';

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
  return (
    <div className="space-y-2">
      <div className="space-y-2">
        {fields.map((field) => (
          <div key={field}>
            <Label htmlFor={field} className="text-sm font-medium">
              {field}
            </Label>
            <Input
              id={field}
              value={formData[field] || ''}
              onChange={(e) => onChange(field, e.target.value)}
              className="mt-1"
            />
          </div>
        ))}
      </div>

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
          onClick={onAddToSpreadsheet}
          className="w-full sm:w-auto"
        >
          <Plus className="h-4 w-4 mr-1" />
          Add to Spreadsheet
        </Button>
      </div>
    </div>
  );
};

export default DataForm;
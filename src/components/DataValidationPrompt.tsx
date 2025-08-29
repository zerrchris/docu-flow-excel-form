import React from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle, AlertCircle, Edit3, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface ExtractedField {
  key: string;
  label: string;
  value: string;
  confidence?: number;
  isRequired?: boolean;
}

interface DataValidationPromptProps {
  extractedData: ExtractedField[];
  onConfirm: (data: Record<string, string>) => void;
  onReject: () => void;
  onEdit: (key: string, value: string) => void;
  isLoading?: boolean;
  documentName?: string;
}

const DataValidationPrompt: React.FC<DataValidationPromptProps> = ({
  extractedData,
  onConfirm,
  onReject,
  onEdit,
  isLoading = false,
  documentName
}) => {
  const [editedData, setEditedData] = React.useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    extractedData.forEach(field => {
      initial[field.key] = field.value;
    });
    return initial;
  });

  const handleFieldEdit = (key: string, value: string) => {
    setEditedData(prev => ({ ...prev, [key]: value }));
    onEdit(key, value);
  };

  const handleConfirm = () => {
    onConfirm(editedData);
  };

  const getConfidenceColor = (confidence?: number) => {
    if (!confidence) return 'bg-muted';
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  };

  const getConfidenceLabel = (confidence?: number) => {
    if (!confidence) return 'Unknown';
    if (confidence >= 0.8) return 'High';
    if (confidence >= 0.6) return 'Medium';
    return 'Low';
  };

  return (
    <Card className="p-6 border-2 border-primary">
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-primary" />
              Verify Extracted Data
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {documentName ? `From: ${documentName}` : 'Please review and confirm the extracted information'}
            </p>
          </div>
          <Badge variant="secondary" className="bg-primary/10 text-primary">
            {extractedData.length} fields extracted
          </Badge>
        </div>

        <div className="space-y-4">
          {extractedData.map((field) => (
            <div key={field.key} className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={field.key} className="text-sm font-medium">
                  {field.label}
                  {field.isRequired && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.confidence !== undefined && (
                  <Badge 
                    variant="outline" 
                    className={`text-xs ${getConfidenceColor(field.confidence)}`}
                  >
                    {getConfidenceLabel(field.confidence)} ({Math.round(field.confidence * 100)}%)
                  </Badge>
                )}
              </div>
              <div className="relative">
                <Input
                  id={field.key}
                  value={editedData[field.key] || ''}
                  onChange={(e) => handleFieldEdit(field.key, e.target.value)}
                  placeholder={`Enter ${field.label.toLowerCase()}`}
                  className={field.isRequired && !editedData[field.key] ? 'border-destructive' : ''}
                />
                {editedData[field.key] !== field.value && (
                  <Edit3 className="absolute right-2 top-2.5 h-4 w-4 text-primary" />
                )}
              </div>
              {field.isRequired && !editedData[field.key] && (
                <p className="text-xs text-destructive">This field is required</p>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center justify-between pt-4 border-t">
          <Button variant="outline" onClick={onReject} disabled={isLoading}>
            <RotateCcw className="h-4 w-4 mr-2" />
            Re-extract
          </Button>
          
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                // Reset to original values
                const original: Record<string, string> = {};
                extractedData.forEach(field => {
                  original[field.key] = field.value;
                });
                setEditedData(original);
              }}
              disabled={isLoading}
            >
              Reset
            </Button>
            <Button onClick={handleConfirm} disabled={isLoading}>
              <CheckCircle className="h-4 w-4 mr-2" />
              {isLoading ? 'Adding to Runsheet...' : 'Confirm & Add to Runsheet'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default DataValidationPrompt;
import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { 
  isRowEmpty, 
  hasRowData, 
  findFirstEmptyRow, 
  validateDataForInsertion, 
  getRowDataSummary,
  type ValidationResult
} from '@/utils/rowValidation';

interface DataInsertionValidatorProps {
  data: Record<string, string>[];
  columns: string[];
  targetRowIndex: number;
  insertionData: Record<string, string>;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (targetRowIndex: number, overwrite?: boolean) => void;
  onCancel: () => void;
}

export const DataInsertionValidator: React.FC<DataInsertionValidatorProps> = ({
  data,
  columns,
  targetRowIndex,
  insertionData,
  isOpen,
  onClose,
  onConfirm,
  onCancel
}) => {
  const [selectedAction, setSelectedAction] = useState<'overwrite' | 'useEmpty' | null>(null);
  
  const targetRow = data[targetRowIndex] || {};
  const hasExistingData = hasRowData(targetRow);
  const nextEmptyRowIndex = findFirstEmptyRow(data);
  const dataValidation = validateDataForInsertion(insertionData, columns);
  
  const handleConfirm = useCallback(() => {
    if (selectedAction === 'overwrite') {
      onConfirm(targetRowIndex, true);
    } else if (selectedAction === 'useEmpty' && nextEmptyRowIndex !== -1) {
      onConfirm(nextEmptyRowIndex, false);
    }
    onClose();
  }, [selectedAction, targetRowIndex, nextEmptyRowIndex, onConfirm, onClose]);

  const getValidationIcon = (validation: ValidationResult) => {
    if (!validation.isValid) return <AlertTriangle className="h-4 w-4 text-red-500" />;
    if (validation.warnings && validation.warnings.length > 0) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    return <CheckCircle className="h-4 w-4 text-green-500" />;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirm Data Insertion</DialogTitle>
          <DialogDescription>
            Review the data insertion details and choose how to proceed.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Data Validation Status */}
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {getValidationIcon(dataValidation)}
              <span className="font-medium">Data Validation</span>
            </div>
            
            {!dataValidation.isValid && (
              <Alert className="mt-2">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{dataValidation.error}</AlertDescription>
              </Alert>
            )}
            
            {dataValidation.warnings && dataValidation.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {dataValidation.warnings.map((warning, index) => (
                  <Alert key={index} className="border-yellow-200 bg-yellow-50">
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertDescription className="text-yellow-800">{warning}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}
            
            {dataValidation.isValid && (!dataValidation.warnings || dataValidation.warnings.length === 0) && (
              <p className="text-sm text-green-600">All data is valid for insertion</p>
            )}
          </div>

          {/* Target Row Status */}
          <div className="p-3 border rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              {hasExistingData ? (
                <AlertTriangle className="h-4 w-4 text-yellow-500" />
              ) : (
                <CheckCircle className="h-4 w-4 text-green-500" />
              )}
              <span className="font-medium">Target Row {targetRowIndex + 1}</span>
            </div>
            
            <p className="text-sm text-muted-foreground">
              {getRowDataSummary(targetRow)}
            </p>
            
            {hasExistingData && (
              <Alert className="mt-2 border-yellow-200 bg-yellow-50">
                <AlertTriangle className="h-4 w-4 text-yellow-600" />
                <AlertDescription className="text-yellow-800">
                  This row contains existing data that will be overwritten if you proceed.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Action Selection */}
          <div className="space-y-3">
            <h4 className="font-medium">Choose an action:</h4>
            
            {/* Option 1: Use target row (overwrite if needed) */}
            <div 
              className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                selectedAction === 'overwrite' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
              }`}
              onClick={() => setSelectedAction('overwrite')}
            >
              <div className="flex items-center gap-2">
                <input 
                  type="radio" 
                  checked={selectedAction === 'overwrite'}
                  onChange={() => setSelectedAction('overwrite')}
                  className="w-4 h-4"
                />
                <span className="font-medium">
                  Use Row {targetRowIndex + 1} {hasExistingData ? '(Overwrite existing data)' : ''}
                </span>
              </div>
              {hasExistingData && (
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Existing data will be merged with new data. Conflicting fields will be overwritten.
                </p>
              )}
            </div>
            
            {/* Option 2: Use next empty row (if available and target has data) */}
            {hasExistingData && nextEmptyRowIndex !== -1 && (
              <div 
                className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                  selectedAction === 'useEmpty' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                }`}
                onClick={() => setSelectedAction('useEmpty')}
              >
                <div className="flex items-center gap-2">
                  <input 
                    type="radio" 
                    checked={selectedAction === 'useEmpty'}
                    onChange={() => setSelectedAction('useEmpty')}
                    className="w-4 h-4"
                  />
                  <span className="font-medium">
                    Use Next Empty Row {nextEmptyRowIndex + 1} (Recommended)
                  </span>
                </div>
                <p className="text-sm text-muted-foreground mt-1 ml-6">
                  Add data to the next available empty row to avoid overwriting existing information.
                </p>
              </div>
            )}
          </div>

          {/* Preview of fields to be populated */}
          {Object.keys(insertionData).length > 0 && (
            <div className="p-3 border rounded-lg">
              <h5 className="font-medium mb-2">Fields to be populated:</h5>
              <div className="text-sm space-y-1">
                {Object.entries(insertionData)
                  .filter(([_, value]) => value && value.toString().trim() !== '')
                  .map(([field, value]) => (
                    <div key={field} className="flex items-center gap-2">
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{field}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="text-sm">{String(value).substring(0, 50)}{String(value).length > 50 ? '...' : ''}</span>
                    </div>
                  ))
                }
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!selectedAction || !dataValidation.isValid}
          >
            {selectedAction === 'overwrite' ? 'Confirm Overwrite' : 
             selectedAction === 'useEmpty' ? `Use Row ${nextEmptyRowIndex + 1}` : 
             'Confirm'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
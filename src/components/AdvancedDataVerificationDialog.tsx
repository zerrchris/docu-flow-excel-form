import React, { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { 
  CheckCircle, 
  AlertTriangle, 
  Edit3, 
  Eye, 
  FileText, 
  ArrowRight,
  Target,
  Database,
  RefreshCw,
  AlertCircle,
  ShieldCheck
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface AdvancedDataVerificationDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: Record<string, string>, targetRowIndex?: number) => void;
  extractedData: Record<string, string>;
  confidenceScores?: Record<string, number>;
  documentType?: string;
  fileName?: string;
  processingNotes?: string;
  availableColumns: string[];
  currentRunsheetData?: Record<string, string>[];
  onRetryAnalysis?: (useVision?: boolean) => void;
}

const AdvancedDataVerificationDialog: React.FC<AdvancedDataVerificationDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  extractedData,
  confidenceScores = {},
  documentType,
  fileName,
  processingNotes,
  availableColumns,
  currentRunsheetData = [],
  onRetryAnalysis
}) => {
  const [editedData, setEditedData] = useState<Record<string, string>>(extractedData);
  const [selectedRowIndex, setSelectedRowIndex] = useState<number | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [fieldsToReplace, setFieldsToReplace] = useState<Record<string, boolean>>({});
  const { toast } = useToast();

  // Find the next available empty row
  const findNextEmptyRow = (): number => {
    for (let i = 0; i < currentRunsheetData.length; i++) {
      const row = currentRunsheetData[i];
      const isEmpty = Object.values(row).every(value => 
        !value || 
        value.toString().trim() === '' || 
        value.toString().trim().toLowerCase() === 'n/a'
      );
      if (isEmpty) {
        return i;
      }
    }
    return currentRunsheetData.length; // Add new row
  };

  const nextEmptyRowIndex = findNextEmptyRow();

  // Detect fields that would overwrite existing data
  const conflictingFields = useMemo(() => {
    const targetIndex = selectedRowIndex !== null ? selectedRowIndex : nextEmptyRowIndex;
    if (targetIndex >= currentRunsheetData.length) return [];
    
    const targetRow = currentRunsheetData[targetIndex];
    const conflicts: Array<{ field: string; existingValue: string; newValue: string }> = [];
    
    Object.entries(editedData).forEach(([field, newValue]) => {
      const existingValue = targetRow[field];
      if (existingValue && existingValue.toString().trim() !== '' && 
          existingValue.toString().trim().toLowerCase() !== 'n/a' &&
          newValue && newValue.trim() !== '') {
        conflicts.push({ field, existingValue: existingValue.toString(), newValue });
      }
    });
    
    return conflicts;
  }, [editedData, selectedRowIndex, nextEmptyRowIndex, currentRunsheetData]);

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
    if (score >= 0.6) return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300';
    return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
  };

  const getConfidenceIcon = (score: number) => {
    if (score >= 0.8) return <CheckCircle className="h-3 w-3" />;
    if (score >= 0.6) return <AlertTriangle className="h-3 w-3" />;
    return <AlertCircle className="h-3 w-3" />;
  };

  const extractedFields = Object.entries(editedData).filter(([_, value]) => value && value.trim() !== '');
  const emptyFields = availableColumns.filter(col => !editedData[col] || editedData[col].trim() === '');

  const handleFieldChange = (field: string, value: string) => {
    setEditedData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleConfirm = (fillEmptyOnly: boolean = false) => {
    const targetRow = selectedRowIndex !== null ? selectedRowIndex : nextEmptyRowIndex;
    
    if (fillEmptyOnly && targetRow < currentRunsheetData.length) {
      // Only fill empty fields, keep existing data
      const existingRow = currentRunsheetData[targetRow];
      const mergedData: Record<string, string> = { ...editedData };
      
      Object.keys(mergedData).forEach(field => {
        const existingValue = existingRow[field];
        if (existingValue && existingValue.toString().trim() !== '' && 
            existingValue.toString().trim().toLowerCase() !== 'n/a') {
          // Keep existing value, don't overwrite
          mergedData[field] = existingValue.toString();
        }
      });
      
      onConfirm(mergedData, targetRow);
    } else if (conflictingFields.length > 0 && Object.keys(fieldsToReplace).length > 0) {
      // Selective replacement based on user choices
      const existingRow = currentRunsheetData[targetRow];
      const mergedData: Record<string, string> = { ...editedData };
      
      conflictingFields.forEach(({ field }) => {
        if (!fieldsToReplace[field]) {
          // Keep existing value
          mergedData[field] = existingRow[field].toString();
        }
      });
      
      onConfirm(mergedData, targetRow);
    } else {
      // Replace all data
      onConfirm(editedData, targetRow);
    }
  };

  const toggleFieldReplacement = (field: string) => {
    setFieldsToReplace(prev => ({
      ...prev,
      [field]: !prev[field]
    }));
  };

  const selectAllConflicts = () => {
    const allSelected: Record<string, boolean> = {};
    conflictingFields.forEach(({ field }) => {
      allSelected[field] = true;
    });
    setFieldsToReplace(allSelected);
  };

  const deselectAllConflicts = () => {
    setFieldsToReplace({});
  };

  const previewTargetRow = () => {
    const targetIndex = selectedRowIndex !== null ? selectedRowIndex : nextEmptyRowIndex;
    if (targetIndex >= currentRunsheetData.length) {
      return `New row ${targetIndex + 1}`;
    }
    return `Row ${targetIndex + 1}`;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Review & Verify Extracted Data
          </DialogTitle>
          <DialogDescription>
            AI extracted {extractedFields.length} fields from {fileName || 'your document'}. 
            {documentType && ` Document type: ${documentType}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          <Tabs defaultValue="extracted" className="w-full">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="extracted" className="flex items-center gap-2">
                <Eye className="h-4 w-4" />
                Extracted Data
              </TabsTrigger>
              <TabsTrigger value="edit" className="flex items-center gap-2">
                <Edit3 className="h-4 w-4" />
                Edit & Review
              </TabsTrigger>
              <TabsTrigger value="target" className="flex items-center gap-2">
                <Target className="h-4 w-4" />
                Target Row
              </TabsTrigger>
            </TabsList>

            <TabsContent value="extracted" className="space-y-4 mt-4">
              {/* Analysis Summary Card */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <span>Analysis Summary</span>
                    {onRetryAnalysis && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={() => onRetryAnalysis()}
                        className="h-8"
                      >
                        <RefreshCw className="h-3 w-3 mr-1" />
                        Retry Analysis
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>{extractedFields.length} fields extracted</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-orange-500" />
                      <span>{emptyFields.length} fields empty</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4 text-blue-500" />
                      <span>Target: {previewTargetRow()}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-purple-500" />
                      <span>{documentType || 'Unknown type'}</span>
                    </div>
                  </div>
                  
                  {processingNotes && (
                    <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-sm text-blue-800 dark:text-blue-200">
                        <strong>Processing Notes:</strong> {processingNotes}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Successfully extracted fields */}
              {extractedFields.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      Successfully Extracted ({extractedFields.length} fields)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {extractedFields.map(([field, value]) => {
                        const confidence = confidenceScores[field] || 0;
                        return (
                          <div 
                            key={field} 
                            className="bg-green-50 dark:bg-green-950/30 p-3 rounded-lg border border-green-200 dark:border-green-800"
                          >
                            <div className="flex items-center justify-between mb-2">
                              <div className="text-xs font-medium text-green-800 dark:text-green-200 capitalize">
                                {field.replace(/_/g, ' ')}
                              </div>
                              {confidence > 0 && (
                                <Badge 
                                  variant="outline" 
                                  className={`${getConfidenceColor(confidence)} text-xs flex items-center gap-1`}
                                >
                                  {getConfidenceIcon(confidence)}
                                  {Math.round(confidence * 100)}%
                                </Badge>
                              )}
                            </div>
                            <div className="text-sm text-green-900 dark:text-green-100 break-words">
                              {value}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Fields with no data found */}
              {emptyFields.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-orange-700 dark:text-orange-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      No Data Found ({emptyFields.length} fields)
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                      {emptyFields.map((field) => (
                        <div key={field} className="bg-orange-50 dark:bg-orange-950/30 p-2 rounded border border-orange-200 dark:border-orange-800 text-xs text-orange-800 dark:text-orange-200">
                          {field.replace(/_/g, ' ')}
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-orange-600 dark:text-orange-400 mt-3">
                      You can manually fill in these fields using the Edit tab or after adding to the runsheet.
                    </p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="edit" className="space-y-4 mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {availableColumns.map((field) => {
                  const value = editedData[field] || '';
                  const confidence = confidenceScores[field] || 0;
                  const hasData = value.trim() !== '';
                  
                  return (
                    <div 
                      key={field} 
                      className={`p-3 rounded-lg border-2 ${
                        hasData 
                          ? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30' 
                          : 'border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-950/30'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <Label htmlFor={field} className="text-sm font-medium capitalize">
                          {field.replace(/_/g, ' ')}
                        </Label>
                        {hasData && confidence > 0 && (
                          <Badge variant="outline" className={`${getConfidenceColor(confidence)} text-xs`}>
                            {Math.round(confidence * 100)}%
                          </Badge>
                        )}
                      </div>
                      
                      {field.toLowerCase().includes('notes') || field.toLowerCase().includes('description') || field.toLowerCase().includes('legal') ? (
                        <Textarea
                          id={field}
                          value={value}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          placeholder={`Enter ${field.replace(/_/g, ' ').toLowerCase()}...`}
                          className="min-h-[80px] text-sm"
                        />
                      ) : (
                        <Input
                          id={field}
                          value={value}
                          onChange={(e) => handleFieldChange(field, e.target.value)}
                          placeholder={`Enter ${field.replace(/_/g, ' ').toLowerCase()}...`}
                          className="text-sm"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent value="target" className="space-y-4 mt-4">
              {/* Conflicting Fields Warning */}
              {conflictingFields.length > 0 && (
                <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4" />
                      Data Conflict Detection ({conflictingFields.length} fields)
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-amber-700 dark:text-amber-300">
                      The target row already has data in some fields. Choose which fields to replace:
                    </p>
                    
                    <div className="flex gap-2 mb-3">
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={selectAllConflicts}
                        className="text-xs"
                      >
                        Select All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={deselectAllConflicts}
                        className="text-xs"
                      >
                        Deselect All
                      </Button>
                    </div>

                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {conflictingFields.map(({ field, existingValue, newValue }) => (
                        <div 
                          key={field}
                          className="bg-white dark:bg-gray-900 p-3 rounded border border-amber-200 dark:border-amber-800"
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              id={`replace-${field}`}
                              checked={fieldsToReplace[field] || false}
                              onCheckedChange={() => toggleFieldReplacement(field)}
                              className="mt-1"
                            />
                            <div className="flex-1 min-w-0">
                              <Label 
                                htmlFor={`replace-${field}`}
                                className="text-sm font-medium capitalize cursor-pointer"
                              >
                                {field.replace(/_/g, ' ')}
                              </Label>
                              <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                                <div className="bg-red-50 dark:bg-red-950/30 p-2 rounded border border-red-200 dark:border-red-800">
                                  <div className="font-medium text-red-700 dark:text-red-300 mb-1">Existing:</div>
                                  <div className="text-red-600 dark:text-red-400 truncate">{existingValue}</div>
                                </div>
                                <div className="bg-green-50 dark:bg-green-950/30 p-2 rounded border border-green-200 dark:border-green-800">
                                  <div className="font-medium text-green-700 dark:text-green-300 mb-1">New:</div>
                                  <div className="text-green-600 dark:text-green-400 truncate">{newValue}</div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Target className="h-4 w-4" />
                    Choose Target Row
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div 
                      className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                        selectedRowIndex === null 
                          ? 'border-primary bg-primary/10' 
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                      onClick={() => setSelectedRowIndex(null)}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded-full border-2 ${
                            selectedRowIndex === null ? 'border-primary bg-primary' : 'border-gray-300'
                          }`} />
                          <span className="font-medium">Next Available Row (Recommended)</span>
                        </div>
                        <Badge variant="outline">Row {nextEmptyRowIndex + 1}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1 ml-6">
                        Automatically finds the first completely empty row to prevent overwriting data.
                      </p>
                    </div>

                    <div className="text-sm font-medium text-muted-foreground">Or select a specific row:</div>
                    
                    <div className="max-h-48 overflow-y-auto space-y-1">
                      {currentRunsheetData.slice(0, 10).map((row, index) => {
                        const isEmpty = Object.values(row).every(value => 
                          !value || 
                          value.toString().trim() === '' || 
                          value.toString().trim().toLowerCase() === 'n/a'
                        );
                        const hasData = !isEmpty;
                        
                        return (
                          <div 
                            key={index}
                            className={`p-2 rounded border cursor-pointer transition-colors ${
                              selectedRowIndex === index 
                                ? 'border-primary bg-primary/10' 
                                : hasData 
                                  ? 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30'
                                  : 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-950/30 hover:border-green-300'
                            }`}
                            onClick={() => setSelectedRowIndex(index)}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className={`w-3 h-3 rounded-full border ${
                                  selectedRowIndex === index ? 'border-primary bg-primary' : 'border-gray-300'
                                }`} />
                                <span className="text-sm">Row {index + 1}</span>
                                {hasData && (
                                  <Badge variant="destructive" className="text-xs">Has Data</Badge>
                                )}
                                {isEmpty && (
                                  <Badge variant="outline" className="text-xs text-green-600">Empty</Badge>
                                )}
                              </div>
                            </div>
                            {hasData && (
                              <div className="ml-5 mt-1">
                                <p className="text-xs text-red-600 dark:text-red-400">
                                  ⚠️ This row contains data. Selecting it will overwrite existing information.
                                </p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <DialogFooter className="gap-2 flex-col sm:flex-row">
          <div className="flex gap-2 flex-1">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            {onRetryAnalysis && (
              <Button variant="outline" onClick={() => onRetryAnalysis(true)}>
                <Eye className="h-4 w-4 mr-1" />
                Try Vision
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            {conflictingFields.length > 0 && (
              <Button 
                variant="secondary"
                onClick={() => handleConfirm(true)}
                className="flex items-center gap-2"
              >
                <ShieldCheck className="h-4 w-4" />
                Keep Existing & Fill Empty
              </Button>
            )}
            <Button 
              onClick={() => handleConfirm(false)}
              className="flex items-center gap-2"
            >
              <CheckCircle className="h-4 w-4" />
              {conflictingFields.length > 0 ? 'Replace Selected' : 'Add to'} {previewTargetRow()}
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedDataVerificationDialog;
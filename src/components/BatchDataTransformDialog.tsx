import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, Wand2, Settings, RefreshCw } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface TransformResult {
  rowIndex: number;
  originalValue: string;
  transformedValue?: string;
  status: 'pending' | 'transforming' | 'success' | 'error';
  error?: string;
}

interface BatchDataTransformDialogProps {
  isOpen: boolean;
  onClose: () => void;
  columns: string[];
  currentData: Record<string, string>[];
  onDataUpdate: (newData: Record<string, string>[]) => void;
}

export const BatchDataTransformDialog: React.FC<BatchDataTransformDialogProps> = ({
  isOpen,
  onClose,
  columns,
  currentData,
  onDataUpdate
}) => {
  const { toast } = useToast();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [transformInstruction, setTransformInstruction] = useState('');
  const [isTransforming, setIsTransforming] = useState(false);
  const [results, setResults] = useState<TransformResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [sampleSize, setSampleSize] = useState(5);
  const [previewData, setPreviewData] = useState<{ original: string; preview: string }[]>([]);

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setSelectedColumns([]);
      setTransformInstruction('');
      setResults([]);
      setProgress(0);
      setPreviewData([]);
    }
  }, [isOpen]);

  // Generate preview when settings change
  useEffect(() => {
    if (selectedColumns.length > 0 && transformInstruction.trim()) {
      generatePreview();
    } else {
      setPreviewData([]);
    }
  }, [selectedColumns, transformInstruction, sampleSize]);

  const generatePreview = async () => {
    if (selectedColumns.length === 0 || !transformInstruction.trim()) return;

    try {
      // Get sample data from the first selected column
      const columnData = currentData.map(row => row[selectedColumns[0]] || '').filter(val => val.trim() !== '');
      const sampleData = columnData.slice(0, Math.min(sampleSize, columnData.length));
      
      if (sampleData.length === 0) {
        setPreviewData([]);
        return;
      }

      console.log('🔍 Generating preview for transformation...');

      const { data, error } = await supabase.functions.invoke('transform-batch-data', {
        body: {
          columnName: selectedColumns[0],
          transformInstruction,
          sampleData,
          allData: sampleData // For preview, use sample as both
        }
      });

      if (error) {
        console.error('Preview generation error:', error);
        return;
      }

      if (data?.success && data?.transformedData) {
        const preview = sampleData.map((original, index) => ({
          original,
          preview: data.transformedData[index] || original
        }));
        setPreviewData(preview);
      }
    } catch (error) {
      console.error('Error generating preview:', error);
    }
  };

  const startBatchTransformation = async () => {
    if (selectedColumns.length === 0) {
      toast({
        title: "No columns selected",
        description: "Please select at least one column to transform.",
        variant: "destructive"
      });
      return;
    }

    if (!transformInstruction.trim()) {
      toast({
        title: "No transformation instruction",
        description: "Please describe how you want the data transformed.",
        variant: "destructive"
      });
      return;
    }

    setIsTransforming(true);
    setProgress(0);

    try {
      const updatedData = [...currentData];
      let totalTransformed = 0;

      for (const columnName of selectedColumns) {
        console.log(`🔄 Transforming column: ${columnName}`);

        // Get all data for this column
        const columnData = currentData.map(row => row[columnName] || '');
        
        // Skip if no data in this column
        if (columnData.every(val => !val.trim())) {
          console.log(`⏭️ Skipping empty column: ${columnName}`);
          continue;
        }

        // Initialize results for this column
        const columnResults: TransformResult[] = columnData.map((value, index) => ({
          rowIndex: index,
          originalValue: value,
          status: 'pending'
        }));
        setResults(columnResults);

        // Transform the data
        const { data, error } = await supabase.functions.invoke('transform-batch-data', {
          body: {
            columnName,
            transformInstruction,
            sampleData: columnData.slice(0, 5), // Send sample for context
            allData: columnData
          }
        });

        if (error) {
          throw new Error(error.message || 'Transformation failed');
        }

        if (data?.success && data?.transformedData) {
          // Update the data with transformed values
          data.transformedData.forEach((transformedValue: string, index: number) => {
            if (index < updatedData.length) {
              updatedData[index][columnName] = transformedValue;
            }
          });

          // Update results
          const successResults = columnResults.map((result, index) => ({
            ...result,
            transformedValue: data.transformedData[index],
            status: 'success' as const
          }));
          setResults(successResults);
          totalTransformed++;
        } else {
          throw new Error('Invalid response from transformation service');
        }

        // Update progress
        setProgress(((totalTransformed + 1) / selectedColumns.length) * 100);
      }

      // Update the parent component with new data
      onDataUpdate(updatedData);

      toast({
        title: "Transformation completed",
        description: `Successfully transformed ${totalTransformed} column${totalTransformed !== 1 ? 's' : ''}.`,
      });

    } catch (error) {
      console.error('Batch transformation error:', error);
      toast({
        title: "Transformation failed",
        description: error.message || "An error occurred during transformation.",
        variant: "destructive"
      });

      // Update results to show error
      setResults(prev => prev.map(result => ({
        ...result,
        status: 'error' as const,
        error: error.message
      })));
    } finally {
      setIsTransforming(false);
    }
  };

  const getStatusIcon = (status: TransformResult['status']) => {
    switch (status) {
      case 'pending':
        return <Wand2 className="w-4 h-4 text-muted-foreground" />;
      case 'transforming':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Wand2 className="w-5 h-5" />
            Batch Data Transformation
          </DialogTitle>
          <DialogDescription>
            Use AI to transform and reformat data that's already been extracted to your spreadsheet.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {/* Transformation Instruction */}
          <div className="space-y-2">
            <Label htmlFor="instruction" className="text-sm font-medium">
              How do you want to transform the data?
            </Label>
            <Textarea
              id="instruction"
              value={transformInstruction}
              onChange={(e) => setTransformInstruction(e.target.value)}
              placeholder="E.g., 'Convert all dates to MM/DD/YYYY format' or 'Change all names from Last, First to First Last'"
              className="min-h-[80px]"
            />
          </div>

          {/* Settings */}
          <Collapsible open={showSettings} onOpenChange={setShowSettings}>
            <CollapsibleTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-2">
                <Settings className="w-4 h-4" />
                Column Selection & Settings
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4 border rounded-lg p-4">
              <div className="space-y-3">
                <div>
                  <Label className="text-sm font-medium">Select columns to transform:</Label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {columns.map(column => (
                      <div key={column} className="flex items-center space-x-2">
                        <Checkbox
                          id={`column-${column}`}
                          checked={selectedColumns.includes(column)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedColumns(prev => [...prev, column]);
                            } else {
                              setSelectedColumns(prev => prev.filter(c => c !== column));
                            }
                          }}
                        />
                        <Label htmlFor={`column-${column}`} className="text-sm">
                          {column}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-medium">Preview sample size:</Label>
                  <Select value={sampleSize.toString()} onValueChange={(value) => setSampleSize(parseInt(value))}>
                    <SelectTrigger className="w-32 mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3 items</SelectItem>
                      <SelectItem value="5">5 items</SelectItem>
                      <SelectItem value="10">10 items</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>

          {/* Preview */}
          {previewData.length > 0 && (
            <div className="space-y-2">
              <Label className="text-sm font-medium">Preview</Label>
              <div className="border rounded-lg p-3 bg-muted/30 space-y-2">
                {previewData.map((item, index) => (
                  <div key={index} className="text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs bg-background px-2 py-1 rounded">Before:</span>
                      <span>{item.original}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="font-mono text-xs bg-primary/10 px-2 py-1 rounded">After:</span>
                      <span className="text-primary">{item.preview}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {isTransforming && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Progress</span>
                <span className="text-sm text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <ScrollArea className="flex-1 h-[300px] border rounded-md p-4">
              <div className="space-y-2">
                {results.map((result, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {getStatusIcon(result.status)}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">Row {result.rowIndex + 1}</p>
                        <p className="text-sm text-muted-foreground truncate">
                          From: {result.originalValue || '(empty)'}
                        </p>
                        {result.transformedValue && (
                          <p className="text-sm text-primary truncate">
                            To: {result.transformedValue}
                          </p>
                        )}
                      </div>
                    </div>
                    {result.error && (
                      <p className="text-xs text-destructive max-w-[150px] truncate">
                        {result.error}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onClose} disabled={isTransforming}>
            Close
          </Button>
          
          <div className="flex gap-2">
            {!isTransforming && selectedColumns.length > 0 && transformInstruction.trim() && (
              <>
                {results.length > 0 && results.every(r => r.status === 'success' || r.status === 'error') ? (
                  <Button onClick={onClose} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Done
                  </Button>
                ) : (
                  <Button onClick={startBatchTransformation} className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4" />
                    Transform Data
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
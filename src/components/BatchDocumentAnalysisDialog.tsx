import React, { useState, useEffect } from 'react';
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Dialog, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, AlertCircle, FileText, Brain, Square, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { backgroundAnalyzer, type AnalysisProgress } from '@/utils/backgroundAnalyzer';
import { cn } from "@/lib/utils";

interface BatchAnalysisResult {
  rowIndex: number;
  documentName: string;
  status: 'pending' | 'analyzing' | 'success' | 'error';
  extractedData?: Record<string, string>;
  error?: string;
}

interface BatchDocumentAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  runsheetId: string;
  runsheetName: string;
  columns: string[];
  columnInstructions: Record<string, string>;
  documentMap: Map<number, DocumentRecord>;
  onDataUpdate: (data: Record<string, string>[]) => void;
  currentData: Record<string, string>[];
}

export const BatchDocumentAnalysisDialog: React.FC<BatchDocumentAnalysisDialogProps> = ({
  isOpen,
  onClose,
  runsheetId,
  runsheetName,
  columns,
  columnInstructions,
  documentMap,
  onDataUpdate,
  currentData
}) => {
  const { toast } = useToast();
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [results, setResults] = useState<BatchAnalysisResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [skipRowsWithData, setSkipRowsWithData] = useState(true);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);

  // Helper function to check if a row has data
  const hasRowData = (rowIndex: number): boolean => {
    if (!currentData || !currentData[rowIndex]) return false;
    const rowData = currentData[rowIndex];
    return Object.values(rowData).some(value => 
      value && typeof value === 'string' && value.trim() !== ''
    );
  };

  // Initialize results when dialog opens and check for existing job
  useEffect(() => {
    if (isOpen && documentMap.size > 0) {
      // Check if there's an existing job running
      const existingJob = backgroundAnalyzer.getJobStatus();
      if (existingJob && existingJob.runsheetId === runsheetId && existingJob.status === 'running') {
        setCurrentJobId(existingJob.id);
        setIsAnalyzing(true);
        setResults(existingJob.results);
        setProgress((existingJob.currentIndex / existingJob.documentMap.length) * 100);
      } else {
        const initialResults: BatchAnalysisResult[] = [];
        
        // Only include rows that have documents AND no existing data
        documentMap.forEach((doc, rowIndex) => {
          if (!hasRowData(rowIndex)) {
            initialResults.push({
              rowIndex,
              documentName: doc.stored_filename,
              status: 'pending'
            });
          }
        });
        
        setResults(initialResults.sort((a, b) => a.rowIndex - b.rowIndex));
        setProgress(0);
      }
    }
  }, [isOpen, documentMap, runsheetId, currentData]);

  // Subscribe to background analyzer progress
  useEffect(() => {
    const unsubscribe = backgroundAnalyzer.onProgress((progress: AnalysisProgress) => {
      if (progress.jobId === currentJobId) {
        setResults(progress.results);
        setProgress((progress.completed / progress.total) * 100);
        setIsAnalyzing(progress.status === 'running');
        
        // Update parent component with current data
        onDataUpdate(progress.currentData);
        
        if (progress.status === 'completed') {
          const successCount = progress.results.filter(r => r.status === 'success' && (!r.error || !r.error.includes('Skipped'))).length;
          const errorCount = progress.results.filter(r => r.status === 'error').length;
          const skippedCount = progress.results.filter(r => r.error && r.error.includes('Skipped')).length;
          
          toast({
            title: "Batch analysis completed",
            description: `Successfully analyzed ${successCount} documents.${errorCount > 0 ? ` ${errorCount} failed.` : ''}${skippedCount > 0 ? ` ${skippedCount} skipped.` : ''} You can now close this dialog.`,
          });
          
          setCurrentJobId(null);
          setIsAnalyzing(false);
        }
      }
    });

    return unsubscribe;
  }, [currentJobId, onDataUpdate, toast]);


  const startBatchAnalysis = async () => {
    if (results.length === 0) {
      toast({
        title: "No empty rows to analyze",
        description: "All rows with documents already contain data.",
        variant: "default"
      });
      return;
    }

    try {
      // Create a filtered document map with only empty rows
      const filteredDocumentMap = new Map<number, DocumentRecord>();
      results.forEach(result => {
        const doc = documentMap.get(result.rowIndex);
        if (doc) {
          filteredDocumentMap.set(result.rowIndex, doc);
        }
      });

      const jobId = await backgroundAnalyzer.startAnalysis(
        runsheetId,
        runsheetName,
        columns,
        columnInstructions,
        filteredDocumentMap, // Use filtered map instead of full documentMap
        currentData,
        true // Always skip rows with data since we've pre-filtered
      );
      
      setCurrentJobId(jobId);
      setIsAnalyzing(true);
      
      toast({
        title: "Analysis started",
        description: `Analyzing ${results.length} empty row${results.length !== 1 ? 's' : ''} with documents.`,
      });
    } catch (error) {
      console.error('Failed to start batch analysis:', error);
      toast({
        title: "Failed to start analysis",
        description: "An error occurred while starting the analysis.",
        variant: "destructive"
      });
    }
  };


  const handleAbort = () => {
    if (currentJobId) {
      backgroundAnalyzer.cancelAnalysis();
      setCurrentJobId(null);
      setIsAnalyzing(false);
      toast({
        title: "Analysis cancelled",
        description: "Batch document analysis has been cancelled.",
      });
    }
  };

  const getStatusIcon = (status: BatchAnalysisResult['status']) => {
    switch (status) {
      case 'pending':
        return <FileText className="w-4 h-4 text-muted-foreground" />;
      case 'analyzing':
        return <Brain className="w-4 h-4 text-blue-500 animate-pulse" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const getStatusText = (status: BatchAnalysisResult['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'analyzing':
        return 'Analyzing...';
      case 'success':
        return 'Success';
      case 'error':
        return 'Failed';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose} modal={false}>
      <DialogPrimitive.Portal>
        {/* Custom semi-transparent overlay that allows scrolling */}
        <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[1px] pointer-events-none" />
        
        {/* Fixed positioned dialog content */}
        <div className={cn(
          "fixed top-4 right-4 z-50 grid w-full max-w-2xl max-h-[80vh] gap-4 border bg-background p-6 shadow-xl duration-200",
          "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          "data-[state=closed]:slide-out-to-right-full data-[state=open]:slide-in-from-right-full",
          "sm:rounded-lg flex flex-col"
        )}>
          <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground">
            <X className="h-4 w-4" />
            <span className="sr-only">Close</span>
          </DialogPrimitive.Close>
          
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Batch Document Analysis
            </DialogTitle>
            <DialogDescription>
              Analyze all linked documents in this runsheet to automatically extract data.
            </DialogDescription>
          </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {results.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No empty rows with documents found</p>
              <p className="text-sm">All rows with documents already contain data, so there's nothing to analyze.</p>
              <p className="text-sm mt-2">This prevents accidentally overwriting your existing work.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                  <p className="text-sm text-blue-800">
                    <strong>Safe Mode:</strong> Only analyzing {results.length} empty row{results.length !== 1 ? 's' : ''} with documents. 
                    Rows with existing data are automatically skipped to prevent overwriting your work.
                  </p>
                </div>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Progress: {Math.round(progress)}%
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {results.filter(r => r.status === 'success').length} / {results.length} completed
                    </span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              </div>

              <ScrollArea className="flex-1 h-[300px] border rounded-md p-4">
                <div className="space-y-2">
                  {results.map((result) => (
                    <div
                      key={result.rowIndex}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        {getStatusIcon(result.status)}
                        <div>
                          <p className="font-medium">Row {result.rowIndex + 1}</p>
                          <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                            {result.documentName}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{getStatusText(result.status)}</p>
                        {result.status === 'success' && result.extractedData && Object.keys(result.extractedData).length > 0 && (
                          <p className="text-xs text-muted-foreground">
                            {Object.keys(result.extractedData).length} fields extracted
                          </p>
                        )}
                        {result.status === 'success' && result.error && (
                          <p className="text-xs text-yellow-600 max-w-[150px] truncate">
                            {result.error}
                          </p>
                        )}
                        {result.status === 'error' && result.error && (
                          <p className="text-xs text-destructive max-w-[150px] truncate">
                            {result.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          
          <div className="flex gap-2">
            {/* Show different buttons based on analysis state */}
            {!isAnalyzing && results.every(r => r.status === 'pending') && (
              <Button 
                onClick={startBatchAnalysis} 
                disabled={documentMap.size === 0}
                className="flex items-center gap-2"
              >
                <Brain className="w-4 h-4" />
                Start Analysis
              </Button>
            )}
            
            {/* Show analysis complete state */}
            {!isAnalyzing && results.length > 0 && results.every(r => r.status === 'success' || r.status === 'error') && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Analysis Complete
              </div>
            )}
            
            {/* Show controls during analysis */}
            {isAnalyzing && (
              <Button 
                onClick={handleAbort} 
                variant="destructive"
                className="flex items-center gap-2"
              >
                <Square className="w-4 h-4" />
                Stop
              </Button>
            )}
          </div>
          </div>
        </div>
      </DialogPrimitive.Portal>
    </Dialog>
  );
};
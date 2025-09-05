import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, AlertCircle, FileText, Brain } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';

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

  // Initialize results when dialog opens
  useEffect(() => {
    if (isOpen && documentMap.size > 0) {
      const initialResults: BatchAnalysisResult[] = [];
      documentMap.forEach((doc, rowIndex) => {
        initialResults.push({
          rowIndex,
          documentName: doc.stored_filename,
          status: 'pending'
        });
      });
      setResults(initialResults.sort((a, b) => a.rowIndex - b.rowIndex));
      setProgress(0);
    }
  }, [isOpen, documentMap]);

  const analyzeDocument = async (document: DocumentRecord, rowIndex: number): Promise<Record<string, string> | null> => {
    const documentUrl = DocumentService.getDocumentUrl(document.file_path);
    const isPdf = document.content_type === 'application/pdf' || document.stored_filename.toLowerCase().endsWith('.pdf');
    
    // Get extraction fields
    const extractionFields = columns.map(col => 
      `${col}: ${columnInstructions[col] || 'Extract this field'}`
    ).join('\n');

    try {
      let analysisResult;
      
      if (isPdf) {
        // For PDFs, fetch and convert to base64
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        const pdfData = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
        
        const { data, error } = await supabase.functions.invoke('analyze-document', {
          body: {
            prompt: `Extract information from this document for the following fields and return as valid JSON:\n${extractionFields}\n\nReturn only a JSON object with field names as keys and extracted values as values. Do not include any markdown, explanations, or additional text.`,
            imageData: pdfData,
            fileName: document.stored_filename
          },
        });
        
        if (error) throw error;
        analysisResult = data;
      } else {
        // For images
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        const reader = new FileReader();
        const imageData = await new Promise<string>((resolve) => {
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });

        const { data, error } = await supabase.functions.invoke('analyze-document', {
          body: {
            prompt: `Extract information from this document for the following fields and return as valid JSON:\n${extractionFields}\n\nReturn only a JSON object with field names as keys and extracted values as values. Do not include any markdown, explanations, or additional text.`,
            imageData
          },
        });
        
        if (error) throw error;
        analysisResult = data;
      }

      if (analysisResult?.generatedText) {
        // Parse the JSON response from AI
        let extractedData = {};
        try {
          extractedData = JSON.parse(analysisResult.generatedText);
        } catch (e) {
          // Try to extract JSON from the text
          const jsonMatch = analysisResult.generatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          } else {
            throw new Error('Could not extract valid JSON from AI response');
          }
        }

        // Filter to only include columns that exist in our runsheet
        const filteredData: Record<string, string> = {};
        Object.keys(extractedData).forEach(key => {
          if (columns.includes(key) && extractedData[key]) {
            filteredData[key] = extractedData[key];
          }
        });

        return filteredData;
      }
      
      return null;
    } catch (error) {
      console.error('Error analyzing document:', error);
      throw error;
    }
  };

  const startBatchAnalysis = async () => {
    if (documentMap.size === 0) {
      toast({
        title: "No documents to analyze",
        description: "There are no documents linked to this runsheet.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    const controller = new AbortController();
    setAbortController(controller);

    const documentsToAnalyze = Array.from(documentMap.entries());
    const totalDocuments = documentsToAnalyze.length;
    let completedCount = 0;
    const updatedData = [...currentData];

    try {
      for (const [rowIndex, document] of documentsToAnalyze) {
        if (controller.signal.aborted) break;

        // Update status to analyzing
        setResults(prev => prev.map(result => 
          result.rowIndex === rowIndex 
            ? { ...result, status: 'analyzing' }
            : result
        ));

        try {
          const extractedData = await analyzeDocument(document, rowIndex);
          
          if (extractedData && Object.keys(extractedData).length > 0) {
            // Update the row data
            if (!updatedData[rowIndex]) {
              updatedData[rowIndex] = {};
            }
            
            // Merge extracted data with existing data
            updatedData[rowIndex] = {
              ...updatedData[rowIndex],
              ...extractedData
            };

            // Update results
            setResults(prev => prev.map(result => 
              result.rowIndex === rowIndex 
                ? { ...result, status: 'success', extractedData }
                : result
            ));
          } else {
            throw new Error('No data extracted from document');
          }
        } catch (error) {
          console.error(`Error analyzing document at row ${rowIndex}:`, error);
          setResults(prev => prev.map(result => 
            result.rowIndex === rowIndex 
              ? { ...result, status: 'error', error: error.message }
              : result
          ));
        }

        completedCount++;
        setProgress((completedCount / totalDocuments) * 100);
      }

      if (!controller.signal.aborted) {
        // Update the data in the parent component
        onDataUpdate(updatedData);
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        toast({
          title: "Batch analysis completed",
          description: `Successfully analyzed ${successCount} documents. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
        });
      }
    } catch (error) {
      console.error('Batch analysis error:', error);
      toast({
        title: "Batch analysis failed",
        description: "An error occurred during batch analysis. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  const handleAbort = () => {
    if (abortController) {
      abortController.abort();
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
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
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
          {documentMap.size === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents found in this runsheet.</p>
              <p className="text-sm">Link some documents first, then try batch analysis.</p>
            </div>
          ) : (
            <>
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
                        {result.status === 'success' && result.extractedData && (
                          <p className="text-xs text-muted-foreground">
                            {Object.keys(result.extractedData).length} fields extracted
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
          <Button variant="outline" onClick={onClose} disabled={isAnalyzing}>
            {isAnalyzing ? 'Close When Done' : 'Close'}
          </Button>
          
          <div className="flex gap-2">
            {isAnalyzing && (
              <Button variant="destructive" onClick={handleAbort}>
                Cancel Analysis
              </Button>
            )}
            {!isAnalyzing && documentMap.size > 0 && (
              <Button onClick={startBatchAnalysis} className="flex items-center gap-2">
                <Brain className="w-4 h-4" />
                Start Analysis
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
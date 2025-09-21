import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { 
  AlertCircle, 
  CheckCircle, 
  FileText, 
  RefreshCw,
  Brain,
  Clock,
  ChevronRight,
  BookOpen,
  Users,
  Plus,
  Eye,
  X
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DocumentService, DocumentRecord } from '@/services/documentService';

interface InstrumentBoundary {
  instrumentType: string;
  instrumentName: string;
  pageStart: number;
  pageEnd: number;
  confidence: number;
  keyIdentifiers: string[];
  extractedData: Record<string, any>;
}

interface MultiInstrumentAnalysis {
  success: boolean;
  instrumentsDetected: number;
  instruments: InstrumentBoundary[];
  processingNotes: string[];
  totalPages: number;
}

interface DocumentAnalysisResult {
  documentId: string;
  fileName: string;
  status: 'pending' | 'analyzing' | 'completed' | 'error';
  analysis?: MultiInstrumentAnalysis;
  error?: string;
  instrumentsSelected?: number[];
}

interface BatchMultiInstrumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  runsheetId: string;
  documents: DocumentRecord[];
  availableColumns: string[];
  columnInstructions?: Record<string, string>;
  onBatchComplete?: () => void;
}

export const BatchMultiInstrumentDialog: React.FC<BatchMultiInstrumentDialogProps> = ({
  isOpen,
  onClose,
  runsheetId,
  documents,
  availableColumns,
  columnInstructions = {},
  onBatchComplete
}) => {
  const [analysisResults, setAnalysisResults] = useState<Map<string, DocumentAnalysisResult>>(new Map());
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentAnalysisIndex, setCurrentAnalysisIndex] = useState(0);
  const [totalProgress, setTotalProgress] = useState(0);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen && documents.length > 0) {
      // Initialize analysis results
      const initialResults = new Map<string, DocumentAnalysisResult>();
      documents.forEach(doc => {
        initialResults.set(doc.id, {
          documentId: doc.id,
          fileName: doc.original_filename,
          status: 'pending'
        });
      });
      setAnalysisResults(initialResults);
    }
  }, [isOpen, documents]);

  const convertFileToBase64 = async (url: string): Promise<string> => {
    const response = await fetch(url);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const analyzeDocument = async (document: DocumentRecord): Promise<MultiInstrumentAnalysis | null> => {
    try {
      // Get document URL and convert to base64
      const documentUrl = await DocumentService.getDocumentUrl(document.file_path);
      const documentData = await convertFileToBase64(documentUrl);

      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      const response = await supabase.functions.invoke('analyze-multi-instrument-document', {
        body: {
          documentData,
          fileName: document.original_filename,
          runsheetId,
          availableColumns,
          columnInstructions,
          documentId: document.id
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Analysis failed');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Analysis failed');
      }

      return response.data.analysis as MultiInstrumentAnalysis;

    } catch (error) {
      console.error('Error analyzing document:', document.original_filename, error);
      throw error;
    }
  };

  const startBatchAnalysis = async () => {
    setIsAnalyzing(true);
    setCurrentAnalysisIndex(0);
    setTotalProgress(0);

    for (let i = 0; i < documents.length; i++) {
      const document = documents[i];
      setCurrentAnalysisIndex(i);

      // Update status to analyzing
      setAnalysisResults(prev => {
        const updated = new Map(prev);
        const result = updated.get(document.id);
        if (result) {
          result.status = 'analyzing';
          updated.set(document.id, result);
        }
        return updated;
      });

      try {
        const analysis = await analyzeDocument(document);
        
        // Update with completed analysis
        setAnalysisResults(prev => {
          const updated = new Map(prev);
          const result = updated.get(document.id);
          if (result) {
            result.status = 'completed';
            result.analysis = analysis;
            // Pre-select all instruments
            result.instrumentsSelected = analysis.instruments.map((_, idx) => idx);
            updated.set(document.id, result);
          }
          return updated;
        });

      } catch (error) {
        // Update with error
        setAnalysisResults(prev => {
          const updated = new Map(prev);
          const result = updated.get(document.id);
          if (result) {
            result.status = 'error';
            result.error = error instanceof Error ? error.message : 'Analysis failed';
            updated.set(document.id, result);
          }
          return updated;
        });
      }

      // Update progress
      setTotalProgress(((i + 1) / documents.length) * 100);
    }

    setIsAnalyzing(false);
    
    // Show completion toast
    const completedCount = Array.from(analysisResults.values()).filter(r => r.status === 'completed').length;
    toast({
      title: "Batch Analysis Complete",
      description: `Analyzed ${completedCount} of ${documents.length} documents`,
    });
  };

  const toggleInstrumentSelection = (documentId: string, instrumentIndex: number) => {
    setAnalysisResults(prev => {
      const updated = new Map(prev);
      const result = updated.get(documentId);
      if (result && result.instrumentsSelected) {
        const selected = new Set(result.instrumentsSelected);
        if (selected.has(instrumentIndex)) {
          selected.delete(instrumentIndex);
        } else {
          selected.add(instrumentIndex);
        }
        result.instrumentsSelected = Array.from(selected);
        updated.set(documentId, result);
      }
      return updated;
    });
  };

  const createInstrumentRows = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      let totalInstruments = 0;
      let successfulInstruments = 0;

      for (const [documentId, result] of analysisResults.entries()) {
        if (result.status === 'completed' && result.analysis && result.instrumentsSelected) {
          const selectedInstruments = result.instrumentsSelected.map(idx => result.analysis!.instruments[idx]);
          
          if (selectedInstruments.length > 0) {
            totalInstruments += selectedInstruments.length;

            const response = await supabase.functions.invoke('create-instrument-rows', {
              body: {
                originalDocumentId: documentId,
                runsheetId,
                instruments: selectedInstruments
              }
            });

            if (response.data?.success) {
              successfulInstruments += selectedInstruments.length;
            }
          }
        }
      }

      toast({
        title: "Instruments Created",
        description: `Successfully created ${successfulInstruments} of ${totalInstruments} instrument rows`,
      });

      onBatchComplete?.();
      onClose();

    } catch (error) {
      console.error('Error creating instrument rows:', error);
      toast({
        title: "Error Creating Instruments",
        description: error instanceof Error ? error.message : 'Failed to create instrument rows',
        variant: "destructive"
      });
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'analyzing': return <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />;
      case 'error': return <AlertCircle className="h-4 w-4 text-red-500" />;
      default: return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  const getSelectedInstrumentCount = () => {
    return Array.from(analysisResults.values()).reduce((total, result) => {
      return total + (result.instrumentsSelected?.length || 0);
    }, 0);
  };

  const getCompletedAnalysisCount = () => {
    return Array.from(analysisResults.values()).filter(r => r.status === 'completed').length;
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-6xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Batch Multi-Instrument Analysis
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {/* Analysis Controls */}
            {!isAnalyzing && analysisResults.size === 0 && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary/10 rounded-full">
                      <BookOpen className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Batch Multi-Instrument Analysis</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Analyze {documents.length} documents to detect multiple instruments and create separate runsheet rows for each.
                      </p>
                    </div>
                    <Button
                      onClick={startBatchAnalysis}
                      className="w-full"
                    >
                      <Brain className="h-4 w-4 mr-2" />
                      Start Batch Analysis
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Progress Display */}
            {isAnalyzing && (
              <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Analyzing Documents... ({currentAnalysisIndex + 1} of {documents.length})
                      </span>
                    </div>
                    <Progress value={totalProgress} className="w-full" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      Currently analyzing: {documents[currentAnalysisIndex]?.original_filename}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Results Display */}
            {analysisResults.size > 0 && !isAnalyzing && (
              <div className="space-y-4">
                <Card className="bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-500" />
                        <span className="font-medium text-green-800 dark:text-green-200">
                          Analysis Complete
                        </span>
                      </div>
                      <div className="flex gap-2">
                        <Badge variant="secondary">
                          {getCompletedAnalysisCount()} Documents Analyzed
                        </Badge>
                        <Badge variant="outline">
                          {getSelectedInstrumentCount()} Instruments Selected
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Document Results */}
                <div className="space-y-3">
                  {Array.from(analysisResults.values()).map((result) => (
                    <Card key={result.documentId}>
                      <CardContent className="pt-6">
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {getStatusIcon(result.status)}
                              <span className="font-medium">{result.fileName}</span>
                              {result.analysis && (
                                <Badge variant="outline">
                                  {result.analysis.instrumentsDetected} Instruments
                                </Badge>
                              )}
                            </div>
                          </div>

                          {result.error && (
                            <Alert variant="destructive">
                              <AlertCircle className="h-4 w-4" />
                              <AlertDescription>{result.error}</AlertDescription>
                            </Alert>
                          )}

                          {result.analysis && (
                            <div className="space-y-2">
                              {result.analysis.instruments.map((instrument, idx) => (
                                <div
                                  key={idx}
                                  className={`p-3 border rounded-lg cursor-pointer transition-colors ${
                                    result.instrumentsSelected?.includes(idx)
                                      ? 'border-primary bg-primary/5'
                                      : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                  onClick={() => toggleInstrumentSelection(result.documentId, idx)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <h5 className="font-medium">{instrument.instrumentName}</h5>
                                      <p className="text-sm text-muted-foreground">
                                        {instrument.instrumentType} • Pages {instrument.pageStart}
                                        {instrument.pageEnd !== instrument.pageStart && `-${instrument.pageEnd}`} • 
                                        Confidence: {instrument.confidence}%
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {result.instrumentsSelected?.includes(idx) ? (
                                        <CheckCircle className="h-4 w-4 text-primary" />
                                      ) : (
                                        <div className="h-4 w-4 rounded-full border-2 border-gray-300" />
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={onClose} disabled={isAnalyzing}>
              Cancel
            </Button>
            
            {!isAnalyzing && analysisResults.size > 0 && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={startBatchAnalysis}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Re-analyze All
                </Button>
                <Button
                  onClick={createInstrumentRows}
                  disabled={getSelectedInstrumentCount() === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Create {getSelectedInstrumentCount()} Instruments
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BatchMultiInstrumentDialog;
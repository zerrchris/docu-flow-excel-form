import React, { useState, useCallback } from 'react';
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
  Eye, 
  FileText, 
  RefreshCw,
  Brain,
  Target,
  Clock,
  ChevronRight,
  BookOpen,
  Users,
  Plus
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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

interface MultiInstrumentAnalysisDialogProps {
  isOpen: boolean;
  onClose: () => void;
  selectedFile: File | null;
  runsheetId: string;
  availableColumns: string[];
  columnInstructions?: Record<string, string>;
  documentId?: string;
  onInstrumentsConfirmed?: (instruments: InstrumentBoundary[]) => void;
}

export const MultiInstrumentAnalysisDialog: React.FC<MultiInstrumentAnalysisDialogProps> = ({
  isOpen,
  onClose,
  selectedFile,
  runsheetId,
  availableColumns,
  columnInstructions = {},
  documentId,
  onInstrumentsConfirmed
}) => {
  const [analysis, setAnalysis] = useState<MultiInstrumentAnalysis | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedInstruments, setSelectedInstruments] = useState<Set<number>>(new Set());
  const { toast } = useToast();

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const performMultiInstrumentAnalysis = useCallback(async () => {
    if (!selectedFile) return;

    setIsAnalyzing(true);
    setError(null);
    setAnalysis(null);
    setProgress(0);

    try {
      // Convert file to base64
      setProgress(20);
      const documentData = await convertFileToBase64(selectedFile);
      
      setProgress(40);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      setProgress(60);
      console.log('🔍 Starting multi-instrument analysis for:', selectedFile.name);

      const response = await supabase.functions.invoke('analyze-multi-instrument-document', {
        body: {
          documentData,
          fileName: selectedFile.name,
          runsheetId,
          availableColumns,
          columnInstructions,
          documentId
        }
      });

      setProgress(80);

      if (response.error) {
        throw new Error(response.error.message || 'Analysis failed');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Analysis failed');
      }

      const analysisResult = response.data.analysis as MultiInstrumentAnalysis;
      setAnalysis(analysisResult);
      
      // Pre-select all instruments
      setSelectedInstruments(new Set(analysisResult.instruments.map((_, index) => index)));
      
      setProgress(100);

      toast({
        title: "Multi-Instrument Analysis Complete",
        description: `Found ${analysisResult.instrumentsDetected} instruments in ${selectedFile.name}`,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      setError(errorMessage);
      console.error('Multi-instrument analysis error:', error);
      
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile, runsheetId, availableColumns, columnInstructions, documentId, toast]);

  const handleInstrumentToggle = (index: number) => {
    const newSelected = new Set(selectedInstruments);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedInstruments(newSelected);
  };

  const handleConfirmInstruments = async () => {
    if (!analysis) return;

    const selectedInstrumentData = analysis.instruments.filter((_, index) => 
      selectedInstruments.has(index)
    );

    try {
      // Create page range documents for selected instruments
      for (let i = 0; i < selectedInstrumentData.length; i++) {
        const instrument = selectedInstrumentData[i];
        
        // Call function to create page range document and populate runsheet
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Authentication required');

        const response = await supabase.functions.invoke('create-instrument-rows', {
          body: {
            originalDocumentId: documentId,
            runsheetId,
            instruments: [instrument], // Process one at a time
            startRowIndex: i // This will be calculated by the function
          }
        });

        if (response.error) {
          console.error('Error creating instrument row:', response.error);
        }
      }

      onInstrumentsConfirmed?.(selectedInstrumentData);
      
      toast({
        title: "Instruments Added",
        description: `Successfully added ${selectedInstrumentData.length} instruments to the runsheet`,
      });
      
      onClose();
      
    } catch (error) {
      console.error('Error confirming instruments:', error);
      toast({
        title: "Error Adding Instruments",
        description: error instanceof Error ? error.message : 'Failed to add instruments',
        variant: "destructive"
      });
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 90) return 'bg-green-500';
    if (confidence >= 70) return 'bg-yellow-500';
    if (confidence >= 50) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getConfidenceText = (confidence: number) => {
    if (confidence >= 90) return 'High';
    if (confidence >= 70) return 'Medium';
    if (confidence >= 50) return 'Low';
    return 'Very Low';
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Multi-Instrument Analysis
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {/* Analysis Controls */}
            {!analysis && !isAnalyzing && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary/10 rounded-full">
                      <Users className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Detect Multiple Instruments</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Analyze this document to identify separate legal instruments and create individual runsheet rows for each one.
                      </p>
                    </div>
                    <Button
                      onClick={performMultiInstrumentAnalysis}
                      disabled={!selectedFile}
                      className="w-full"
                    >
                      <Brain className="h-4 w-4 mr-2" />
                      Analyze for Multiple Instruments
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Analysis Progress */}
            {isAnalyzing && (
              <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="space-y-4">
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-blue-600 animate-pulse" />
                      <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                        Analyzing Document Structure...
                      </span>
                    </div>
                    <Progress value={progress} className="w-full" />
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      This may take a moment as we analyze the entire document for instrument boundaries.
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription className="flex items-center justify-between">
                  <span>{error}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={performMultiInstrumentAnalysis}
                    className="ml-2"
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Retry
                  </Button>
                </AlertDescription>
              </Alert>
            )}

            {/* Analysis Results */}
            {analysis && !isAnalyzing && (
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
                      <Badge variant="secondary">
                        {analysis.instrumentsDetected} Instruments Found
                      </Badge>
                    </div>
                    <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                      Found {analysis.instrumentsDetected} separate instruments in {analysis.totalPages} pages. 
                      Select the instruments you want to add as separate rows.
                    </p>
                  </CardContent>
                </Card>

                {/* Instruments List */}
                <div className="space-y-3">
                  {analysis.instruments.map((instrument, index) => (
                    <Card 
                      key={index} 
                      className={`cursor-pointer transition-colors ${
                        selectedInstruments.has(index) 
                          ? 'ring-2 ring-primary bg-primary/5' 
                          : 'hover:bg-muted/50'
                      }`}
                      onClick={() => handleInstrumentToggle(index)}
                    >
                      <CardContent className="pt-6">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium">{instrument.instrumentName}</h4>
                              <Badge variant="outline">{instrument.instrumentType}</Badge>
                              <Badge 
                                className={`text-white ${getConfidenceColor(instrument.confidence)}`}
                              >
                                {getConfidenceText(instrument.confidence)} ({instrument.confidence}%)
                              </Badge>
                            </div>
                            
                            <p className="text-sm text-muted-foreground">
                              Pages {instrument.pageStart}
                              {instrument.pageEnd !== instrument.pageStart && `-${instrument.pageEnd}`}
                            </p>

                            {instrument.keyIdentifiers.length > 0 && (
                              <div className="space-y-1">
                                <p className="text-xs font-medium text-muted-foreground">Key Identifiers:</p>
                                <div className="flex flex-wrap gap-1">
                                  {instrument.keyIdentifiers.slice(0, 3).map((identifier, idx) => (
                                    <Badge key={idx} variant="secondary" className="text-xs">
                                      {identifier.slice(0, 50)}{identifier.length > 50 ? '...' : ''}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Extracted Data Preview */}
                            <div className="space-y-1">
                              <p className="text-xs font-medium text-muted-foreground">Extracted Data:</p>
                              <div className="grid grid-cols-2 gap-2 text-xs">
                                {Object.entries(instrument.extractedData).slice(0, 4).map(([key, value]) => (
                                  <div key={key} className="truncate">
                                    <span className="font-medium">{key}:</span> {value || 'N/A'}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                          
                          <ChevronRight className={`h-4 w-4 transition-transform ${
                            selectedInstruments.has(index) ? 'rotate-90' : ''
                          }`} />
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                {/* Processing Notes */}
                {analysis.processingNotes && analysis.processingNotes.length > 0 && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Processing Notes</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="text-sm text-muted-foreground space-y-1">
                        {analysis.processingNotes.map((note, index) => (
                          <li key={index} className="flex items-start gap-2">
                            <span className="text-xs mt-1">•</span>
                            <span>{note}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            
            {analysis && (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={performMultiInstrumentAnalysis}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Re-analyze
                </Button>
                <Button
                  onClick={handleConfirmInstruments}
                  disabled={selectedInstruments.size === 0}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add {selectedInstruments.size} Instruments
                </Button>
              </div>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default MultiInstrumentAnalysisDialog;
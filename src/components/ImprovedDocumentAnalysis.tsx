import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  AlertCircle, 
  CheckCircle, 
  Eye, 
  FileText, 
  Zap, 
  RefreshCw,
  Upload,
  Brain,
  Target,
  Clock
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import AdvancedDataVerificationDialog from './AdvancedDataVerificationDialog';

interface ImprovedDocumentAnalysisProps {
  runsheetId: string;
  availableColumns: string[];
  currentRunsheetData: Record<string, string>[];
  onAnalysisComplete?: (data: any, targetRowIndex: number) => void;
  onDataPopulated?: () => void;
}

interface AnalysisResult {
  extracted_data: Record<string, string>;
  confidence_scores: Record<string, number>;
  document_type: string;
  extraction_summary: string;
  processing_notes: string;
}

interface AnalysisStep {
  id: string;
  name: string;
  status: 'pending' | 'in-progress' | 'completed' | 'error';
  message?: string;
}

const ImprovedDocumentAnalysis: React.FC<ImprovedDocumentAnalysisProps> = ({
  runsheetId,
  availableColumns,
  currentRunsheetData,
  onAnalysisComplete,
  onDataPopulated
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showVerificationDialog, setShowVerificationDialog] = useState(false);
  const [analysisSteps, setAnalysisSteps] = useState<AnalysisStep[]>([]);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const { toast } = useToast();

  const initializeAnalysisSteps = () => {
    const steps: AnalysisStep[] = [
      { id: 'upload', name: 'Document Upload', status: 'pending' },
      { id: 'validation', name: 'Format Validation', status: 'pending' },
      { id: 'ai-analysis', name: 'AI Document Analysis', status: 'pending' },
      { id: 'data-extraction', name: 'Data Extraction', status: 'pending' },
      { id: 'verification', name: 'Data Verification', status: 'pending' }
    ];
    setAnalysisSteps(steps);
    return steps;
  };

  const updateStep = (stepId: string, status: AnalysisStep['status'], message?: string) => {
    setAnalysisSteps(prev => prev.map(step => 
      step.id === stepId 
        ? { ...step, status, message } 
        : step
    ));
    
    // Update progress
    setAnalysisSteps(current => {
      const completed = current.filter(s => s.status === 'completed').length;
      const total = current.length;
      setAnalysisProgress((completed / total) * 100);
      return current;
    });
  };

  const convertFileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type and size
    const maxSize = 50 * 1024 * 1024; // 50MB
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp'];

    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 50MB",
        variant: "destructive"
      });
      return;
    }

    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Unsupported format",
        description: "Please upload an image file (PNG, JPEG, GIF, WebP, BMP)",
        variant: "destructive"
      });
      return;
    }

    setSelectedFile(file);
    setError(null);
    setAnalysisResult(null);
    toast({
      title: "File selected",
      description: `Ready to analyze ${file.name}`,
    });
  };

  const performAnalysis = useCallback(async (useVision: boolean = false) => {
    if (!selectedFile) {
      toast({
        title: "No file selected",
        description: "Please select a document to analyze",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setAnalysisResult(null);

    const steps = initializeAnalysisSteps();
    
    try {
      // Step 1: Upload
      updateStep('upload', 'in-progress', 'Converting file to base64...');
      const base64Data = await convertFileToBase64(selectedFile);
      updateStep('upload', 'completed', 'File successfully processed');

      // Step 2: Validation
      updateStep('validation', 'in-progress', 'Validating document format...');
      await new Promise(resolve => setTimeout(resolve, 500)); // Simulate validation
      updateStep('validation', 'completed', 'Document format validated');

      // Step 3: AI Analysis
      updateStep('ai-analysis', 'in-progress', 'AI is analyzing document content...');
      
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      const response = await supabase.functions.invoke('enhanced-document-analysis', {
        body: {
          document_data: base64Data,
          runsheet_id: runsheetId,
          document_name: selectedFile.name,
          extraction_preferences: {
            columns: availableColumns,
            use_vision: useVision
          }
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Analysis failed');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Analysis failed');
      }

      updateStep('ai-analysis', 'completed', 'AI analysis completed successfully');

      // Step 4: Data Extraction
      updateStep('data-extraction', 'in-progress', 'Extracting structured data...');
      const analysis = response.data.analysis;
      
      if (!analysis.extracted_data || Object.keys(analysis.extracted_data).length === 0) {
        throw new Error('No data could be extracted from the document');
      }

      setAnalysisResult(analysis);
      updateStep('data-extraction', 'completed', `Extracted ${Object.keys(analysis.extracted_data).length} fields`);

      // Step 5: Verification
      updateStep('verification', 'in-progress', 'Preparing data verification...');
      setShowVerificationDialog(true);
      updateStep('verification', 'completed', 'Ready for user verification');

      toast({
        title: "Analysis Complete",
        description: `Successfully extracted ${Object.keys(analysis.extracted_data).filter(k => 
          analysis.extracted_data[k] && analysis.extracted_data[k].toString().trim() !== ''
        ).length} fields from ${selectedFile.name}`,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      setError(errorMessage);
      
      // Update the current step as error
      const currentStep = steps.find(s => s.status === 'in-progress');
      if (currentStep) {
        updateStep(currentStep.id, 'error', errorMessage);
      }

      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  }, [selectedFile, runsheetId, availableColumns, toast]);

  const handleDataConfirmation = async (editedData: Record<string, string>, targetRowIndex?: number) => {
    if (!analysisResult) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      const response = await supabase.functions.invoke('populate-runsheet-data', {
        body: {
          runsheetId,
          extractedData: editedData,
          documentInfo: {
            filename: selectedFile?.name,
            analysis_summary: analysisResult.extraction_summary,
            document_type: analysisResult.document_type
          },
          targetRowIndex
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to populate data');
      }

      setShowVerificationDialog(false);
      onAnalysisComplete?.(editedData, targetRowIndex || 0);
      onDataPopulated?.();

      toast({
        title: "Data Added Successfully",
        description: `Added extracted data to row ${(targetRowIndex || 0) + 1}`,
      });

      // Reset for next analysis
      setSelectedFile(null);
      setAnalysisResult(null);
      setAnalysisSteps([]);
      setAnalysisProgress(0);

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to save data';
      toast({
        title: "Failed to Save Data",
        description: errorMessage,
        variant: "destructive"
      });
    }
  };

  const retryAnalysis = (useVision?: boolean) => {
    setShowVerificationDialog(false);
    performAnalysis(useVision);
  };

  const resetAnalysis = () => {
    setSelectedFile(null);
    setAnalysisResult(null);
    setError(null);
    setAnalysisSteps([]);
    setAnalysisProgress(0);
    setShowVerificationDialog(false);
  };

  return (
    <>
      <Card className="w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-primary" />
            Advanced Document Analysis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* File Selection */}
          <div className="space-y-4">
            <div className="flex items-center justify-center w-full">
              <label htmlFor="document-upload" className={`flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                selectedFile 
                  ? 'border-green-500 bg-green-50 dark:bg-green-950/20' 
                  : 'border-gray-300 bg-gray-50 hover:bg-gray-100 dark:bg-gray-800 dark:border-gray-600 dark:hover:bg-gray-700'
              }`}>
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {selectedFile ? (
                    <CheckCircle className="w-8 h-8 mb-2 text-green-500" />
                  ) : (
                    <Upload className="w-8 h-8 mb-2 text-gray-400" />
                  )}
                  <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                    {selectedFile ? (
                      <span className="font-semibold text-green-600">{selectedFile.name} selected</span>
                    ) : (
                      <>
                        <span className="font-semibold">Click to upload</span> or drag and drop
                      </>
                    )}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    PNG, JPEG, GIF, WebP, BMP (MAX. 50MB)
                  </p>
                </div>
                <input 
                  id="document-upload" 
                  type="file" 
                  className="hidden" 
                  onChange={handleFileSelect}
                  accept="image/*"
                />
              </label>
            </div>

            {selectedFile && !isAnalyzing && !analysisResult && (
              <div className="flex gap-3">
                <Button
                  onClick={() => performAnalysis(false)}
                  className="flex-1"
                  disabled={!selectedFile}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Smart Analysis
                </Button>
                <Button
                  variant="outline"
                  onClick={() => performAnalysis(true)}
                  className="flex-1"
                  disabled={!selectedFile}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  Vision Analysis
                </Button>
              </div>
            )}
          </div>

          {/* Analysis Progress */}
          {isAnalyzing && (
            <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-blue-600" />
                    <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
                      Analysis in Progress
                    </span>
                  </div>
                  
                  <Progress value={analysisProgress} className="w-full" />
                  
                  <div className="space-y-2">
                    {analysisSteps.map((step) => (
                      <div key={step.id} className="flex items-center gap-2 text-sm">
                        {step.status === 'completed' && <CheckCircle className="h-4 w-4 text-green-500" />}
                        {step.status === 'in-progress' && <RefreshCw className="h-4 w-4 text-blue-500 animate-spin" />}
                        {step.status === 'error' && <AlertCircle className="h-4 w-4 text-red-500" />}
                        {step.status === 'pending' && <div className="h-4 w-4 rounded-full border-2 border-gray-300" />}
                        
                        <span className={`${step.status === 'completed' ? 'text-green-600' : step.status === 'error' ? 'text-red-600' : ''}`}>
                          {step.name}
                        </span>
                        
                        {step.message && (
                          <span className="text-xs text-muted-foreground">- {step.message}</span>
                        )}
                      </div>
                    ))}
                  </div>
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
                  onClick={() => performAnalysis()}
                  className="ml-2"
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Success State */}
          {analysisResult && !isAnalyzing && (
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
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => retryAnalysis(true)}
                    >
                      <Eye className="h-4 w-4 mr-1" />
                      Try Vision
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={resetAnalysis}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      New Analysis
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-green-700 dark:text-green-300 mt-2">
                  Extracted {Object.keys(analysisResult.extracted_data).length} fields. 
                  Click below to review and confirm the data.
                </p>
                <Button
                  onClick={() => setShowVerificationDialog(true)}
                  className="mt-3 w-full"
                >
                  <Target className="h-4 w-4 mr-2" />
                  Review & Add to Runsheet
                </Button>
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Data Verification Dialog */}
      {analysisResult && (
        <AdvancedDataVerificationDialog
          isOpen={showVerificationDialog}
          onClose={() => setShowVerificationDialog(false)}
          onConfirm={handleDataConfirmation}
          extractedData={analysisResult.extracted_data}
          confidenceScores={analysisResult.confidence_scores}
          documentType={analysisResult.document_type}
          fileName={selectedFile?.name}
          processingNotes={analysisResult.processing_notes}
          availableColumns={availableColumns}
          currentRunsheetData={currentRunsheetData}
          onRetryAnalysis={retryAnalysis}
        />
      )}
    </>
  );
};

export default ImprovedDocumentAnalysis;
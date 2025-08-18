import React, { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Upload, Brain, CheckCircle, AlertTriangle, FileText, Sparkles, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import DocumentUpload from './DocumentUpload';
import EnhancedDataVerificationDialog from './EnhancedDataVerificationDialog';

interface DocumentAnalysisWorkflowProps {
  runsheetId: string;
  availableColumns: string[];
  onDataConfirmed: (data: Record<string, string>, file: File) => void;
  onClose?: () => void;
}

type WorkflowStep = 'upload' | 'analyzing' | 'verification' | 'saving' | 'complete' | 'error';

interface AnalysisResult {
  extractedData: Record<string, string>;
  confidence: number;
  processingTime: number;
}

const DocumentAnalysisWorkflow: React.FC<DocumentAnalysisWorkflowProps> = ({
  runsheetId,
  availableColumns,
  onDataConfirmed,
  onClose
}) => {
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState<WorkflowStep>('upload');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState(false);

  const resetWorkflow = useCallback(() => {
    setCurrentStep('upload');
    setSelectedFile(null);
    setAnalysisResult(null);
    setProgress(0);
    setError('');
    setIsProcessing(false);
  }, []);

  const analyzeDocument = useCallback(async (file: File) => {
    if (!file) return;

    try {
      setCurrentStep('analyzing');
      setIsProcessing(true);
      setProgress(10);
      setError('');

      // Convert file to base64 for analysis
      const reader = new FileReader();
      const fileDataPromise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result);
        };
        reader.onerror = reject;
      });

      reader.readAsDataURL(file);
      const imageData = await fileDataPromise;
      
      setProgress(30);

      // Create analysis prompt
      const columnsList = availableColumns.join(', ');
      const prompt = `Extract the following fields from this document: ${columnsList}. 
Return the data as a JSON object where each key matches exactly one of the field names I provided, and the value is the extracted text. 
If a field is not found or is unclear, set its value to an empty string "". 
Only extract information that is clearly visible and readable.

CRITICAL: Return ONLY a valid JSON object with no additional text, explanations, or markdown formatting.`;

      console.log('🔍 Analyzing document:', file.name, 'Size:', file.size);
      
      setProgress(50);

      // Call analysis edge function
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error('Authentication required');
      }

      const startTime = Date.now();
      
      const response = await fetch(
        `https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/analyze-document`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            prompt,
            imageData,
            systemMessage: "You are a document analysis assistant. Extract information accurately and return only valid JSON. If information is not clearly visible, use empty strings."
          }),
        }
      );

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Document analysis failed');
      }

      const result = await response.json();
      const processingTime = Date.now() - startTime;
      
      setProgress(100);

      // Parse the generated text as JSON
      let extractedData: Record<string, string> = {};
      try {
        // Clean the response text to ensure it's valid JSON
        let jsonText = result.generatedText.trim();
        
        // Remove any markdown formatting
        jsonText = jsonText.replace(/```json\s*|\s*```/g, '');
        
        extractedData = JSON.parse(jsonText);
        console.log('✅ Extracted data:', extractedData);
        
        // Ensure all expected columns exist in the result
        for (const column of availableColumns) {
          if (!(column in extractedData)) {
            extractedData[column] = '';
          }
        }
      } catch (parseError) {
        console.error('Failed to parse extracted data:', parseError, result.generatedText);
        // Fallback: create empty data structure
        extractedData = availableColumns.reduce((acc, col) => {
          acc[col] = '';
          return acc;
        }, {} as Record<string, string>);
      }

      // Calculate confidence based on how many fields were extracted
      const filledFields = Object.values(extractedData).filter(value => value.trim() !== '').length;
      const confidence = Math.round((filledFields / availableColumns.length) * 100);

      const analysisResultData: AnalysisResult = {
        extractedData,
        confidence,
        processingTime
      };

      setAnalysisResult(analysisResultData);
      setCurrentStep('verification');

      toast({
        title: "Analysis complete",
        description: `Extracted data from ${file.name} (${filledFields}/${availableColumns.length} fields found)`,
      });

    } catch (error) {
      console.error('Document analysis error:', error);
      setError(error instanceof Error ? error.message : 'Failed to analyze document');
      setCurrentStep('error');
      
      toast({
        title: "Analysis failed",
        description: error instanceof Error ? error.message : "Failed to analyze document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  }, [availableColumns, toast]);

  const handleFileSelect = useCallback(async (file: File) => {
    setSelectedFile(file);
    await analyzeDocument(file);
  }, [analyzeDocument]);

  const handleDataConfirmed = useCallback(async (data: Record<string, string>) => {
    if (!selectedFile) return;

    setCurrentStep('saving');
    setIsProcessing(true);

    try {
      await onDataConfirmed(data, selectedFile);
      setCurrentStep('complete');
      
      toast({
        title: "Data added successfully",
        description: "Document data has been added to your runsheet.",
      });

      // Auto close after success
      setTimeout(() => {
        onClose?.();
      }, 2000);
      
    } catch (error) {
      console.error('Error saving data:', error);
      setError(error instanceof Error ? error.message : 'Failed to save data');
      setCurrentStep('error');
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile, onDataConfirmed, onClose, toast]);

  const handleReanalyze = useCallback(async () => {
    if (selectedFile) {
      await analyzeDocument(selectedFile);
    }
  }, [selectedFile, analyzeDocument]);

  const getStepIcon = (step: WorkflowStep) => {
    switch (step) {
      case 'upload':
        return <Upload className="h-5 w-5" />;
      case 'analyzing':
        return <Brain className="h-5 w-5 animate-pulse text-primary" />;
      case 'verification':
        return <FileText className="h-5 w-5 text-blue-600" />;
      case 'saving':
        return <RefreshCw className="h-5 w-5 animate-spin text-primary" />;
      case 'complete':
        return <CheckCircle className="h-5 w-5 text-green-600" />;
      case 'error':
        return <AlertTriangle className="h-5 w-5 text-red-600" />;
    }
  };

  const getStepTitle = (step: WorkflowStep) => {
    switch (step) {
      case 'upload':
        return 'Upload Document';
      case 'analyzing':
        return 'Analyzing Document';
      case 'verification':
        return 'Verify Extracted Data';
      case 'saving':
        return 'Saving to Runsheet';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto">
      {/* Progress Header */}
      <Card className="mb-6 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            {getStepIcon(currentStep)}
            <h2 className="text-lg font-semibold">{getStepTitle(currentStep)}</h2>
          </div>
          
          {analysisResult && (
            <Badge variant="outline" className="text-sm">
              Confidence: {analysisResult.confidence}%
            </Badge>
          )}
        </div>
        
        {isProcessing && (
          <div className="space-y-2">
            <Progress value={progress} className="w-full" />
            <p className="text-sm text-muted-foreground">
              {currentStep === 'analyzing' && 'AI is extracting data from your document...'}
              {currentStep === 'saving' && 'Saving data to runsheet...'}
            </p>
          </div>
        )}
      </Card>

      {/* Error Display */}
      {error && (
        <Alert className="mb-6 border-red-200 bg-red-50">
          <AlertTriangle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            {error}
            <Button 
              variant="outline" 
              size="sm" 
              onClick={resetWorkflow}
              className="ml-2"
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Step Content */}
      {currentStep === 'upload' && (
        <DocumentUpload
          onFileSelect={handleFileSelect}
          selectedFile={selectedFile}
          allowMultiple={false}
        />
      )}

      {currentStep === 'analyzing' && (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center space-y-4">
            <div className="relative">
              <Sparkles className="h-16 w-16 text-primary animate-pulse" />
              <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping" />
            </div>
            <div>
              <h3 className="text-xl font-semibold mb-2">AI Document Analysis</h3>
              <p className="text-muted-foreground mb-2">
                Analyzing <strong>{selectedFile?.name}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                Extracting: {availableColumns.join(', ')}
              </p>
            </div>
          </div>
        </Card>
      )}

      {currentStep === 'complete' && (
        <Card className="p-8 text-center border-green-200 bg-green-50 dark:bg-green-950/20">
          <div className="flex flex-col items-center space-y-4">
            <CheckCircle className="h-16 w-16 text-green-600" />
            <div>
              <h3 className="text-xl font-semibold text-green-800 dark:text-green-200 mb-2">
                Success!
              </h3>
              <p className="text-green-700 dark:text-green-300">
                Document data has been successfully added to your runsheet.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Data Verification Dialog */}
      <EnhancedDataVerificationDialog
        isOpen={currentStep === 'verification'}
        onClose={onClose || resetWorkflow}
        onConfirm={handleDataConfirmed}
        onReanalyze={handleReanalyze}
        extractedData={analysisResult?.extractedData || {}}
        fileName={selectedFile?.name}
        isLoading={currentStep === 'analyzing'}
        availableColumns={availableColumns}
      />
    </div>
  );
};

export default DocumentAnalysisWorkflow;
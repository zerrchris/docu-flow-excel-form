import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, CheckCircle, Eye, FileText, Zap } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { DocumentService } from '@/services/documentService';

interface AdvancedAnalysisProps {
  runsheetId: string;
  rowIndex: number;
  documentPath?: string;
  columnInstructions?: Record<string, string>;
  onAnalysisComplete?: (data: any) => void;
}

interface AnalysisResult {
  data?: any;
  metadata?: {
    extraction_method: 'file_search' | 'vision';
    processing_time: number;
    confidence_score: number;
  };
}

const AdvancedDocumentAnalysis: React.FC<AdvancedAnalysisProps> = ({
  runsheetId,
  rowIndex,
  documentPath,
  columnInstructions = {},
  onAnalysisComplete
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const handleAnalyze = async (useVision: boolean = false) => {
    if (!documentPath) {
      toast({
        title: "No document available",
        description: "Please upload a document first.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    setError(null);
    setResult(null);

    try {
      // Get document info
      const document = await DocumentService.getDocumentForRow(runsheetId, rowIndex);
      if (!document) {
        throw new Error('Document not found');
      }

      // Perform advanced analysis
      const analysisResult = await DocumentService.analyzeDocumentAdvanced(
        document.file_path,
        document.original_filename,
        document.content_type || 'application/pdf',
        columnInstructions,
        useVision
      );

      if (!analysisResult.success) {
        throw new Error(analysisResult.error || 'Analysis failed');
      }

      setResult({
        data: analysisResult.data,
        metadata: {
          extraction_method: useVision ? 'vision' : 'file_search',
          processing_time: Date.now(),
          confidence_score: analysisResult.data?.confidence_score || 0
        }
      });

      onAnalysisComplete?.(analysisResult.data);

      toast({
        title: "Analysis Complete",
        description: `Extracted ${Object.keys(analysisResult.data || {}).filter(k => 
          analysisResult.data[k] && k !== 'confidence_score' && k !== 'citations'
        ).length} fields with ${Math.round((analysisResult.data?.confidence_score || 0) * 100)}% confidence.`,
      });

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Analysis failed';
      setError(errorMessage);
      toast({
        title: "Analysis Failed",
        description: errorMessage,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'bg-green-500';
    if (score >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const getMethodIcon = (method: string) => {
    return method === 'vision' ? <Eye className="h-4 w-4" /> : <FileText className="h-4 w-4" />;
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          Advanced AI Document Analysis
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!result && !error && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose analysis method for optimal accuracy:
            </p>
            <div className="flex gap-3">
              <Button
                onClick={() => handleAnalyze(false)}
                disabled={isAnalyzing || !documentPath}
                className="flex-1"
              >
                <FileText className="h-4 w-4 mr-2" />
                {isAnalyzing ? 'Analyzing...' : 'Smart PDF Analysis'}
              </Button>
              <Button
                variant="outline"
                onClick={() => handleAnalyze(true)}
                disabled={isAnalyzing || !documentPath}
                className="flex-1"
              >
                <Eye className="h-4 w-4 mr-2" />
                {isAnalyzing ? 'Processing...' : 'Vision Analysis'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              • Smart PDF: Best for digital documents with text layers<br />
              • Vision: Best for scanned documents, stamps, and handwriting
            </p>
          </div>
        )}

        {isAnalyzing && (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <span className="ml-3 text-sm">AI is analyzing document...</span>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-3 bg-destructive/10 border border-destructive/20 rounded-md">
            <AlertCircle className="h-4 w-4 text-destructive" />
            <span className="text-sm text-destructive">{error}</span>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Analysis Summary */}
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-md">
              <div className="flex items-center gap-2">
                {getMethodIcon(result.metadata?.extraction_method || 'unknown')}
                <span className="text-sm font-medium">
                  {result.metadata?.extraction_method === 'vision' ? 'Vision Analysis' : 'Smart PDF Analysis'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${getConfidenceColor(result.data?.confidence_score || 0)}`} />
                  {Math.round((result.data?.confidence_score || 0) * 100)}% Confidence
                </Badge>
              </div>
            </div>

            {/* Extracted Data Preview */}
            <div className="space-y-2">
              <h4 className="font-medium flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                Extracted Information
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                {Object.entries(result.data || {})
                  .filter(([key, value]) => 
                    value && 
                    key !== 'confidence_score' && 
                    key !== 'citations' &&
                    typeof value === 'string'
                  )
                  .map(([key, value]) => (
                    <div key={key} className="p-2 bg-background border rounded">
                      <div className="font-medium text-muted-foreground capitalize">
                        {key.replace(/_/g, ' ')}:
                      </div>
                      <div className="mt-1 text-foreground">{value as string}</div>
                    </div>
                  ))
                }
              </div>
            </div>

            {/* Citations */}
            {result.data?.citations && result.data.citations.length > 0 && (
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Source Citations</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {result.data.citations.map((citation: any, index: number) => (
                    <div key={index} className="p-2 bg-muted/30 rounded text-xs">
                      <div className="font-medium">{citation.field} (Page {citation.page_number})</div>
                      <div className="text-muted-foreground mt-1">"{citation.quote}"</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2 pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleAnalyze(!result.metadata?.extraction_method.includes('vision'))}
                disabled={isAnalyzing}
                className="flex-1"
              >
                Try {result.metadata?.extraction_method === 'vision' ? 'PDF' : 'Vision'} Method
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setResult(null);
                  setError(null);
                }}
                className="flex-1"
              >
                New Analysis
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default AdvancedDocumentAnalysis;
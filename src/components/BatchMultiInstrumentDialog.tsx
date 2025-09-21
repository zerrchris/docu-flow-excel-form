import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertCircle, 
  CheckCircle, 
  Upload,
  Brain,
  BookOpen,
  Plus,
  FileText
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import DocumentUpload from './DocumentUpload';
import { convertPDFToImages, isPDF } from '@/utils/pdfToImage';

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

interface BatchMultiInstrumentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  runsheetId: string;
  availableColumns: string[];
  columnInstructions?: Record<string, string>;
  onBatchComplete?: () => void;
}

export const BatchMultiInstrumentDialog: React.FC<BatchMultiInstrumentDialogProps> = ({
  isOpen,
  onClose,
  runsheetId,
  availableColumns,
  columnInstructions = {},
  onBatchComplete
}) => {
  const [uploadedDocument, setUploadedDocument] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<MultiInstrumentAnalysis | null>(null);
  const [selectedInstruments, setSelectedInstruments] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showUploader, setShowUploader] = useState(true);
  const { toast } = useToast();

  const handleDocumentUploaded = async (document: any) => {
    if (document) {
      setUploadedDocument(document);
      setShowUploader(false);
      setError(null);
    }
  };

  const convertFileToBase64 = async (fileRef: string): Promise<string> => {
    try {
      // 1) If it's already a base64 data URL, return as-is
      if (typeof fileRef === 'string' && fileRef.startsWith('data:')) {
        return fileRef;
      }

      // 2) If it's a full URL, fetch it directly
      if (typeof fileRef === 'string' && /^https?:\/\//i.test(fileRef)) {
        const resp = await fetch(fileRef);
        if (!resp.ok) throw new Error('Failed to fetch document');
        const blob = await resp.blob();
        return await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }

      // 3) Otherwise, assume it's a Supabase Storage path
      const { data: signed } = await supabase.storage
        .from('documents')
        .createSignedUrl(fileRef, 300);

      let url = signed?.signedUrl;
      if (!url) {
        // Fallback to public URL if bucket/file is public
        const { data: pub } = await supabase.storage
          .from('documents')
          .getPublicUrl(fileRef);
        url = pub.publicUrl;
      }

      if (!url) throw new Error('Failed to resolve document URL');

      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to download document');
      const blob = await response.blob();
      return await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });
    } catch (error) {
      console.error('Error converting file to base64:', error);
      throw error;
    }
  };

  const analyzeDocument = async () => {
    if (!uploadedDocument) return;

    setIsAnalyzing(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      // For large PDFs, convert to optimized images first
      let documentData;
      let fileToAnalyze = uploadedDocument.file_path;

      // Check if it's a PDF and get the file for conversion
      if (isPDF({ name: uploadedDocument.original_filename, type: 'application/pdf' } as File)) {
        try {
          // Get the file from storage
          const { data: signed } = await supabase.storage
            .from('documents')
            .createSignedUrl(uploadedDocument.file_path, 300);
          
          if (signed?.signedUrl) {
            const response = await fetch(signed.signedUrl);
            const blob = await response.blob();
            const file = new File([blob], uploadedDocument.original_filename, { type: 'application/pdf' });
            
            // Convert PDF to optimized images (smaller scale for analysis)
            const pdfPages = await convertPDFToImages(file, 2); // Lower scale for analysis
            
            if (pdfPages.length > 0) {
              // Use the first page as a representative image
              const canvas = pdfPages[0].canvas;
              // Compress the image for analysis
              documentData = canvas.toDataURL('image/jpeg', 0.7);
            }
          }
        } catch (pdfError) {
          console.warn('PDF conversion failed, using original file:', pdfError);
        }
      }

      const response = await supabase.functions.invoke('analyze-multi-instrument-document', {
        body: {
          documentData,
          documentId: uploadedDocument.id,
          fileName: uploadedDocument.original_filename,
          filePath: fileToAnalyze,
          runsheetId,
          availableColumns,
          columnInstructions
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Analysis failed');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Analysis failed');
      }

      const analysisData = response.data.analysis as MultiInstrumentAnalysis;
      setAnalysis(analysisData);
      
      // Pre-select all instruments
      setSelectedInstruments(analysisData.instruments.map((_, idx) => idx));

      toast({
        title: "Analysis Complete",
        description: `Detected ${analysisData.instrumentsDetected} instruments in the document`,
      });

    } catch (error) {
      console.error('Error analyzing document:', error);
      setError(error instanceof Error ? error.message : 'Analysis failed');
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : 'Failed to analyze document',
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const toggleInstrumentSelection = (instrumentIndex: number) => {
    setSelectedInstruments(prev => {
      const selected = new Set(prev);
      if (selected.has(instrumentIndex)) {
        selected.delete(instrumentIndex);
      } else {
        selected.add(instrumentIndex);
      }
      return Array.from(selected);
    });
  };

  const createInstrumentRows = async () => {
    if (!analysis || !uploadedDocument) return;

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Authentication required');

      const selectedInstrumentData = selectedInstruments.map(idx => analysis.instruments[idx]);

      const response = await supabase.functions.invoke('create-separate-instrument-files', {
        body: {
          originalDocumentId: uploadedDocument.id,
          runsheetId,
          instruments: selectedInstrumentData
        }
      });

      if (response.error || !response.data?.success) {
        throw new Error(response.error?.message || response.data?.error || 'Failed to create instrument rows');
      }

      toast({
        title: "Instruments Created",
        description: `Successfully created ${selectedInstruments.length} instrument rows`,
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

  const handleClose = () => {
    setUploadedDocument(null);
    setAnalysis(null);
    setSelectedInstruments([]);
    setError(null);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Multi-Instrument Analysis
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="max-h-[60vh]">
          <div className="space-y-6">
            {/* Document Upload Step */}
            {showUploader && !uploadedDocument && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-primary/10 rounded-full">
                      <Upload className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Upload Multi-Instrument Document</h3>
                      <p className="text-sm text-muted-foreground mt-1">
                        Upload a single PDF document containing multiple legal instruments. The AI will analyze it to detect and create separate runsheet rows for each instrument found.
                      </p>
                    </div>
                    <div className="max-w-md mx-auto">
                      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setIsAnalyzing(true);
                              try {
                                // Upload the file
                                const formData = new FormData();
                                formData.append('file', file);
                                formData.append('runsheetId', runsheetId);
                                formData.append('rowIndex', '0');

                                const { data: { session } } = await supabase.auth.getSession();
                                const response = await supabase.functions.invoke('store-document', {
                                  body: formData
                                });

                                if (response.data?.document) {
                                  handleDocumentUploaded(response.data.document);
                                }
                              } catch (error) {
                                console.error('Upload failed:', error);
                                toast({
                                  title: "Upload Failed",
                                  description: "Failed to upload document",
                                  variant: "destructive"
                                });
                              } finally {
                                setIsAnalyzing(false);
                              }
                            }
                          }}
                          className="hidden"
                          id="pdf-upload"
                        />
                        <label htmlFor="pdf-upload" className="cursor-pointer">
                          <div className="flex flex-col items-center space-y-2">
                            <Upload className="h-8 w-8 text-gray-400" />
                            <p className="text-sm text-gray-600">
                              Click to upload PDF document
                            </p>
                            <p className="text-xs text-gray-400">
                              PDF files only
                            </p>
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Document Analysis Step */}
            {uploadedDocument && !analysis && !isAnalyzing && (
              <Card>
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-green-50 rounded-full">
                      <FileText className="h-8 w-8 text-green-600" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold">Document Uploaded</h3>
                      <p className="text-sm text-muted-foreground">
                        {uploadedDocument.original_filename}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        Ready to analyze for multiple instruments
                      </p>
                    </div>
                    <Button onClick={analyzeDocument} className="w-full">
                      <Brain className="h-4 w-4 mr-2" />
                      Analyze for Multiple Instruments
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Analysis in Progress */}
            {isAnalyzing && (
              <Card className="bg-blue-50 dark:bg-blue-950/20 border-blue-200 dark:border-blue-800">
                <CardContent className="pt-6">
                  <div className="text-center space-y-4">
                    <div className="flex items-center justify-center w-16 h-16 mx-auto bg-blue-100 rounded-full">
                      <Brain className="h-8 w-8 text-blue-600 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold text-blue-800 dark:text-blue-200">
                        Analyzing Document...
                      </h3>
                      <p className="text-sm text-blue-700 dark:text-blue-300">
                        AI is detecting multiple instruments in your document
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Error Display */}
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Analysis Results */}
            {analysis && (
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
                          {analysis.instrumentsDetected} Instruments Detected
                        </Badge>
                        <Badge variant="outline">
                          {selectedInstruments.length} Selected
                        </Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Instrument Selection */}
                <Card>
                  <CardHeader>
                    <CardTitle>Select Instruments to Create</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {analysis.instruments.map((instrument, idx) => (
                        <div
                          key={idx}
                          className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                            selectedInstruments.includes(idx)
                              ? 'border-primary bg-primary/5'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                          onClick={() => toggleInstrumentSelection(idx)}
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <h5 className="font-medium">{instrument.instrumentName}</h5>
                              <p className="text-sm text-muted-foreground">
                                {instrument.instrumentType} • Pages {instrument.pageStart}
                                {instrument.pageEnd !== instrument.pageStart && `-${instrument.pageEnd}`} • 
                                Confidence: {instrument.confidence}%
                              </p>
                              {instrument.keyIdentifiers.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-2">
                                  {instrument.keyIdentifiers.slice(0, 3).map((identifier, idxId) => (
                                    <Badge key={idxId} variant="outline" className="text-xs">
                                      {identifier}
                                    </Badge>
                                  ))}
                                  {instrument.keyIdentifiers.length > 3 && (
                                    <Badge variant="outline" className="text-xs">
                                      +{instrument.keyIdentifiers.length - 3} more
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              {selectedInstruments.includes(idx) ? (
                                <CheckCircle className="h-5 w-5 text-primary" />
                              ) : (
                                <div className="h-5 w-5 rounded-full border-2 border-gray-300" />
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </ScrollArea>

        <DialogFooter>
          <div className="flex justify-between w-full">
            <Button variant="outline" onClick={handleClose} disabled={isAnalyzing}>
              Cancel
            </Button>
            
            {analysis && (
              <Button
                onClick={createInstrumentRows}
                disabled={selectedInstruments.length === 0}
              >
                <Plus className="h-4 w-4 mr-1" />
                Create {selectedInstruments.length} Instruments
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
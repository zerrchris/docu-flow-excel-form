import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { ArrowLeft, Sparkles, Mic, MicOff, Volume2, RotateCcw, FileText, Wand2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import PDFViewer from './PDFViewer';
import { DocumentService, type DocumentRecord } from '@/services/documentService';

interface ExtractedField {
  key: string;
  value: string;
  confidence?: number;
  isEdited?: boolean;
}

interface SideBySideDocumentWorkspaceProps {
  runsheetId: string;
  rowIndex: number;
  rowData: Record<string, string>;
  columns: string[];
  columnInstructions: Record<string, string>;
  documentRecord?: DocumentRecord;
  onDataUpdate: (rowIndex: number, data: Record<string, string>) => void;
  onClose: () => void;
}

const SideBySideDocumentWorkspace: React.FC<SideBySideDocumentWorkspaceProps> = ({
  runsheetId,
  rowIndex,
  rowData: initialRowData,
  columns,
  columnInstructions,
  documentRecord,
  onDataUpdate,
  onClose
}) => {
  const { toast } = useToast();
  const [rowData, setRowData] = useState<Record<string, string>>(initialRowData);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [lastAnalyzedData, setLastAnalyzedData] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Voice functionality refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Update local row data when props change
  useEffect(() => {
    setRowData(initialRowData);
    setHasUnsavedChanges(false);
  }, [initialRowData, rowIndex]);

  // Handle voice to text
  const startListening = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'audio/webm;codecs=opus'
      });
      
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await transcribeAudio(audioBlob);
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      setIsListening(true);
      
      toast({
        title: "Listening...",
        description: "Speak your input. Click the mic again to stop.",
      });
    } catch (error) {
      console.error('Error starting voice recording:', error);
      toast({
        title: "Error",
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopListening = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsListening(false);
    }
  };

  const transcribeAudio = async (audioBlob: Blob) => {
    try {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        const { data, error } = await supabase.functions.invoke('transcribe-audio', {
          body: { audio: base64Audio }
        });

        if (error) throw error;

        if (data?.text) {
          // Use voice input to analyze and extract data
          await analyzeVoiceInput(data.text);
        }
      };
      reader.readAsDataURL(audioBlob);
    } catch (error) {
      console.error('Error transcribing audio:', error);
      toast({
        title: "Error",
        description: "Failed to transcribe audio. Please try again.",
        variant: "destructive",
      });
    }
  };

  const analyzeVoiceInput = async (voiceText: string) => {
    try {
      setIsAnalyzing(true);
      
      const { data, error } = await supabase.functions.invoke('analyze-voice-text', {
        body: {
          voiceText,
          currentData: rowData,
          columnInstructions,
          availableFields: columns
        }
      });

      if (error) throw error;

      if (data?.extractedData) {
        const updatedRowData = { ...rowData, ...data.extractedData };
        setRowData(updatedRowData);
        setHasUnsavedChanges(true);
        
        toast({
          title: "Voice input processed",
          description: `Updated ${Object.keys(data.extractedData).length} fields from voice input.`,
        });
      }
    } catch (error) {
      console.error('Error analyzing voice input:', error);
      toast({
        title: "Error",
        description: "Failed to process voice input. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleAnalyzeDocument = async () => {
    if (!documentRecord) {
      toast({
        title: "Error",
        description: "No document available to analyze.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAnalyzing(true);
      
      const result = await DocumentService.analyzeDocumentAdvanced(
        documentRecord.file_path,
        documentRecord.stored_filename,
        documentRecord.content_type || 'application/pdf',
        columnInstructions,
        true // Use vision
      );

      if (result.success && result.data) {
        const extractedData = result.data;
        const updatedRowData = { ...rowData };
        
        // Update fields with extracted data
        Object.keys(extractedData).forEach(key => {
          if (columns.includes(key) && extractedData[key]) {
            updatedRowData[key] = extractedData[key];
          }
        });

        setRowData(updatedRowData);
        setLastAnalyzedData(extractedData);
        setHasUnsavedChanges(true);
        
        // Update the parent component with the new data
        onDataUpdate(rowIndex, updatedRowData);
        
        toast({
          title: "Document analyzed",
          description: `Extracted data from ${documentRecord.stored_filename}`,
        });
      } else {
        throw new Error(result.error || 'Analysis failed');
      }
    } catch (error) {
      console.error('Error analyzing document:', error);
      toast({
        title: "Error",
        description: "Failed to analyze document. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyzeField = async (fieldName: string) => {
    if (!documentRecord) {
      toast({
        title: "Error",
        description: "No document available to analyze.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAnalyzing(true);
      
      const { data, error } = await supabase.functions.invoke('re-extract-field', {
        body: {
          fileUrl: DocumentService.getDocumentUrl(documentRecord.file_path),
          fileName: documentRecord.stored_filename,
          contentType: documentRecord.content_type || 'application/pdf',
          fieldName,
          fieldInstruction: columnInstructions[fieldName] || `Extract the ${fieldName} from this document`,
          currentValue: rowData[fieldName] || ''
        }
      });

      if (error) throw error;

      if (data?.extractedValue) {
        const updatedRowData = { ...rowData, [fieldName]: data.extractedValue };
        setRowData(updatedRowData);
        setHasUnsavedChanges(true);
        
        toast({
          title: "Field re-extracted",
          description: `Updated ${fieldName} with new analysis.`,
        });
      }
    } catch (error) {
      console.error('Error re-analyzing field:', error);
      toast({
        title: "Error",
        description: `Failed to re-analyze ${fieldName}. Please try again.`,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSmartRename = async () => {
    if (!documentRecord) {
      toast({
        title: "Error",
        description: "No document available to rename.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsAnalyzing(true);
      
      // Generate smart filename based on extracted data
      const { data, error } = await supabase.functions.invoke('generate-text', {
        body: {
          prompt: `Generate a descriptive filename for a document based on this extracted data:
${Object.entries(rowData)
  .filter(([_, value]) => value && value.trim() !== '')
  .map(([key, value]) => `${key}: ${value}`)
  .join('\n')}

Rules:
- Use only alphanumeric characters, hyphens, and underscores
- Keep it under 50 characters
- Make it descriptive and professional
- Include the most important identifying information
- Do not include file extension

Return only the filename, nothing else.`,
          maxTokens: 100
        }
      });

      if (error) throw error;

      if (data?.text) {
        const suggestedName = data.text.trim().replace(/[^a-zA-Z0-9\-_]/g, '_');
        const extension = documentRecord.stored_filename.split('.').pop();
        const newFilename = `${suggestedName}.${extension}`;
        
        // Update the document record with new name
        const { error: updateError } = await supabase
          .from('documents')
          .update({ stored_filename: newFilename })
          .eq('id', documentRecord.id);

        if (updateError) throw updateError;

        toast({
          title: "Document renamed",
          description: `Renamed to: ${newFilename}`,
        });
      }
    } catch (error) {
      console.error('Error with smart rename:', error);
      toast({
        title: "Error",
        description: "Failed to generate smart filename. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    const updatedRowData = { ...rowData, [fieldName]: value };
    setRowData(updatedRowData);
    setHasUnsavedChanges(true);
  };

  const handleSaveAndReturn = async () => {
    try {
      // Update the parent component with the new data
      onDataUpdate(rowIndex, rowData);
      
      toast({
        title: "Changes saved",
        description: "Row data has been updated.",
      });
      
      onClose();
    } catch (error) {
      console.error('Error saving changes:', error);
      toast({
        title: "Error",
        description: "Failed to save changes. Please try again.",
        variant: "destructive",
      });
    }
  };

  const speakText = async (text: string) => {
    if ('speechSynthesis' in window) {
      try {
        setIsSpeaking(true);
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.onend = () => setIsSpeaking(false);
        speechSynthesis.speak(utterance);
      } catch (error) {
        console.error('Error with text-to-speech:', error);
        setIsSpeaking(false);
      }
    }
  };

  const getConfidenceBadge = (confidence?: number) => {
    if (confidence === undefined) return null;
    
    const getVariant = (conf: number) => {
      if (conf >= 0.8) return "default";
      if (conf >= 0.6) return "secondary";
      return "destructive";
    };

    return (
      <Badge variant={getVariant(confidence)} className="ml-2 text-xs">
        {Math.round(confidence * 100)}%
      </Badge>
    );
  };

  return (
    <div className="fixed inset-0 bg-background z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b bg-background">
        <div className="flex items-center gap-4">
          <Button
            variant="outline"
            onClick={onClose}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Runsheet
          </Button>
          <div>
            <h1 className="text-xl font-semibold">
              Row {rowIndex + 1} - Doc Processor
            </h1>
            {documentRecord && (
              <p className="text-sm text-muted-foreground mt-1">
                {documentRecord.stored_filename}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasUnsavedChanges && (
            <Badge variant="outline" className="text-amber-600 border-amber-600">
              Unsaved Changes
            </Badge>
          )}
        </div>
      </div>

      {/* Main Content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Left Panel - Row Data */}
        <ResizablePanel defaultSize={40} minSize={25} maxSize={75}>
          <div className="h-full flex flex-col">
            <div className="p-4 border-b bg-muted/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Row Data</h3>
                <div className="flex items-center gap-2">
                  {/* Analyze Document */}
                  {documentRecord && (
                     <Button
                       onClick={handleAnalyzeDocument}
                       disabled={isAnalyzing}
                       className="flex items-center gap-2"
                       size="sm"
                     >
                       <Sparkles className="w-4 h-4" />
                       {isAnalyzing ? "Analyzing..." : "Analyze Document"}
                     </Button>
                  )}
                   
                   {/* Voice Input */}
                   <Button
                     variant={isListening ? "destructive" : "outline"}
                     size="sm"
                     onClick={isListening ? stopListening : startListening}
                     disabled={isAnalyzing}
                     className="flex items-center gap-2"
                   >
                     {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                     {isListening ? "Stop" : "Voice"}
                   </Button>
                </div>
              </div>
            </div>

            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4">
                {columns.map((columnName) => {
                  const value = rowData[columnName] || '';
                  const instruction = columnInstructions[columnName];
                  const wasExtracted = lastAnalyzedData[columnName];
                  
                  return (
                    <div key={columnName} className="space-y-2">
                       <div className="flex items-center justify-between">
                         <Label className="text-sm font-medium flex items-center">
                           {columnName}
                           {wasExtracted && getConfidenceBadge(0.85)}
                         </Label>
                        <div className="flex items-center gap-2">
                          {/* Document File Name specific field with smart rename */}
                          {columnName === 'Document File Name' && documentRecord && (
                            <Button
                              onClick={handleSmartRename}
                              disabled={isAnalyzing}
                              variant="ghost"
                              size="sm"
                              className="h-6 w-6 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                              title="Smart rename using file naming preferences"
                            >
                              <Wand2 className="w-3 h-3" />
                            </Button>
                          )}
                          
                          {/* Re-analyze field button */}
                          {documentRecord && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReanalyzeField(columnName)}
                              disabled={isAnalyzing}
                              className="h-6 w-6 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400"
                              title={`Re-analyze ${columnName}`}
                            >
                              <Sparkles className="w-3 h-3" />
                            </Button>
                          )}
                           {value && (
                             <Button
                               variant="ghost"
                               size="sm"
                               onClick={() => speakText(value)}
                               disabled={isSpeaking}
                               className="h-6 w-6 p-0"
                               title={`Read ${columnName} aloud`}
                             >
                               <Volume2 className="w-3 h-3" />
                             </Button>
                           )}
                         </div>
                       </div>
                      
                      {instruction && (
                        <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
                          {instruction}
                        </p>
                      )}
                      
                      {value.length > 100 ? (
                        <Textarea
                          value={value}
                          onChange={(e) => handleFieldChange(columnName, e.target.value)}
                          className="min-h-[80px] resize-vertical"
                          placeholder={`Enter ${columnName.toLowerCase()}...`}
                        />
                      ) : (
                        <Input
                          value={value}
                          onChange={(e) => handleFieldChange(columnName, e.target.value)}
                          placeholder={`Enter ${columnName.toLowerCase()}...`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Right Panel - Document Viewer */}
        <ResizablePanel defaultSize={60} minSize={25} maxSize={75}>
          <div className="h-full flex flex-col">
            <div className="p-4 border-b bg-muted/50">
              <h3 className="text-lg font-semibold">Document</h3>
              {documentRecord && (
                <p className="text-sm text-muted-foreground mt-1">
                  {documentRecord.stored_filename}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-hidden">
              {documentRecord ? (
                <div className="h-full w-full">
                  {documentRecord.content_type?.includes('pdf') ? (
                    <PDFViewer 
                      file={null}
                      previewUrl={DocumentService.getDocumentUrl(documentRecord.file_path)}
                    />
                  ) : (
                    <div className="h-full w-full overflow-auto bg-muted">
                      <img 
                        src={DocumentService.getDocumentUrl(documentRecord.file_path)}
                        alt={documentRecord.stored_filename}
                        className="w-full h-auto object-contain cursor-zoom-in"
                        style={{ minHeight: '100%' }}
                        onClick={(e) => {
                          const img = e.target as HTMLImageElement;
                          if (img.style.transform === 'scale(1.5)') {
                            img.style.transform = 'scale(1)';
                            img.style.cursor = 'zoom-in';
                          } else {
                            img.style.transform = 'scale(1.5)';
                            img.style.cursor = 'zoom-out';
                          }
                        }}
                      />
                    </div>
                  )}
                </div>
              ) : (
                <Card className="h-full flex items-center justify-center m-4">
                  <CardContent className="text-center">
                    <p className="text-muted-foreground">
                      No document linked to this row.
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">
                      Link a document in the runsheet to view it here.
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
};

export default SideBySideDocumentWorkspace;
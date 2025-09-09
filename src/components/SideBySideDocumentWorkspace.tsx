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
import { ArrowLeft, Sparkles, RotateCcw, FileText, Wand2, AlertTriangle, Settings, Edit3, ZoomIn, ZoomOut, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import PDFViewerWithFallback from './PDFViewerWithFallback';
import ReExtractDialog from './ReExtractDialog';
import ColumnPreferencesDialog from './ColumnPreferencesDialog';
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
  documentRecord: providedDocumentRecord,
  onDataUpdate,
  onClose
}) => {
  const { toast } = useToast();
  const [rowData, setRowData] = useState<Record<string, string>>(initialRowData);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [documentRecord, setDocumentRecord] = useState<DocumentRecord | undefined>(providedDocumentRecord);
  const [isLoadingDocument, setIsLoadingDocument] = useState(false);
  
  const [lastAnalyzedData, setLastAnalyzedData] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showAnalyzeWarning, setShowAnalyzeWarning] = useState(false);
  
  // Re-extract dialog state
  const [reExtractDialog, setReExtractDialog] = useState<{
    isOpen: boolean;
    fieldName: string;
    currentValue: string;
  }>({
    isOpen: false,
    fieldName: '',
    currentValue: ''
  });
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [showColumnPreferences, setShowColumnPreferences] = useState(false);
  
  // Individual field instruction editing
  const [fieldInstructionDialog, setFieldInstructionDialog] = useState<{
    isOpen: boolean;
    fieldName: string;
    currentInstruction: string;
  }>({
    isOpen: false,
    fieldName: '',
    currentInstruction: ''
  });

  // Load document if not provided
  useEffect(() => {
    if (!providedDocumentRecord && runsheetId && rowIndex !== undefined) {
      setIsLoadingDocument(true);
      DocumentService.getDocumentForRow(runsheetId, rowIndex)
        .then(document => {
          setDocumentRecord(document || undefined);
          setIsLoadingDocument(false);
        })
        .catch(error => {
          console.error('Error loading document:', error);
          setIsLoadingDocument(false);
        });
    } else {
      setDocumentRecord(providedDocumentRecord);
    }
  }, [providedDocumentRecord, runsheetId, rowIndex]);

  // Update local row data when props change
  useEffect(() => {
    setRowData(initialRowData);
    setHasUnsavedChanges(false);
  }, [initialRowData, rowIndex]);

  const handleAnalyzeDocument = async (forceOverwrite = false) => {
    console.log('🔍 SIDE-BY-SIDE: handleAnalyzeDocument called');
    console.log('🔍 SIDE-BY-SIDE: documentRecord:', documentRecord);
    
    if (!documentRecord) {
      console.error('🔍 SIDE-BY-SIDE: No documentRecord available');
      toast({
        title: "Error",
        description: "No document available to analyze.",
        variant: "destructive",
      });
      return;
    }

    // Check for existing data (same logic as expanded workspace)
    if (!forceOverwrite) {
      const hasExisting = columns.some((col) => ((rowData[col] || '').toString().trim() !== ''));
      if (hasExisting) {
        console.log('🔍 SIDE-BY-SIDE: Has existing data, showing warning');
        setShowAnalyzeWarning(true);
        return;
      }
    }

    try {
      setIsAnalyzing(true);
      console.log('🔍 Starting document analysis for side-by-side workspace, row:', rowIndex);
      
      // Get extraction preferences (same as expanded workspace)
      const { ExtractionPreferencesService } = await import('@/services/extractionPreferences');
      const extractionPrefs = await ExtractionPreferencesService.getDefaultPreferences();
      const extractionFields = extractionPrefs?.columns?.map(col => `${col}: ${extractionPrefs.column_instructions?.[col] || 'Extract this field'}`).join('\n') || 
        columns.map(col => `${col}: Extract this field`).join('\n');

      const documentUrl = await DocumentService.getDocumentUrl(documentRecord.file_path);
      const isPdf = documentRecord.content_type === 'application/pdf' || documentRecord.stored_filename.toLowerCase().endsWith('.pdf');
      
      let analysisResult;
      
      if (isPdf) {
        console.log('🔧 PDF detected, using Claude for PDF analysis');
        
        // For PDFs, use Claude function which handles PDFs natively
        const { data, error } = await supabase.functions.invoke('analyze-document-claude', {
          body: {
            fileUrl: documentUrl,
            fileName: documentRecord.stored_filename,
            contentType: 'application/pdf',
            prompt: `Extract information from this document for the following fields and return as valid JSON:\n${extractionFields}\n\nReturn only a JSON object with field names as keys and extracted values as values. Do not include any markdown, explanations, or additional text.`
          }
        });

        if (error) {
          throw new Error(error.message || 'Failed to analyze document with Claude');
        }

        analysisResult = data;
      } else {
        console.log('🔧 Image detected, using OpenAI Vision for analysis');
        
        // For images, use the existing OpenAI approach
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

      console.log('📡 Analysis function response (side-by-side):', { data: analysisResult });

      if (!analysisResult) {
        toast({
          title: "Analysis failed",
          description: "Could not analyze the document",
          variant: "destructive"
        });
        return;
      }

      if (analysisResult?.generatedText) {
        console.log('✅ Analysis successful (side-by-side), raw response:', analysisResult.generatedText);
        
        // Parse the JSON response from AI (same as expanded workspace)
        let extractedData = {};
        try {
          // Try to parse as JSON first
          extractedData = JSON.parse(analysisResult.generatedText);
          console.log('✅ Parsed extracted data (side-by-side):', extractedData);
        } catch (e) {
          console.warn('⚠️ Failed to parse as JSON, trying to extract JSON from text...');
          // Try to extract JSON from the text
          const jsonMatch = analysisResult.generatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              extractedData = JSON.parse(jsonMatch[0]);
              console.log('✅ Extracted JSON from text (side-by-side):', extractedData);
            } catch (e2) {
              console.error('❌ Could not parse extracted JSON (side-by-side):', e2);
              toast({
                title: "Analysis completed with errors",
                description: "The document was analyzed but the data format was unexpected. Please check the results.",
                variant: "destructive"
              });
              return;
            }
          } else {
            console.error('❌ No JSON found in response (side-by-side)');
            toast({
              title: "Analysis failed",
              description: "Could not extract structured data from the document",
              variant: "destructive"
            });
            return;
          }
        }

        // Update fields with extracted data (same as expanded workspace logic)
        const updatedRowData = { ...rowData };
        Object.keys(extractedData).forEach(key => {
          if (columns.includes(key) && extractedData[key]) {
            updatedRowData[key] = extractedData[key];
          }
        });

        setRowData(updatedRowData);
        setLastAnalyzedData(extractedData);
        setHasUnsavedChanges(false); // Analysis counts as saved since we're syncing immediately
        
        // Immediately sync changes back to parent component
        onDataUpdate(rowIndex, updatedRowData);
        
        toast({
          title: "Document analyzed",
          description: `Extracted data from ${documentRecord.stored_filename}`,
        });
      } else {
        toast({
          title: "Analysis failed",
          description: "No data was extracted from the document",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('🔍 SIDE-BY-SIDE: Error analyzing document:', error);
      console.error('🔍 SIDE-BY-SIDE: Error stack:', error.stack);
      toast({
        title: "Error",
        description: `Failed to analyze document: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleReanalyzeField = async (fieldName: string) => {
    const currentValue = rowData[fieldName] || '';
    setReExtractDialog({
      isOpen: true,
      fieldName,
      currentValue
    });
  };

  const handleReExtractWithNotes = async (notes: string) => {
    console.log('🔍 SIDE-BY-SIDE RE-EXTRACT: Starting re-extraction');
    console.log('🔍 SIDE-BY-SIDE RE-EXTRACT: documentRecord:', documentRecord);
    console.log('🔍 SIDE-BY-SIDE RE-EXTRACT: fieldName:', reExtractDialog.fieldName);
    console.log('🔍 SIDE-BY-SIDE RE-EXTRACT: notes:', notes);
    
    if (!documentRecord) {
      console.error('🔍 SIDE-BY-SIDE RE-EXTRACT: No documentRecord available');
      toast({
        title: "Error",
        description: "No document available to analyze.",
        variant: "destructive",
      });
      return;
    }
    
    try {
      setIsReExtracting(true);
      console.log('🔧 SideBySideWorkspace: Starting re-extraction for field:', reExtractDialog.fieldName);

      const documentUrl = await DocumentService.getDocumentUrl(documentRecord.file_path);
      let imageData: string;
      
      // Convert the document URL to base64 for analysis
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      imageData = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      console.log('🔍 SIDE-BY-SIDE RE-EXTRACT: Calling re-extract-field function');
      const { data, error } = await supabase.functions.invoke('re-extract-field', {
        body: {
          imageData,
          fileName: documentRecord.stored_filename,
          fieldName: reExtractDialog.fieldName,
          fieldInstructions: columnInstructions[reExtractDialog.fieldName] || `Extract the ${reExtractDialog.fieldName} field accurately`,
          userNotes: notes,
          currentValue: reExtractDialog.currentValue
        }
      });

      console.log('🔍 SIDE-BY-SIDE RE-EXTRACT: Function response:', { data, error });

      if (error) {
        console.error('🔍 SIDE-BY-SIDE RE-EXTRACT: Error from function:', error);
        throw error;
      }

      if (data?.extractedValue) {
        // Update the specific field with the re-extracted value
        const updatedRowData = { ...rowData, [reExtractDialog.fieldName]: data.extractedValue };
        setRowData(updatedRowData);
        setHasUnsavedChanges(false);
        
        // Immediately sync changes back to parent component
        onDataUpdate(rowIndex, updatedRowData);
        
        toast({
          title: "Field re-extracted",
          description: `Successfully re-extracted "${reExtractDialog.fieldName}" with your feedback.`,
        });

        // Close the dialog
        setReExtractDialog(prev => ({ ...prev, isOpen: false }));
      }
    } catch (error) {
      console.error('🔍 SIDE-BY-SIDE RE-EXTRACT: Catch block error:', error);
      console.error('🔍 SIDE-BY-SIDE RE-EXTRACT: Error message:', error.message);
      console.error('🔍 SIDE-BY-SIDE RE-EXTRACT: Error stack:', error.stack);
      toast({
        title: "Error",
        description: `Failed to re-analyze ${reExtractDialog.fieldName}: ${error.message}`,
        variant: "destructive",
      });
    } finally {
      setIsReExtracting(false);
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
    // Immediately sync changes back to parent component
    onDataUpdate(rowIndex, updatedRowData);
  };

  const handleSaveAndReturn = async () => {
    try {
      // Update the parent component with the new data
      onDataUpdate(rowIndex, rowData);
      
      toast({
        title: "Changes saved",
        description: "Row data has been updated.",
      });
      
      // Close the workspace (parent component will handle active runsheet)
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnPreferences(true)}
            className="flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Edit Instructions
          </Button>
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
                       onClick={() => {
                         const hasExisting = columns.some((col) => ((rowData[col] || '').toString().trim() !== ''));
                         if (hasExisting) {
                           setShowAnalyzeWarning(true);
                         } else {
                           handleAnalyzeDocument();
                         }
                       }}
                       disabled={isAnalyzing}
                       className="flex items-center gap-2"
                       size="sm"
                     >
                       <Sparkles className="w-4 h-4" />
                       {isAnalyzing ? "Analyzing..." : "Analyze Document"}
                     </Button>
                   )}
                 </div>
               </div>
             </div>

            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4 min-w-[400px]">
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
                           
                            {/* Edit field instruction button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setFieldInstructionDialog({
                                isOpen: true,
                                fieldName: columnName,
                                currentInstruction: columnInstructions[columnName] || ''
                              })}
                              className="h-6 w-6 p-0 hover:bg-blue-100 dark:hover:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                              title={`Edit instructions for ${columnName}`}
                            >
                              <Edit3 className="w-3 h-3" />
                            </Button>
                            
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
                          </div>
                        </div>
                       
                       {/* Removed extraction instruction display - cleaner form */}
                      
                       {value.length > 100 ? (
                        <Textarea
                          value={value}
                          onChange={(e) => handleFieldChange(columnName, e.target.value)}
                          className="min-h-[160px] resize-vertical"
                          placeholder={`Enter ${columnName.toLowerCase()}...`}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              const currentIndex = columns.findIndex(col => col === columnName);
                              const nextIndex = currentIndex + 1;
                              if (nextIndex < columns.length) {
                                const nextField = document.querySelector(`input[placeholder*="${columns[nextIndex].toLowerCase()}"], textarea[placeholder*="${columns[nextIndex].toLowerCase()}"]`) as HTMLElement;
                                nextField?.focus();
                              }
                            }
                            // Allow Enter to create new lines within the textarea
                          }}
                        />
                       ) : (
                        <Input
                          value={value}
                          onChange={(e) => handleFieldChange(columnName, e.target.value)}
                          placeholder={`Enter ${columnName.toLowerCase()}...`}
                          onKeyDown={(e) => {
                            if (e.key === 'Tab') {
                              e.preventDefault();
                              const currentIndex = columns.findIndex(col => col === columnName);
                              const nextIndex = currentIndex + 1;
                              if (nextIndex < columns.length) {
                                const nextField = document.querySelector(`input[placeholder*="${columns[nextIndex].toLowerCase()}"], textarea[placeholder*="${columns[nextIndex].toLowerCase()}"]`) as HTMLElement;
                                nextField?.focus();
                              }
                            }
                            // For Input fields, Enter still moves to next field since they're single-line
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              const currentIndex = columns.findIndex(col => col === columnName);
                              const nextIndex = currentIndex + 1;
                              if (nextIndex < columns.length) {
                                const nextField = document.querySelector(`input[placeholder*="${columns[nextIndex].toLowerCase()}"], textarea[placeholder*="${columns[nextIndex].toLowerCase()}"]`) as HTMLElement;
                                nextField?.focus();
                              }
                            }
                          }}
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
              {isLoadingDocument ? (
                <Card className="h-full flex items-center justify-center m-4">
                  <CardContent className="text-center">
                    <p className="text-muted-foreground">
                      Loading document...
                    </p>
                  </CardContent>
                </Card>
              ) : documentRecord ? (
                <div className="h-full w-full">
                  {documentRecord.content_type?.includes('pdf') ? (
                    <PDFViewerWithFallback 
                      file={null}
                      previewUrl={DocumentService.getDocumentUrlSync(documentRecord.file_path)}
                    />
                  ) : (
                    <div className="h-full w-full overflow-auto bg-muted relative group">
                      <img 
                        src={DocumentService.getDocumentUrlSync(documentRecord.file_path)}
                        alt={documentRecord.stored_filename}
                        className="w-full h-auto object-contain"
                        style={{ 
                          minHeight: '100%',
                          transformOrigin: 'center'
                        }}
                      />
                      
                      {/* Document toolbar overlay on hover */}
                      <div 
                        className="absolute bottom-2 left-1/2 transform -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"
                      >
                        <div className="bg-black/80 backdrop-blur-sm text-white rounded-lg px-2 py-1 flex items-center space-x-1 pointer-events-auto shadow-lg">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 h-7 w-7 p-0"
                            onClick={() => {
                              const img = document.querySelector('img[alt="' + documentRecord.stored_filename + '"]') as HTMLImageElement;
                              if (img) {
                                const currentScale = img.style.transform.includes('scale') ? 
                                  parseFloat(img.style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1') : 1;
                                const newScale = Math.max(0.5, currentScale - 0.25);
                                img.style.transform = `scale(${newScale})`;
                              }
                            }}
                          >
                            <ZoomOut className="h-3 w-3" />
                          </Button>
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 h-7 w-7 p-0"
                            onClick={() => {
                              const img = document.querySelector('img[alt="' + documentRecord.stored_filename + '"]') as HTMLImageElement;
                              if (img) {
                                const currentScale = img.style.transform.includes('scale') ? 
                                  parseFloat(img.style.transform.match(/scale\(([^)]+)\)/)?.[1] || '1') : 1;
                                const newScale = Math.min(3, currentScale + 0.25);
                                img.style.transform = `scale(${newScale})`;
                              }
                            }}
                          >
                            <ZoomIn className="h-3 w-3" />
                          </Button>
                          
                          <div className="w-px h-4 bg-white/30 mx-1" />
                          
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-white hover:bg-white/20 h-7 w-7 p-0"
                            onClick={() => {
                              const img = document.querySelector('img[alt="' + documentRecord.stored_filename + '"]') as HTMLImageElement;
                              if (img) {
                                img.style.transform = 'scale(1)';
                              }
                            }}
                            title="Reset zoom"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
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

      {/* Analyze Document Warning Dialog */}
      <AlertDialog open={showAnalyzeWarning} onOpenChange={setShowAnalyzeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-500" />
              Replace Existing Data?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This row already contains data. Analyzing the document will replace the existing information with newly extracted data.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowAnalyzeWarning(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { 
              setShowAnalyzeWarning(false); 
              handleAnalyzeDocument(true); // Force overwrite
            }}>
              Replace Data
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Re-extract Dialog */}
      <ReExtractDialog
        isOpen={reExtractDialog.isOpen}
        onClose={() => setReExtractDialog(prev => ({ ...prev, isOpen: false }))}
        fieldName={reExtractDialog.fieldName}
        currentValue={reExtractDialog.currentValue}
        onReExtract={handleReExtractWithNotes}
        isLoading={isReExtracting}
      />
      
      {/* Column Preferences Dialog */}
      <ColumnPreferencesDialog
        open={showColumnPreferences}
        onOpenChange={setShowColumnPreferences}
        onPreferencesSaved={(newColumns, newInstructions) => {
          // Update column instructions locally
          console.log('Updated extraction instructions:', newInstructions);
          toast({
            title: "Instructions updated",
            description: "Extraction instructions have been saved.",
          });
        }}
      />

      {/* Individual Field Instruction Dialog */}
      <AlertDialog open={fieldInstructionDialog.isOpen} onOpenChange={(open) => 
        setFieldInstructionDialog(prev => ({ ...prev, isOpen: open }))
      }>
        <AlertDialogContent className="max-w-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>Edit Extraction Instructions</AlertDialogTitle>
            <AlertDialogDescription>
              Update the AI instructions for extracting "{fieldInstructionDialog.fieldName}" from documents.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="instruction">Instruction for {fieldInstructionDialog.fieldName}</Label>
              <Textarea
                id="instruction"
                value={fieldInstructionDialog.currentInstruction}
                onChange={(e) => setFieldInstructionDialog(prev => ({
                  ...prev,
                  currentInstruction: e.target.value
                }))}
                placeholder={`Enter instructions for extracting ${fieldInstructionDialog.fieldName}...`}
                className="min-h-[120px]"
              />
              <p className="text-sm text-muted-foreground">
                Provide specific instructions to help the AI extract this field accurately from documents.
              </p>
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={async () => {
              try {
                // Save the individual field instruction
                const { ExtractionPreferencesService } = await import('@/services/extractionPreferences');
                const prefs = await ExtractionPreferencesService.getDefaultPreferences();
                
                if (prefs) {
                  const currentInstructions = (prefs.column_instructions as Record<string, string>) || {};
                  const updatedInstructions = {
                    ...currentInstructions,
                    [fieldInstructionDialog.fieldName]: fieldInstructionDialog.currentInstruction
                  };
                  
                  await ExtractionPreferencesService.saveDefaultPreferences(
                    prefs.columns || [],
                    updatedInstructions
                  );
                }

                toast({
                  title: "Instruction saved",
                  description: `Updated instructions for ${fieldInstructionDialog.fieldName}`,
                });
                
                setFieldInstructionDialog(prev => ({ ...prev, isOpen: false }));
              } catch (error) {
                console.error('Error saving field instruction:', error);
                toast({
                  title: "Error",
                  description: "Failed to save instruction. Please try again.",
                  variant: "destructive",
                });
              }
            }}>
              Save Instructions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SideBySideDocumentWorkspace;
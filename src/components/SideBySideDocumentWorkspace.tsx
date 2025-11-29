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
import { ArrowLeft, Sparkles, RotateCcw, FileText, Wand2, AlertTriangle, Settings, Edit3 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

import ReExtractDialog from './ReExtractDialog';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import ColumnPreferencesDialog from './ColumnPreferencesDialog';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import InstrumentSelectionDialog from './InstrumentSelectionDialog';

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
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentError, setDocumentError] = useState<string | null>(null);
  
  const [lastAnalyzedData, setLastAnalyzedData] = useState<Record<string, string>>({});
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showAnalyzeWarning, setShowAnalyzeWarning] = useState(false);
  const [imageFitToWidth, setImageFitToWidth] = useState(true); // Default to fit-to-width for images
  const [imageZoom, setImageZoom] = useState(1);
  
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
  
  // Multi-instrument detection state with persistence across page refreshes
  const sessionStorageKey = `instrument_selection_sidebyside_${runsheetId}_${rowIndex}`;
  
  const [showInstrumentSelectionDialog, setShowInstrumentSelectionDialog] = useState(() => {
    try {
      const saved = sessionStorage.getItem(sessionStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return !!parsed.instruments && parsed.instruments.length > 0;
      }
    } catch (e) {
      console.error('Failed to restore instrument selection state:', e);
    }
    return false;
  });
  
  const [detectedInstruments, setDetectedInstruments] = useState<any[]>(() => {
    try {
      const saved = sessionStorage.getItem(sessionStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.instruments || [];
      }
    } catch (e) {
      console.error('Failed to restore instruments:', e);
    }
    return [];
  });
  
  const [pendingInstrumentAnalysis, setPendingInstrumentAnalysis] = useState<{
    imageData: string;
    extractionFields: string;
    fillEmptyOnly: boolean;
    forceOverwrite: boolean;
  } | null>(() => {
    try {
      const saved = sessionStorage.getItem(sessionStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return parsed.pendingAnalysis || null;
      }
    } catch (e) {
      console.error('Failed to restore pending analysis:', e);
    }
    return null;
  });
  
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

  // Visual instrument selection state
  const [visualSelectionMode, setVisualSelectionMode] = useState(false);
  const [selectedStartPoint, setSelectedStartPoint] = useState<{ y: number } | null>(null);
  const documentScrollContainerRef = useRef<HTMLDivElement>(null);

  // Load document if not provided
  useEffect(() => {
    if (!providedDocumentRecord && runsheetId && rowIndex !== undefined) {
      setIsLoadingDocument(true);
      setDocumentError(null);
      DocumentService.getDocumentForRow(runsheetId, rowIndex)
        .then(document => {
          setDocumentRecord(document || undefined);
          setIsLoadingDocument(false);
        })
        .catch(error => {
          console.error('Error loading document:', error);
          setDocumentError('Failed to load document');
          setIsLoadingDocument(false);
        });
    } else {
      setDocumentRecord(providedDocumentRecord);
    }
  }, [providedDocumentRecord, runsheetId, rowIndex]);

  // Load document URL when document record changes
  useEffect(() => {
    const loadDocumentUrl = async () => {
      if (!documentRecord) {
        setDocumentUrl(null);
        return;
      }

      try {
        console.log('🔍 SideBySide: Loading document URL for:', documentRecord.file_path);
        setDocumentError(null);
        const url = await DocumentService.getDocumentUrl(documentRecord.file_path);
        console.log('✅ SideBySide: Document URL loaded:', url);
        setDocumentUrl(url);
      } catch (error) {
        console.error('❌ SideBySide: Error loading document URL:', error);
        setDocumentError('Failed to load document URL');
        setDocumentUrl(null);
      }
    };

    loadDocumentUrl();
  }, [documentRecord]);

  // Restore instrument selection dialog after page refresh
  useEffect(() => {
    if (showInstrumentSelectionDialog && detectedInstruments.length > 0) {
      console.log('🔄 SideBySide: Restored instrument selection dialog after page refresh');
      toast({
        title: "Session Restored",
        description: "Your instrument selection dialog has been restored. Please select an instrument to continue.",
        variant: "default"
      });
    }
  }, []); // Only run on mount

  // Update local row data when props change
  useEffect(() => {
    setRowData(initialRowData);
    setHasUnsavedChanges(false);
  }, [initialRowData, rowIndex]);

  // Prevent accidental page refreshes while working
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Always warn about refreshing to prevent data loss during analysis
      e.preventDefault();
      e.returnValue = ''; // Modern browsers require this
      return ''; // Legacy support
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);

  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const handleAnalyzeDocument = async (forceOverwrite = false, fillEmptyOnly = false, selectedInstrument?: number) => {
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

    const controller = new AbortController();
    setAbortController(controller);

    try {
      setIsAnalyzing(true);
      console.log('🔍 Starting document analysis for side-by-side workspace, row:', rowIndex);
      
      // Get extraction preferences (same as expanded workspace)
      const { ExtractionPreferencesService } = await import('@/services/extractionPreferences');
      const extractionPrefs = await ExtractionPreferencesService.getDefaultPreferences();
      const extractionFields = extractionPrefs?.columns?.map(col => `${col}: ${extractionPrefs.column_instructions?.[col] || 'Extract this field'}`).join('\n') || 
        columns.map(col => `${col}: Extract this field`).join('\n');

      const documentUrl = await DocumentService.getDocumentUrl(documentRecord.file_path);
      
      // Convert document to base64 image data for analysis API
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      const baseImageData: string = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });

      // If the user has selected a visual start point, crop everything above that line
      let imageData = baseImageData;
      if (selectedStartPoint) {
        try {
          console.log('🎯 SideBySide: Cropping document from visual start point:', selectedStartPoint);

          const cropFromPercentage = async (dataUrl: string, startRatio: number): Promise<string> => {
            return new Promise((resolve) => {
              try {
                const img = new Image();
                img.onload = () => {
                  try {
                    const clampedRatio = Math.max(0, Math.min(1, startRatio || 0));
                    const startY = Math.round(clampedRatio * img.height);
                    const height = Math.max(1, img.height - startY);

                    const canvas = document.createElement('canvas');
                    canvas.width = img.width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    if (!ctx) {
                      console.warn('⚠️ Unable to get 2D context for cropping, using full image instead');
                      return resolve(dataUrl);
                    }

                    // Draw the image so that the selected line becomes the top of the canvas
                    ctx.drawImage(img, 0, -startY);
                    const cropped = canvas.toDataURL();
                    resolve(cropped);
                  } catch (innerErr) {
                    console.error('⚠️ Error during canvas crop, falling back to full image:', innerErr);
                    resolve(dataUrl);
                  }
                };
                img.onerror = (err) => {
                  console.error('⚠️ Failed to load image for cropping, falling back to full image:', err);
                  resolve(dataUrl);
                };
                img.src = dataUrl;
              } catch (outerErr) {
                console.error('⚠️ Unexpected error preparing image crop, falling back to full image:', outerErr);
                resolve(dataUrl);
              }
            });
          };

          imageData = await cropFromPercentage(baseImageData, selectedStartPoint.y);
          console.log('🎯 SideBySide: Cropping complete. Image length before/after:', baseImageData.length, imageData.length);
        } catch (cropError) {
          console.error('⚠️ SideBySide: Failed to crop image at visual start point, falling back to full image:', cropError);
          imageData = baseImageData;
        }
      }
      
      // Find the selected instrument's details if an ID was provided
      const selectedInstrumentDetails = selectedInstrument !== undefined
        ? detectedInstruments.find(inst => inst.id === selectedInstrument)
        : undefined;

      const { data, error } = await supabase.functions.invoke('enhanced-document-analysis', {
        body: {
          document_data: imageData,
          runsheet_id: runsheetId,
          document_name: documentRecord.stored_filename,
          extraction_preferences: {
            columns: extractionPrefs?.columns || columns,
            column_instructions: extractionPrefs?.column_instructions || {}
          },
          selected_instrument: selectedInstrumentDetails ? {
            id: selectedInstrumentDetails.id,
            type: selectedInstrumentDetails.type,
            description: selectedInstrumentDetails.description,
            snippet: selectedInstrumentDetails.snippet
          } : undefined
        }
      });

      if (error) {
        throw new Error(error.message || 'Document analysis failed');
      }
      
      const analysisResult = data;
      
      // Check if multiple instruments were detected (only when no specific instrument has been selected yet)
      if (!selectedInstrument && analysisResult?.analysis?.multiple_instruments && analysisResult?.analysis?.instrument_count > 1) {
        console.log('🔍 Multiple instruments detected:', analysisResult.analysis.instrument_count);
        console.log('🔍 Instruments:', analysisResult.analysis.instruments);
        
        const pendingAnalysis = {
          imageData,
          extractionFields,
          fillEmptyOnly,
          forceOverwrite
        };
        
        // Store the analysis context for later use (both in state and sessionStorage)
        setPendingInstrumentAnalysis(pendingAnalysis);
        const instruments = analysisResult.analysis.instruments || [];
        setDetectedInstruments(instruments);
        
        // Persist to sessionStorage to survive page refreshes
        try {
          sessionStorage.setItem(sessionStorageKey, JSON.stringify({
            instruments,
            pendingAnalysis,
            timestamp: Date.now()
          }));
          console.log('✅ SideBySide: Saved instrument selection state to sessionStorage');
        } catch (e) {
          console.error('Failed to save instrument selection state:', e);
        }
        
        // Show instrument selection dialog
        setShowInstrumentSelectionDialog(true);
        setIsAnalyzing(false);
        return;
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

      // Handle the response from enhanced-document-analysis
      if (analysisResult?.success && analysisResult?.analysis) {
        console.log('✅ Analysis successful (side-by-side), response:', analysisResult.analysis);
        
        let extractedData = analysisResult.analysis;
        
        // If the analysis contains a nested data structure, extract it
        if (extractedData.extracted_data) {
          extractedData = extractedData.extracted_data;
        }
        
        // Parse if it's a string
        if (typeof extractedData === 'string') {
          try {
            extractedData = JSON.parse(extractedData);
            console.log('✅ Parsed extracted data (side-by-side):', extractedData);
          } catch (e) {
            console.error('❌ Could not parse extracted JSON (side-by-side):', e);
            toast({
              title: "Analysis completed with errors",
              description: "The document was analyzed but the data format was unexpected.",
              variant: "destructive"
            });
            return;
          }
        }

        // Update fields with extracted data (same as expanded workspace logic)
        const updatedRowData = { ...rowData };
        Object.keys(extractedData).forEach(key => {
          if (columns.includes(key) && extractedData[key]) {
            // Only update if fillEmptyOnly is false or field is empty
            if (!fillEmptyOnly || !updatedRowData[key] || updatedRowData[key].toString().trim() === '' || 
                updatedRowData[key].toString().trim().toLowerCase() === 'n/a') {
              updatedRowData[key] = extractedData[key];
            }
          }
        });

        setRowData(updatedRowData);
        setLastAnalyzedData(extractedData);
        setHasUnsavedChanges(false); // Analysis counts as saved since we're syncing immediately
        
        // Immediately sync changes back to parent component
        onDataUpdate(rowIndex, updatedRowData);
        
        console.log('✅ SIDE-BY-SIDE: Successfully added to row', rowIndex, 'with data:', updatedRowData);
        
        toast({
          title: "Document analyzed",
          description: `Successfully added to row ${rowIndex + 1}`,
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
      setAbortController(null);
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

  const handleReExtractWithNotes = async (notes: string, saveToPreferences?: boolean, saveToRunsheet?: boolean) => {
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
        
        // Save feedback to extraction preferences if requested
        if (saveToPreferences) {
          const success = await ExtractionPreferencesService.appendToColumnInstructions(
            reExtractDialog.fieldName,
            notes
          );
          
          if (success) {
            console.log(`✅ Saved feedback to extraction preferences for "${reExtractDialog.fieldName}"`);
          } else {
            console.error(`❌ Failed to save feedback to extraction preferences for "${reExtractDialog.fieldName}"`);
          }
        }
        
        // Save feedback to runsheet column instructions if requested
        if (saveToRunsheet && runsheetId) {
          const { RunsheetService } = await import('@/services/runsheetService');
          const success = await RunsheetService.appendToRunsheetColumnInstructions(
            runsheetId,
            reExtractDialog.fieldName,
            notes
          );
          
          if (success) {
            console.log(`✅ Saved feedback to runsheet column instructions for "${reExtractDialog.fieldName}"`);
          } else {
            console.error(`❌ Failed to save feedback to runsheet column instructions for "${reExtractDialog.fieldName}"`);
          }
        }
        
        toast({
          title: "Field re-extracted",
          description: `Successfully re-extracted "${reExtractDialog.fieldName}" with your feedback.${saveToPreferences || saveToRunsheet ? ' Feedback saved for future extractions.' : ''}`,
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
            disabled={isAnalyzing}
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
                      <>
                        {isAnalyzing ? (
                          <Button
                            onClick={() => {
                              if (abortController) {
                                abortController.abort();
                              }
                              setIsAnalyzing(false);
                              setAbortController(null);
                              toast({
                                title: "Analysis cancelled",
                                description: "Document analysis was cancelled.",
                              });
                            }}
                             variant="secondary"
                             className="flex items-center gap-2"
                            size="sm"
                          >
                            Cancel Analysis
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              const hasExisting = columns.some((col) => ((rowData[col] || '').toString().trim() !== ''));
                              if (hasExisting) {
                                setShowAnalyzeWarning(true);
                              } else {
                                handleAnalyzeDocument();
                              }
                            }}
                            className="flex items-center gap-2"
                            size="sm"
                          >
                            <Sparkles className="w-4 h-4" />
                            Analyze Document
                          </Button>
                        )}
                      </>
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
                            onClick={(e) => {
                              const target = e.target as HTMLTextAreaElement;
                              
                              if (e.detail === 2) {
                                // Double-click: select word at cursor
                                e.preventDefault();
                                const text = target.value;
                                const position = target.selectionStart;
                                
                                // Find word boundaries
                                let start = position;
                                let end = position;
                                
                                // Move start back to beginning of word
                                while (start > 0 && /\w/.test(text[start - 1])) {
                                  start--;
                                }
                                
                                // Move end forward to end of word
                                while (end < text.length && /\w/.test(text[end])) {
                                  end++;
                                }
                                
                                target.setSelectionRange(start, end);
                              } else if (e.detail === 3) {
                                // Triple-click: select all text
                                e.preventDefault();
                                target.select();
                              }
                            }}
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
                            onClick={(e) => {
                              const target = e.target as HTMLInputElement;
                              
                              if (e.detail === 2) {
                                // Double-click: select word at cursor
                                e.preventDefault();
                                const text = target.value;
                                const position = target.selectionStart;
                                
                                // Find word boundaries
                                let start = position;
                                let end = position;
                                
                                // Move start back to beginning of word
                                while (start > 0 && /\w/.test(text[start - 1])) {
                                  start--;
                                }
                                
                                // Move end forward to end of word
                                while (end < text.length && /\w/.test(text[end])) {
                                  end++;
                                }
                                
                                target.setSelectionRange(start, end);
                              } else if (e.detail === 3) {
                                // Triple-click: select all text
                                e.preventDefault();
                                target.select();
                              }
                            }}
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
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold">Document</h3>
                  {documentRecord && (
                    <p className="text-sm text-muted-foreground mt-1">
                      {documentRecord.stored_filename}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {documentRecord && !visualSelectionMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setImageFitToWidth(!imageFitToWidth)}
                      className="flex items-center gap-2"
                      title={imageFitToWidth ? "Fit to container" : "Fit to width"}
                    >
                      {imageFitToWidth ? (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                        </svg>
                      ) : (
                        <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                        </svg>
                      )}
                      Fit to Width
                    </Button>
                  )}
                  {documentRecord && !visualSelectionMode && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setVisualSelectionMode(true);
                        setSelectedStartPoint(null);
                        setImageFitToWidth(true);
                      }}
                      className="flex items-center gap-2"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
                      </svg>
                      Select Start
                    </Button>
                  )}
                  {visualSelectionMode && !selectedStartPoint && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setVisualSelectionMode(false);
                        setSelectedStartPoint(null);
                      }}
                    >
                      Cancel Selection
                    </Button>
                  )}
                  {visualSelectionMode && selectedStartPoint && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setVisualSelectionMode(false);
                          setSelectedStartPoint(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setVisualSelectionMode(false);
                          handleAnalyzeDocument(false, false);
                        }}
                        disabled={isAnalyzing}
                        className="flex items-center gap-2"
                      >
                        <Sparkles className="h-4 w-4" />
                        Analyze from Line
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {visualSelectionMode && !selectedStartPoint && (
                <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded-md">
                  <p className="text-sm text-blue-900 dark:text-blue-100">
                    📍 Scroll to align the instrument start with the blue line, then click "Analyze from Line"
                  </p>
                </div>
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
              ) : documentError ? (
                <Card className="h-full flex items-center justify-center m-4">
                  <CardContent className="text-center">
                    <p className="text-destructive">
                      {documentError}
                    </p>
                  </CardContent>
                </Card>
              ) : documentRecord && documentUrl ? (
                <div className="h-full w-full">
                  {/* Always use image viewer since PDFs are converted to images */}
                  <div className="h-full w-full relative overflow-hidden">
                    {/* Fixed blue horizontal line for visual selection */}
                    {visualSelectionMode && (
                      <div 
                        className="absolute left-0 right-0 h-0.5 bg-blue-500 z-50 pointer-events-none shadow-lg"
                        style={{ 
                          top: '35%',
                          boxShadow: '0 0 10px rgba(59, 130, 246, 0.8)'
                        }}
                      />
                    )}
                    <div 
                      ref={documentScrollContainerRef}
                      className="h-full w-full overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent"
                      onScroll={(e) => {
                        if (visualSelectionMode) {
                          const container = e.currentTarget;
                          const img = container.querySelector('img');
                          if (!img) return;

                          // Calculate where the fixed line intersects the image as a percentage
                          const containerRect = container.getBoundingClientRect();
                          const imgRect = img.getBoundingClientRect();
                          
                          // The line is at 35% from the top of the viewport
                          const linePositionInViewport = containerRect.top + (containerRect.height * 0.35);
                          
                          // Calculate where this intersects the image
                          const linePositionOnImage = linePositionInViewport - imgRect.top;
                          const percentageOnImage = linePositionOnImage / imgRect.height;
                          
                          // Clamp and convert to percentage of the FULL image (not just visible portion)
                          const scrollTop = container.scrollTop;
                          const totalImageHeight = img.naturalHeight;
                          const visibleImageHeight = imgRect.height;
                          const scale = visibleImageHeight / totalImageHeight;
                          
                          const absoluteY = scrollTop + (containerRect.height * 0.35);
                          const percentY = absoluteY / visibleImageHeight;
                          
                          setSelectedStartPoint({ y: Math.max(0, Math.min(1, percentY)) });
                        }
                      }}
                      onWheel={(e) => {
                        if (!imageFitToWidth) {
                          e.preventDefault();
                          e.stopPropagation();
                          
                          const container = e.currentTarget;
                          const img = container.querySelector('img');
                          if (!img) return;
                          
                          // Calculate scaled dimensions and bounds
                          const scaledWidth = img.naturalWidth * imageZoom;
                          const scaledHeight = img.naturalHeight * imageZoom;
                          const containerWidth = container.clientWidth;
                          const containerHeight = container.clientHeight;
                          
                          // Only allow scroll if zoomed content is larger than container
                          const canScrollX = scaledWidth > containerWidth;
                          const canScrollY = scaledHeight > containerHeight;
                          
                          // For wheel events, handle zoom first
                          if (e.ctrlKey || e.metaKey) {
                            const delta = e.deltaY > 0 ? -0.1 : 0.1;
                            setImageZoom(prev => Math.max(0.25, Math.min(4, prev + delta)));
                            return;
                          }
                          
                          // Handle pan/scroll with proper bounds
                          if (canScrollY && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
                            const newScrollTop = container.scrollTop + e.deltaY;
                            const maxScrollTop = Math.max(0, scaledHeight - containerHeight);
                            container.scrollTop = Math.max(0, Math.min(maxScrollTop, newScrollTop));
                          }
                          
                          if (canScrollX && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                            const newScrollLeft = container.scrollLeft + e.deltaX;
                            const maxScrollLeft = Math.max(0, scaledWidth - containerWidth);
                            container.scrollLeft = Math.max(0, Math.min(maxScrollLeft, newScrollLeft));
                          }
                        }
                      }}
                    >
                      <img 
                        src={documentUrl}
                        alt={documentRecord.stored_filename}
                        className={`transition-all duration-200 ease-out select-none ${
                          imageFitToWidth ? 'w-full h-auto object-contain' : 'max-w-none object-contain cursor-zoom-in'
                        }`}
                        onError={(e) => {
                          console.error('❌ SideBySide: Failed to load document image:', documentUrl);
                          setDocumentError('Failed to load document image. Please try reloading the page.');
                          // Retry loading once after a short delay
                          setTimeout(async () => {
                            if (documentRecord) {
                              try {
                                const url = await DocumentService.getDocumentUrl(documentRecord.file_path);
                                if (url && url !== documentUrl) {
                                  console.log('🔄 SideBySide: Retrying with refreshed document URL');
                                  setDocumentUrl(url);
                                  setDocumentError(null);
                                }
                              } catch (retryError) {
                                console.error('❌ SideBySide: Failed to retry loading document:', retryError);
                              }
                            }
                          }, 1000);
                        }}
                        style={{ 
                          minHeight: imageFitToWidth ? 'auto' : '100%',
                          transformOrigin: 'center',
                          transform: imageZoom !== 1 ? `scale(${imageZoom})` : 'none'
                        }}
                        onClick={() => {
                          if (!imageFitToWidth) {
                            setImageZoom(prev => prev === 1 ? 2 : prev === 2 ? 0.5 : 1);
                          }
                        }}
                      />
                    </div>
                  </div>
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
              This row already contains data. Choose how to proceed:
              <br /><br />
              <strong>Replace All:</strong> Overwrite all existing data with newly extracted values
              <br />
              <strong>Keep & Fill Empty:</strong> Keep existing data and only fill empty fields
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="flex-col sm:flex-row gap-2">
            <AlertDialogCancel onClick={() => setShowAnalyzeWarning(false)}>
              Cancel
            </AlertDialogCancel>
            <Button
              variant="secondary"
              onClick={() => { 
                setShowAnalyzeWarning(false); 
                handleAnalyzeDocument(true, true); // forceOverwrite=true, fillEmptyOnly=true
              }}
            >
              Keep & Fill Empty
            </Button>
            <AlertDialogAction onClick={() => { 
              setShowAnalyzeWarning(false); 
              handleAnalyzeDocument(true, false); // forceOverwrite=true, fillEmptyOnly=false
            }}>
              Replace All
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
      
      {/* Instrument Selection Dialog */}
      <InstrumentSelectionDialog
        open={showInstrumentSelectionDialog}
        onClose={() => {
          setShowInstrumentSelectionDialog(false);
          setDetectedInstruments([]);
          setPendingInstrumentAnalysis(null);
          // Clear sessionStorage on cancel
          try {
            sessionStorage.removeItem(sessionStorageKey);
          } catch (e) {
            console.error('Failed to clear instrument selection state:', e);
          }
        }}
        instruments={detectedInstruments}
        onSelect={(instrumentId) => {
          console.log('🔍 User selected instrument:', instrumentId);
          setShowInstrumentSelectionDialog(false);
          
          if (pendingInstrumentAnalysis) {
            // Re-run analysis with selected instrument
            handleAnalyzeDocument(
              pendingInstrumentAnalysis.forceOverwrite,
              pendingInstrumentAnalysis.fillEmptyOnly,
              instrumentId
            );
          }
          
          // Clear state after selection
          setPendingInstrumentAnalysis(null);
          try {
            sessionStorage.removeItem(sessionStorageKey);
          } catch (e) {
            console.error('Failed to clear instrument selection state:', e);
          }
        }}
      />
    </div>
  );
};

export default SideBySideDocumentWorkspace;
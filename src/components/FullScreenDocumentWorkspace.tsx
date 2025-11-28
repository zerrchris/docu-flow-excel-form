import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, ArrowLeft, Brain, AlertTriangle, Sparkles } from 'lucide-react';
import { DocumentService } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { ColumnWidthPreferencesService } from '@/services/columnWidthPreferences';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';

import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ReExtractDialog from './ReExtractDialog';
import InstrumentSelectionDialog from './InstrumentSelectionDialog';

interface FullScreenDocumentWorkspaceProps {
  runsheetId: string;
  rowIndex: number;
  rowData: Record<string, string>;
  fields: string[];
  onClose: () => void;
  onUpdateRow: (rowIndex: number, data: Record<string, string>) => void;
  columnWidths?: Record<string, number>;
  columnAlignments?: Record<string, 'left' | 'center' | 'right'>;
  onColumnWidthChange?: (column: string, width: number) => void;
}

const FullScreenDocumentWorkspace: React.FC<FullScreenDocumentWorkspaceProps> = ({
  runsheetId,
  rowIndex,
  rowData,
  fields,
  onClose,
  onUpdateRow,
  columnWidths = {},
  columnAlignments = {},
  onColumnWidthChange
}) => {
  const [documentUrl, setDocumentUrl] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [documentRecord, setDocumentRecord] = useState<any | undefined>(undefined);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  
  const [fitToWidth, setFitToWidth] = useState(true); // Default to fit-to-width for images
  const [localRowData, setLocalRowData] = useState(rowData);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const [autoSelectColumn, setAutoSelectColumn] = useState<string | null>(null);
 
  // Keep localRowData in sync with props when parent data changes (e.g., after autosave or navigation)
  useEffect(() => {
    // Avoid clobbering in-progress edits; update when not editing or when local is empty
    const isEditing = !!editingColumn;
    const localIsEmpty = !localRowData || Object.keys(localRowData || {}).length === 0;
    const changed = JSON.stringify(localRowData) !== JSON.stringify(rowData);
    if (changed && (!isEditing || localIsEmpty)) {
      setLocalRowData(rowData);
    }
  }, [rowData, editingColumn]);
  const [localColumnWidths, setLocalColumnWidths] = useState(columnWidths);
  const [resizing, setResizing] = useState<{column: string, startX: number, startWidth: number} | null>(null);
  const [focusedColumn, setFocusedColumn] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showAnalyzeWarning, setShowAnalyzeWarning] = useState(false);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const tableRef = useRef<HTMLDivElement>(null);
  
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
  
  // Multi-instrument detection state with persistence across page refreshes
  const sessionStorageKey = `instrument_selection_${runsheetId}_${rowIndex}`;
  
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
  
  // Get runsheet management hook for auto-saving changes
  const { activeRunsheet, setCurrentRunsheet } = useActiveRunsheet();
  const { toast } = useToast();
  
  // Lock page scroll while workspace is open (robust, preserves position)
  useEffect(() => {
    const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
    const scrollX = window.scrollX || document.documentElement.scrollLeft || 0;

    const prev = {
      position: document.body.style.position,
      top: document.body.style.top,
      left: document.body.style.left,
      width: document.body.style.width,
      overflow: document.body.style.overflow,
      htmlOverflow: document.documentElement.style.overflow,
    };

    document.documentElement.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = `-${scrollX}px`;
    document.body.style.width = '100%';
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.position = prev.position;
      document.body.style.top = prev.top;
      document.body.style.left = prev.left;
      document.body.style.width = prev.width;
      document.body.style.overflow = prev.overflow;
      document.documentElement.style.overflow = prev.htmlOverflow || '';
      window.scrollTo(scrollX, scrollY);
    };
  }, []);
  
  // Filter out Document File Name column for editing
  const editableFields = fields.filter(field => field !== 'Document File Name');
  
  // Set initial focus to first column when component mounts
  useEffect(() => {
    if (editableFields.length > 0 && !focusedColumn && !editingColumn) {
      setFocusedColumn(editableFields[0]);
    }
  }, [editableFields, focusedColumn, editingColumn]);

  // Restore instrument selection dialog after page refresh
  useEffect(() => {
    if (showInstrumentSelectionDialog && detectedInstruments.length > 0) {
      console.log('🔄 Restored instrument selection dialog after page refresh');
      toast({
        title: "Session Restored",
        description: "Your instrument selection dialog has been restored. Please select an instrument to continue.",
        variant: "default"
      });
    }
  }, []); // Only run on mount

  // Prevent accidental page refresh/close during analysis or when instrument dialog is open
  useEffect(() => {
    if (isAnalyzing || showInstrumentSelectionDialog) {
      const handleBeforeUnload = (e: BeforeUnloadEvent) => {
        e.preventDefault();
        e.returnValue = ''; // Chrome requires returnValue to be set
        return ''; // Legacy browsers
      };

      window.addEventListener('beforeunload', handleBeforeUnload);
      
      return () => {
        window.removeEventListener('beforeunload', handleBeforeUnload);
      };
    }
  }, [isAnalyzing, showInstrumentSelectionDialog]);

  // Load document - simplified approach like SideBySideDocumentWorkspace
  useEffect(() => {
    const loadDocument = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log(`🔍 FullScreenWorkspace: Loading document for runsheet ${runsheetId}, rowIndex ${rowIndex} (display row ${rowIndex + 1})`);
        const document = await DocumentService.getDocumentForRow(runsheetId, rowIndex);
        if (document) {
          console.log(`✅ FullScreenWorkspace: Found document for row ${rowIndex + 1}:`, document);
          setDocumentRecord(document);
          const url = await DocumentService.getDocumentUrl(document.file_path);
          setDocumentUrl(url);
          setDocumentName(document.original_filename);
          // PDFs are converted to images, so no special handling needed
        } else {
          console.warn(`⚠️ FullScreenWorkspace: No document found for row ${rowIndex + 1} (rowIndex ${rowIndex})`);
          setError(`No document found for row ${rowIndex + 1}. The document may have been moved or deleted.`);
        }
      } catch (error) {
        console.error('Error loading document:', error);
        setError(`Failed to load document for row ${rowIndex + 1}. Please try refreshing the page.`);
      } finally {
        setIsLoading(false);
      }
    };

    if (!runsheetId) {
      // Wait until we have a valid runsheet ID to load the document
      console.log('🔍 FullScreenWorkspace: Waiting for valid runsheet ID');
      return;
    }
    
    loadDocument();
  }, [runsheetId, rowIndex]);

  const handleFieldChange = (field: string, value: string) => {
    const updatedData = { ...localRowData, [field]: value };
    setLocalRowData(updatedData);
    onUpdateRow(rowIndex, updatedData);
    
    // Trigger a silent, immediate save via the spreadsheet to prevent data loss
    window.dispatchEvent(new CustomEvent('forceSaveCurrentRunsheet', {
      detail: {
        rowIndex,
        updatedData,
        source: 'fullscreen-edit'
      }
    }));
  };

  const handleBackToRunsheet = () => {
    // Ensure any pending edits are applied
    let updatedData = localRowData;
    if (editingColumn && editingValue !== (localRowData[editingColumn] || '')) {
      updatedData = { ...localRowData, [editingColumn]: editingValue };
      setLocalRowData(updatedData);
      onUpdateRow(rowIndex, updatedData);
    }

    // Force a final silent save to persist changes when leaving fullscreen
    window.dispatchEvent(new CustomEvent('forceSaveCurrentRunsheet', {
      detail: {
        rowIndex,
        updatedData,
        source: 'fullscreen-back'
      }
    }));

    onClose();
  };

  const startEditing = (column: string, selectAll: boolean = false) => {
    setEditingColumn(column);
    setEditingValue(localRowData[column] || '');
    setFocusedColumn(column);

    // Mark this column for auto-select on focus if requested
    if (selectAll) {
      setAutoSelectColumn(column);
    } else {
      setAutoSelectColumn(null);
    }
    
    // Use requestAnimationFrame to ensure the textarea is fully rendered
    requestAnimationFrame(() => {
      const textarea = document.querySelector(`textarea[data-editing="${column}"]`) as HTMLTextAreaElement | null;
      if (textarea) {
        textarea.focus();
        // Scroll to show the top of the cell
        textarea.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
        // Text selection (if any) is handled in the onFocus handler based on autoSelectColumn
      }
    });
  };

  const finishEditing = () => {
    if (editingColumn) {
      handleFieldChange(editingColumn, editingValue);
    }
    setEditingColumn(null);
    setEditingValue('');
  };

  const cancelEditing = () => {
    setEditingColumn(null);
    setEditingValue('');
    // Restore focus to the previously focused column
    if (editingColumn) {
      setFocusedColumn(editingColumn);
    }
  };

  const getColumnWidth = (column: string): number => {
    return localColumnWidths[column] || columnWidths[column] || 200;
  };

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const startX = e.clientX;
    const startWidth = getColumnWidth(column);
    
    const handleMouseMove = (e: MouseEvent) => {
      const diff = e.clientX - startX;
      const newWidth = Math.max(120, startWidth + diff); // Minimum width of 120px
      
      setLocalColumnWidths(prev => ({
        ...prev,
        [column]: newWidth
      }));

      // Save to preferences and notify parent
      ColumnWidthPreferencesService.saveColumnWidth(column, newWidth, runsheetId);
      if (onColumnWidthChange) {
        onColumnWidthChange(column, newWidth);
      }
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setResizing(null);
    };

    setResizing({ column, startX, startWidth });
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleKeyDown = (e: React.KeyboardEvent, column: string) => {
    // Only handle navigation if we're not currently editing
    if (editingColumn) return;
    
    const currentIndex = editableFields.indexOf(column);
    
    if (e.key === 'Tab') {
      e.preventDefault();
      const nextIndex = e.shiftKey 
        ? (currentIndex - 1 + editableFields.length) % editableFields.length
        : (currentIndex + 1) % editableFields.length;
      const nextColumn = editableFields[nextIndex];
      setFocusedColumn(nextColumn);
      // Start editing the next field and select all text if present
      const hasText = localRowData[nextColumn] && localRowData[nextColumn].trim() !== '';
      startEditing(nextColumn, hasText);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prevIndex = (currentIndex - 1 + editableFields.length) % editableFields.length;
      const prevColumn = editableFields[prevIndex];
      setFocusedColumn(prevColumn);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const nextIndex = (currentIndex + 1) % editableFields.length;
      const nextColumn = editableFields[nextIndex];
      setFocusedColumn(nextColumn);
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      startEditing(column, false);
    }
  };

  const handleCellClick = (column: string) => {
    if (editingColumn) return;
    setFocusedColumn(column);
    // Single click - start editing and select all text if there's existing data
    if (localRowData[column] && localRowData[column].trim() !== '') {
      startEditing(column, true); // Pass true to indicate we want to select all
    } else {
      startEditing(column, false); // No text to select, just start editing
    }
  };

  const handleCellDoubleClick = (column: string) => {
    // Double click - start editing but don't select all (allow cursor positioning)
    if (editingColumn) return;
    startEditing(column, false); // Pass false to not select all text
  };

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev + 0.25, 3));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev - 0.25, 0.25));
  };

  const handleZoomReset = () => {
    setZoom(1);
    setRotation(0);
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const openInNewWindow = () => {
    if (documentUrl) {
      window.open(documentUrl, '_blank');
    }
  };

  // Image pan and wheel handlers with proper bounds
  const handleImageWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const imageElement = e.currentTarget as HTMLElement;
    const containerElement = imageElement.parentElement;
    if (!containerElement) return;
    
    // Calculate scaled image dimensions
    const scaledWidth = imageElement.offsetWidth * zoom;
    const scaledHeight = imageElement.offsetHeight * zoom;
    const containerWidth = containerElement.offsetWidth;
    const containerHeight = containerElement.offsetHeight;
    
    // Calculate maximum pan values based on zoom
    const maxPanX = Math.max(0, (scaledWidth - containerWidth) / 2);
    const maxPanY = Math.max(0, (scaledHeight - containerHeight) / 2);
    
    // Apply constraints to prevent over-scrolling
    setPanX(prev => Math.max(-maxPanX, Math.min(maxPanX, prev - e.deltaX)));
    setPanY(prev => Math.max(-maxPanY, Math.min(maxPanY, prev - e.deltaY)));
  };

  const handleImageMouseDown = (e: React.MouseEvent) => {
    setIsDraggingImage(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleImageMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingImage) return;
    e.preventDefault();
    
    const imageElement = e.currentTarget as HTMLElement;
    const containerElement = imageElement.parentElement;
    if (!containerElement) return;
    
    // Calculate scaled image dimensions
    const scaledWidth = imageElement.offsetWidth * zoom;
    const scaledHeight = imageElement.offsetHeight * zoom;
    const containerWidth = containerElement.offsetWidth;
    const containerHeight = containerElement.offsetHeight;
    
    // Calculate maximum pan values based on zoom
    const maxPanX = Math.max(0, (scaledWidth - containerWidth) / 2);
    const maxPanY = Math.max(0, (scaledHeight - containerHeight) / 2);
    
    // Apply constraints to prevent over-scrolling
    const newPanX = e.clientX - dragStart.x;
    const newPanY = e.clientY - dragStart.y;
    setPanX(Math.max(-maxPanX, Math.min(maxPanX, newPanX)));
    setPanY(Math.max(-maxPanY, Math.min(maxPanY, newPanY)));
  };

  const handleImageMouseUp = () => setIsDraggingImage(false);

  const [abortController, setAbortController] = useState<AbortController | null>(null);

  const analyzeDocumentAndPopulateRow = async (fillEmptyOnly: boolean = false, selectedInstrumentId?: number) => {
    if (!documentUrl || isAnalyzing) return;
    
    const controller = new AbortController();
    setAbortController(controller);
    
    try {
      setIsAnalyzing(true);
      console.log('🔍 Starting document analysis for row:', rowIndex);
      
      // Get extraction preferences
      const extractionPrefs = await ExtractionPreferencesService.getDefaultPreferences();
      const extractionFields = extractionPrefs?.columns?.map(col => `${col}: ${extractionPrefs.column_instructions?.[col] || 'Extract this field'}`).join('\n') || 
        editableFields.map(col => `${col}: Extract this field`).join('\n');

      let analysisResult;
      
      // Since PDFs are now converted to images at upload time, use enhanced analysis for all files
      console.log('🔧 Analyzing document with enhanced analysis (multi-instrument support)...');
      
      // Fetch the document and convert to base64 image data URL
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      const reader = new FileReader();
      const imageData: string = await new Promise((resolve) => {
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      
      // Find the selected instrument's details if an ID was provided
      const selectedInstrument = selectedInstrumentId !== undefined 
        ? detectedInstruments.find(inst => inst.id === selectedInstrumentId)
        : undefined;

      const { data, error } = await supabase.functions.invoke('enhanced-document-analysis', {
        body: {
          document_data: imageData,
          runsheet_id: runsheetId,
          document_name: documentName,
          extraction_preferences: {
            columns: extractionPrefs?.columns || editableFields,
            column_instructions: extractionPrefs?.column_instructions || {}
          },
          selected_instrument: selectedInstrument ? {
            id: selectedInstrument.id,
            type: selectedInstrument.type,
            description: selectedInstrument.description,
            snippet: selectedInstrument.snippet
          } : undefined
        }
      });

      if (error) {
        throw new Error(error.message || 'Document analysis failed');
      }
      
      analysisResult = data;
      
      // Check if multiple instruments were detected (only when no specific instrument has been selected yet)
      if (!selectedInstrumentId && analysisResult?.analysis?.multiple_instruments && analysisResult?.analysis?.instrument_count > 1) {
        console.log('🔍 Multiple instruments detected:', analysisResult.analysis.instrument_count);
        console.log('🔍 Instruments:', analysisResult.analysis.instruments);
        
        const pendingAnalysis = {
          imageData,
          extractionFields,
          fillEmptyOnly
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
          console.log('✅ Saved instrument selection state to sessionStorage');
        } catch (e) {
          console.error('Failed to save instrument selection state:', e);
        }
        
        // Show instrument selection dialog
        setShowInstrumentSelectionDialog(true);
        setIsAnalyzing(false);
        return;
      }

      console.log('📡 Analysis function response:', { data: analysisResult });

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
        console.log('✅ Analysis successful, response:', analysisResult.analysis);
        
        let extractedData = analysisResult.analysis;
        
        // If the analysis contains a nested data structure, extract it
        if (extractedData.extracted_data) {
          extractedData = extractedData.extracted_data;
        }
        
        // Parse if it's a string
        if (typeof extractedData === 'string') {
          try {
            extractedData = JSON.parse(extractedData);
            console.log('✅ Parsed extracted data:', extractedData);
          } catch (e) {
            console.error('❌ Could not parse extracted JSON:', e);
            toast({
              title: "Analysis completed with errors",
              description: "The document was analyzed but the data format was unexpected.",
              variant: "destructive"
            });
            return;
          }
        }
        
        // Update the row data with extracted information
        const updatedData = { ...localRowData };
        
        console.log('🔍 FullScreen Analysis - Raw extracted data:', extractedData);
        console.log('🔍 FullScreen Analysis - Available editable fields:', editableFields);
        console.log('🔍 FullScreen Analysis - Current localRowData:', localRowData);
        
        // Parse and populate the extracted data
        Object.entries(extractedData).forEach(([field, value]) => {
          console.log(`🔍 FullScreen Analysis - Processing field "${field}" with value:`, value, 'Type:', typeof value);
          console.log(`🔍 FullScreen Analysis - Field "${field}" is in editableFields:`, editableFields.includes(field));
          
          if (editableFields.includes(field) && value && typeof value === 'string') {
            // Only update if fillEmptyOnly is false or field is empty
            if (!fillEmptyOnly || !updatedData[field] || updatedData[field].toString().trim() === '' || 
                updatedData[field].toString().trim().toLowerCase() === 'n/a') {
              updatedData[field] = value;
              console.log(`✅ FullScreen Analysis - Updated field "${field}" with value:`, value);
            } else {
              console.log(`⏭️ FullScreen Analysis - Skipped field "${field}" - keeping existing value`);
            }
          } else {
            console.log(`❌ FullScreen Analysis - Skipped field "${field}" - reason: not in editableFields(${editableFields.includes(field)}) or invalid value(${!!value && typeof value === 'string'})`);
          }
        });
        
        console.log('🔍 FullScreen Analysis - Final updatedData:', updatedData);
        
        console.log('🔍 FullScreen Analysis - Setting localRowData to:', updatedData);
        setLocalRowData(updatedData);
        
        console.log('🔍 FullScreen Analysis - Calling onUpdateRow with rowIndex:', rowIndex, 'and data:', updatedData);
        onUpdateRow(rowIndex, updatedData);
        
        // Force immediate save to prevent data loss
        window.dispatchEvent(new CustomEvent('forceSaveCurrentRunsheet', {
          detail: { 
            rowIndex, 
            extractedData: updatedData,
            source: 'document-analysis'
          }
        }));

        toast({
          title: "Analysis complete",
          description: "Data has been extracted and populated in the row",
          variant: "default"
        });
      } else {
        toast({
          title: "No data extracted",
          description: "The AI could not extract meaningful data from this document",
          variant: "default"
        });
      }
    } catch (error) {
      console.error('❌ Analysis failed with exception:', error);
      console.error('❌ Error details:', {
        message: error.message,
        stack: error.stack,
        name: error.name
      });
      toast({
        title: "Analysis failed",
        description: `An error occurred during document analysis: ${error.message}`,
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
      setAbortController(null);
    }
  };

  // Re-extract functionality for individual fields
  const handleReExtractField = (fieldName: string) => {
    if (!documentUrl) {
      toast({
        title: "No document available",
        description: "Please ensure a document is loaded before re-extracting fields.",
        variant: "destructive"
      });
      return;
    }

    const currentValue = localRowData[fieldName] || '';
    setReExtractDialog({
      isOpen: true,
      fieldName,
      currentValue
    });
  };

  const handleReExtractWithNotes = async (notes: string, saveToPreferences?: boolean, saveToRunsheet?: boolean) => {
    setIsReExtracting(true);
    
    try {
      console.log('🔧 FullScreenDocumentWorkspace: Starting re-extraction for field:', reExtractDialog.fieldName);

      let imageData: string;
      
      // Handle different document URL formats
      if (documentUrl.startsWith('data:')) {
        console.log('🔧 Using base64 data from document URL');
        imageData = documentUrl;
      } else {
        console.log('🔧 Fetching document from storage URL for re-extraction');
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        
        const reader = new FileReader();
        imageData = await new Promise((resolve) => {
          reader.onloadend = () => {
            resolve(reader.result as string);
          };
          reader.readAsDataURL(blob);
        });
      }

      const response = await supabase.functions.invoke('re-extract-field', {
        body: {
          imageData,
          fileName: documentName,
          fieldName: reExtractDialog.fieldName,
          fieldInstructions: `Extract the ${reExtractDialog.fieldName} field accurately`,
          userNotes: notes,
          currentValue: reExtractDialog.currentValue
        }
      });

      console.log('🔧 FullScreenDocumentWorkspace: Edge function response:', response);

      if (response.error) {
        throw new Error(response.error.message || 'Re-extraction failed');
      }

      if (!response.data?.success) {
        throw new Error(response.data?.error || 'Re-extraction failed');
      }

      const { extractedValue } = response.data;
      console.log('🔧 FullScreenDocumentWorkspace: Extracted value:', extractedValue);
      
      // Update the specific field with the re-extracted value
      const updatedData = { ...localRowData, [reExtractDialog.fieldName]: extractedValue };
      setLocalRowData(updatedData);
      onUpdateRow(rowIndex, updatedData);
      
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

    } catch (error) {
      console.error('🔧 FullScreenDocumentWorkspace: Error re-extracting field:', error);
      toast({
        title: "Re-extraction failed",
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: "destructive",
      });
    } finally {
      setIsReExtracting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-background flex flex-col overscroll-none touch-none"
      role="dialog"
      aria-modal="true"
      onWheel={(e) => { e.preventDefault(); e.stopPropagation(); }}
      onTouchMove={(e) => { e.preventDefault(); e.stopPropagation(); }}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-muted/30 shrink-0">
        <div className="flex items-center space-x-2">
          <h3 className="text-lg font-semibold truncate max-w-[300px]">{documentName}</h3>
          <span className="text-sm text-muted-foreground">Row {rowIndex + 1}</span>
        </div>
        
        <div className="flex items-center space-x-2">
          {/* Always show image controls since PDFs are converted to images */}
          <Button variant="outline" size="sm" onClick={handleZoomOut} disabled={isAnalyzing}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
          <Button variant="outline" size="sm" onClick={handleZoomIn} disabled={isAnalyzing}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button 
            variant={fitToWidth ? "default" : "outline"} 
            size="sm" 
            onClick={() => setFitToWidth(!fitToWidth)}
            disabled={isAnalyzing}
            title="Fit to width"
          >
            Fit Width
          </Button>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Resizable content area */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup direction="vertical" className="h-full">
          {/* Document panel */}
          <ResizablePanel defaultSize={70} minSize={30}>
            <div className="h-full overflow-hidden">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  <span className="ml-2">Loading document...</span>
                </div>
              ) : error || !documentUrl ? (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  {error || 'No document available'}
                </div>
              ) : (
                <div className="h-full w-full relative overflow-hidden">
                  <div 
                    className="h-full w-full overflow-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent"
                    onWheel={(e) => {
                      if (!fitToWidth) {
                        // Allow smooth wheel scrolling when not in fit-to-width mode
                        const container = e.currentTarget;
                        const deltaX = e.deltaX;
                        const deltaY = e.deltaY;
                        
                        // Use native scroll with momentum
                        container.scrollBy({
                          left: deltaX,
                          top: deltaY,
                          behavior: 'auto'
                        });
                      }
                    }}
                  >
                    <img
                      src={documentUrl}
                      alt={documentName}
                      className={`transition-all duration-200 ease-out select-none ${
                        fitToWidth ? 'w-full h-auto object-contain' : 'object-contain cursor-grab active:cursor-grabbing'
                      }`}
                      style={{
                        minHeight: fitToWidth ? 'auto' : '100%',
                        minWidth: fitToWidth ? '100%' : 'auto',
                        transform: fitToWidth ? 'none' : `scale(${zoom}) rotate(${rotation}deg)`,
                        transformOrigin: 'center',
                        willChange: fitToWidth ? 'auto' : 'transform'
                      }}
                      draggable={false}
                      onMouseDown={fitToWidth ? undefined : handleImageMouseDown}
                      onMouseMove={fitToWidth ? undefined : handleImageMouseMove}
                      onMouseUp={fitToWidth ? undefined : handleImageMouseUp}
                      onError={(e) => {
                        console.error('Failed to load document image:', documentUrl);
                        setError('Failed to load document image. The document may have been moved or the page was refreshed during analysis. Please close this view and try again.');
                        // Retry loading once after a short delay
                        setTimeout(async () => {
                          if (documentRecord) {
                            try {
                              const url = await DocumentService.getDocumentUrl(documentRecord.file_path);
                              if (url && url !== documentUrl) {
                                console.log('🔄 Retrying with refreshed document URL');
                                setDocumentUrl(url);
                                setError(null);
                              }
                            } catch (retryError) {
                              console.error('Failed to retry loading document:', retryError);
                            }
                          }
                        }, 1000);
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </ResizablePanel>

          {/* Resize handle */}
          <ResizableHandle className="bg-border hover:bg-primary/20 transition-colors" />

          {/* Row data panel */}
          <ResizablePanel defaultSize={20} minSize={15} maxSize={60}>
            <Card className="h-full border-t-2 border-primary border-b flex flex-col">
              <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h4 className="font-semibold">Working Row {rowIndex + 1}</h4>
                   {documentUrl && !isLoading && !error && (
                     <>
                       {isAnalyzing ? (
                          <Button
                            variant="secondary"
                            size="sm"
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
                            className="gap-2"
                            title="Cancel document analysis"
                          >
                            Cancel Analysis
                          </Button>
                       ) : (
                         <Button
                           variant="outline"
                           size="sm"
                           onClick={() => {
                             const hasExisting = editableFields.some((c) => ((localRowData[c] || '').toString().trim() !== ''));
                             if (hasExisting) {
                               setShowAnalyzeWarning(true);
                             } else {
                               analyzeDocumentAndPopulateRow();
                             }
                           }}
                           className="gap-2 text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300"
                           title="Analyze document and extract data to populate row fields"
                         >
                           <Brain className="h-4 w-4" />
                           Analyze
                         </Button>
                       )}
                     </>
                   )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleBackToRunsheet}
                  className="gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back to Runsheet
                </Button>
              </div>
              <div className="flex-1 min-h-0 flex flex-col border-b border-border">
                <div className="h-full w-full overflow-auto">
                  <div ref={tableRef} className="min-w-max flex-1 flex flex-col" style={{ minWidth: 'fit-content' }}>
                  {/* Sticky Header */}
                  <div className="sticky top-0 z-10 bg-background border-b border-border">
                    <div className="flex">
                      {editableFields.map((column) => (
                        <div 
                          key={column}
                          className="border-r border-border font-semibold text-foreground relative group p-3 flex items-center justify-between"
                          style={{ 
                            width: `${Math.max(getColumnWidth(column), 120)}px`, 
                            minWidth: '120px'
                          }}
                        >
                          <span 
                            className="truncate pr-2 flex-1 min-w-0" 
                            title={column}
                            style={{ maxWidth: 'calc(100% - 32px)' }}
                          >
                            {column}
                          </span>
                          {/* Re-extract button in header */}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleReExtractField(column);
                            }}
                            className="h-6 w-6 p-0 hover:bg-purple-100 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex-shrink-0"
                            title={`Re-extract "${column}" field with AI feedback`}
                          >
                            <Sparkles className="h-3 w-3" />
                          </Button>
                          
                          {/* Column resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/70 group-hover:bg-primary/40 transition-colors"
                            onMouseDown={(e) => handleMouseDown(e, column)}
                            style={{ right: '-4px' }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                   {/* Content-sized Row */}
                   <div className="flex hover:bg-muted/30">
                     {editableFields.map((column) => {
                      const isEditing = editingColumn === column;
                      const isFocused = focusedColumn === column;
                      const alignment = columnAlignments[column] || 'left';
                      
                      return (
                        <div 
                          key={column}
                          className="border-r border-border relative flex"
                          style={{ 
                            width: `${Math.max(getColumnWidth(column), 120)}px`, 
                            minWidth: '120px'
                          }}
                        >
                          {isEditing ? (
                             <Textarea
                               data-editing={column}
                               value={editingValue}
                               onChange={(e) => setEditingValue(e.target.value)}
                               onFocus={(e) => {
                                 if (autoSelectColumn === column && e.currentTarget.value.length > 0) {
                                   e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
                                 }
                               }}
                               onMouseDown={() => {
                                 // Once the user actively clicks into the field, stop any auto-select behavior
                                 if (autoSelectColumn === column) {
                                   setAutoSelectColumn(null);
                                 }
                               }}
                               onKeyDown={(e) => {
                                 if (e.key === 'Escape') {
                                   e.preventDefault();
                                   cancelEditing();
                                 } else if (e.key === 'Tab') {
                                   e.preventDefault();
                                   finishEditing();
                                   const currentIndex = editableFields.indexOf(column);
                                   const nextIndex = e.shiftKey 
                                     ? (currentIndex - 1 + editableFields.length) % editableFields.length
                                     : (currentIndex + 1) % editableFields.length;
                                   const nextColumn = editableFields[nextIndex];
                                   const hasText = localRowData[nextColumn] && localRowData[nextColumn].trim() !== '';
                                   startEditing(nextColumn, hasText);
                                 }
                               }}
                               onBlur={finishEditing}
                               className={`w-full min-h-[60px] max-h-[200px] border-2 border-primary rounded-none bg-background focus:ring-0 focus:outline-none resize-none p-2 ${
                                 alignment === 'center' ? 'text-center' : 
                                 alignment === 'right' ? 'text-right' : 'text-left'
                               }`}
                               style={{ height: 'auto' }}
                             />
                            ) : (
                              <div
                                className={`w-full transition-colors focus:outline-none relative min-h-[60px] max-h-[200px]
                                  ${isFocused ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20' : 'hover:bg-muted/50 border-2 border-transparent'}`}
                                onKeyDown={(e) => handleKeyDown(e, column)}
                                tabIndex={0}
                              >
                                {/* Scrollable content area with content-based height */}
                                <div 
                                  className={`p-3 whitespace-pre-wrap cursor-cell overflow-y-auto overflow-x-hidden min-h-[60px] max-h-[200px] ${
                                    alignment === 'center' ? 'text-center' : 
                                    alignment === 'right' ? 'text-right' : 'text-left'
                                  }`}
                                  onClick={() => handleCellClick(column)}
                                  onDoubleClick={() => handleCellDoubleClick(column)}
                                  style={{ 
                                    scrollbarWidth: 'thin',
                                    scrollbarColor: 'rgb(156 163 175) transparent'
                                  }}
                                >
                                  {localRowData[column] || ''}
                                </div>
                              </div>
                           )}
                        </div>
                      );
                     })}
                  </div>
                  </div>
                </div>
              </div>
            </Card>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      <AlertDialog open={showAnalyzeWarning} onOpenChange={setShowAnalyzeWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
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
                analyzeDocumentAndPopulateRow(true); // fillEmptyOnly = true
              }}
            >
              Keep & Fill Empty
            </Button>
            <AlertDialogAction onClick={() => { 
              setShowAnalyzeWarning(false); 
              analyzeDocumentAndPopulateRow(false); // fillEmptyOnly = false
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
          console.log('🔍 User selected instrument ID:', instrumentId);
          const selectedInstrument = detectedInstruments.find(inst => inst.id === instrumentId);
          console.log('🔍 Selected instrument details:', selectedInstrument);
          setShowInstrumentSelectionDialog(false);
          
          if (pendingInstrumentAnalysis) {
            // Re-run analysis with selected instrument ID
            analyzeDocumentAndPopulateRow(
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

export default FullScreenDocumentWorkspace;
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
import PDFViewer from './PDFViewer';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import ReExtractDialog from './ReExtractDialog';

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
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isPdf, setIsPdf] = useState(false);
  const [localRowData, setLocalRowData] = useState(rowData);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
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

  useEffect(() => {
    const loadDocument = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        console.log('🔧 FullScreenDocumentWorkspace: Loading document for runsheet:', runsheetId, 'row:', rowIndex);
        console.log('🔧 FullScreenDocumentWorkspace: Current rowData:', rowData);
        
        // Try to load from database first
        const document = await DocumentService.getDocumentForRow(runsheetId, rowIndex);
        console.log('🔧 FullScreenDocumentWorkspace: Document from database:', document);
        
        if (document) {
          const url = DocumentService.getDocumentUrl(document.file_path);
          console.log('🔧 FullScreenDocumentWorkspace: Document URL:', url);
          setDocumentUrl(url);
          setDocumentName(document.original_filename);
          setIsPdf(document.content_type === 'application/pdf' || document.original_filename.toLowerCase().endsWith('.pdf'));
        } else {
          console.log('🔧 FullScreenDocumentWorkspace: No document found in database, checking session storage...');
          
          // Check for pending documents in session storage
          const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
          console.log('🔧 FullScreenDocumentWorkspace: Pending documents:', pendingDocs);
          
          const pendingDoc = pendingDocs.find((doc: any) => doc.rowIndex === rowIndex);
          console.log('🔧 FullScreenDocumentWorkspace: Found pending document for row:', pendingDoc);
          
          if (pendingDoc) {
            // If we have a storage path, try to construct the document URL
            if (pendingDoc.storagePath) {
              const url = DocumentService.getDocumentUrl(pendingDoc.storagePath);
              setDocumentUrl(url);
              setDocumentName(pendingDoc.fileName);
              setIsPdf(pendingDoc.fileName.toLowerCase().endsWith('.pdf'));
            } else if (pendingDoc.fileData) {
              // Fallback to fileData if available (blob URL)
              setDocumentUrl(pendingDoc.fileData);
              setDocumentName(pendingDoc.fileName);
              setIsPdf(pendingDoc.fileType === 'application/pdf' || pendingDoc.fileName.toLowerCase().endsWith('.pdf'));
            } else {
              console.error('🔧 FullScreenDocumentWorkspace: Pending document found but no valid data');
              setError(`Document data not available for row ${rowIndex}`);
            }
          } else {
            console.log('🔧 FullScreenDocumentWorkspace: No pending document in session, checking rowData Storage Path...');
            
            // Check if the row data has a Storage Path (from batch processing)
            const storagePath = rowData['Storage Path'];
            const documentFileName = rowData['Document File Name'];
            
            console.log('🔧 FullScreenDocumentWorkspace: Storage Path:', storagePath);
            console.log('🔧 FullScreenDocumentWorkspace: Document File Name:', documentFileName);
            console.log('🔧 FullScreenDocumentWorkspace: Row data keys:', Object.keys(rowData));
            
            if (storagePath) {
              console.log('🔧 FullScreenDocumentWorkspace: Found Storage Path in rowData, constructing document URL');
              const url = DocumentService.getDocumentUrl(storagePath);
              console.log('🔧 FullScreenDocumentWorkspace: Constructed URL from Storage Path:', url);
              setDocumentUrl(url);
              setDocumentName(documentFileName || 'Document');
              setIsPdf(documentFileName?.toLowerCase().endsWith('.pdf') || false);
              console.log('🔧 FullScreenDocumentWorkspace: Document loaded from Storage Path successfully');
            } else {
              // Storage Path not in row data, try querying database directly
              console.log('🔧 FullScreenDocumentWorkspace: No Storage Path in rowData, querying database for document at row:', rowIndex);
              
              try {
                const { data: documents, error } = await supabase
                  .from('documents')
                  .select('file_path, original_filename')
                  .eq('runsheet_id', runsheetId)
                  .eq('row_index', rowIndex)
                  .limit(1);
                
                if (error) {
                  console.error('🔧 FullScreenDocumentWorkspace: Database query error:', error);
                  throw error;
                }
                
                if (documents && documents.length > 0) {
                  const doc = documents[0];
                  console.log('🔧 FullScreenDocumentWorkspace: Found document in database:', doc);
                  const url = DocumentService.getDocumentUrl(doc.file_path);
                  console.log('🔧 FullScreenDocumentWorkspace: Constructed URL from database:', url);
                  setDocumentUrl(url);
                  setDocumentName(doc.original_filename || 'Document');
                  setIsPdf(doc.original_filename?.toLowerCase().endsWith('.pdf') || false);
                  console.log('🔧 FullScreenDocumentWorkspace: Document loaded from database successfully');
                } else {
                  console.error('🔧 FullScreenDocumentWorkspace: No document found in database, session storage, or rowData Storage Path');
                  console.log('🔧 FullScreenDocumentWorkspace: Available rowData:', rowData);
                  setError(`No document found for row ${rowIndex} in runsheet ${runsheetId}`);
                }
              } catch (dbError) {
                console.error('🔧 FullScreenDocumentWorkspace: Error querying database for document:', dbError);
                setError(`No document found for row ${rowIndex} in runsheet ${runsheetId}`);
              }
            }
          }
        }
      } catch (error) {
        console.error('🔧 FullScreenDocumentWorkspace: Error loading document:', error);
        setError('Failed to load document');
      } finally {
        setIsLoading(false);
      }
    };

    loadDocument();
  }, [runsheetId, rowIndex]);

  const handleFieldChange = (field: string, value: string) => {
    const updatedData = { ...localRowData, [field]: value };
    setLocalRowData(updatedData);
    onUpdateRow(rowIndex, updatedData);
    
    // Auto-save to runsheet state to prevent data loss on navigation
    if (activeRunsheet) {
      const updatedRunsheetData = [...(activeRunsheet.data || [])];
      updatedRunsheetData[rowIndex] = updatedData;
      
      // Update active runsheet with new data - database-first approach will handle persistence
      setCurrentRunsheet(activeRunsheet.id); // Trigger refresh
    }
  };

  const handleBackToRunsheet = () => {
    // Ensure any pending edits are saved
    if (editingColumn && editingValue !== (localRowData[editingColumn] || '')) {
      const updatedData = { ...localRowData, [editingColumn]: editingValue };
      setLocalRowData(updatedData);
      onUpdateRow(rowIndex, updatedData);
    }
    onClose();
  };

  const startEditing = (column: string) => {
    setEditingColumn(column);
    setEditingValue(localRowData[column] || '');
    setFocusedColumn(null);
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
      const newWidth = Math.max(100, startWidth + diff);
      
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
      startEditing(column);
    }
  };

  const handleCellClick = (column: string) => {
    if (editingColumn) return;
    setFocusedColumn(column);
    // Start editing immediately on single click
    startEditing(column);
  };

  const handleCellDoubleClick = (column: string) => {
    // Double click also starts editing (redundant but ensures it works)
    startEditing(column);
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

  // Image pan and wheel handlers for Mac trackpad scroll
  const handleImageWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPanX(prev => prev - e.deltaX);
    setPanY(prev => prev - e.deltaY);
  };

  const handleImageMouseDown = (e: React.MouseEvent) => {
    setIsDraggingImage(true);
    setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
  };

  const handleImageMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingImage) return;
    e.preventDefault();
    setPanX(e.clientX - dragStart.x);
    setPanY(e.clientY - dragStart.y);
  };

  const handleImageMouseUp = () => setIsDraggingImage(false);

  const analyzeDocumentAndPopulateRow = async () => {
    if (!documentUrl || isAnalyzing) return;
    
    try {
      setIsAnalyzing(true);
      console.log('🔍 Starting document analysis for row:', rowIndex);
      
      // Get extraction preferences
      const extractionPrefs = await ExtractionPreferencesService.getDefaultPreferences();
      const extractionFields = extractionPrefs?.columns?.map(col => `${col}: ${extractionPrefs.column_instructions?.[col] || 'Extract this field'}`).join('\n') || 
        editableFields.map(col => `${col}: Extract this field`).join('\n');

      let imageData: string;
      
      // Check if documentUrl is already a base64 data URL (from pending documents)
      if (documentUrl.startsWith('data:')) {
        console.log('🔧 Using base64 data from pending document');
        imageData = documentUrl;
        
        // Check if it's PDF data (even if incorrectly labeled)
        const base64Content = documentUrl.split(',')[1];
        if (base64Content && base64Content.startsWith('JVBERi0')) {
          toast({
            title: "PDF Analysis Not Supported",
            description: "PDF files cannot be analyzed directly. Please convert your PDF to an image format (PNG, JPEG) and try again.",
            variant: "destructive"
          });
          return;
        }
        
        // Check MIME type for PDFs
        if (documentUrl.includes('data:application/pdf')) {
          toast({
            title: "PDF Analysis Not Supported", 
            description: "PDF files cannot be analyzed directly. Please convert your PDF to an image format (PNG, JPEG) and try again.",
            variant: "destructive"
          });
          return;
        }
      } else {
        console.log('🔧 Fetching document from storage URL');
        // Convert the document URL to base64 for analysis
        const response = await fetch(documentUrl);
        const blob = await response.blob();
        
        if (isPdf || blob.type === 'application/pdf') {
          // For PDFs, show clear error message
          toast({
            title: "PDF Analysis Not Supported",
            description: "PDF files cannot be analyzed directly. Please convert your PDF to an image format (PNG, JPEG) and try again.",
            variant: "destructive"
          });
          return;
        } else {
          // For images, convert to base64 data URL
          const reader = new FileReader();
          imageData = await new Promise((resolve) => {
            reader.onloadend = () => {
              resolve(reader.result as string); // Keep full data URL format
            };
            reader.readAsDataURL(blob);
          });
        }
      }

      // Call the analyze-document function
      console.log('🚀 Starting document analysis...');
      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: {
          prompt: `Extract information from this document for the following fields and return as valid JSON:\n${extractionFields}\n\nReturn only a JSON object with field names as keys and extracted values as values. Do not include any markdown, explanations, or additional text.`,
          imageData
        },
      });

      console.log('📡 Supabase function response:', { data, error });

      if (error) {
        console.error('❌ Analysis error:', error);
        toast({
          title: "Analysis failed",
          description: error.message || "Could not analyze the document",
          variant: "destructive"
        });
        return;
      }

      if (data?.generatedText) {
        console.log('✅ Analysis successful, raw response:', data.generatedText);
        
        // Parse the JSON response from AI
        let extractedData = {};
        try {
          // Try to parse as JSON first
          extractedData = JSON.parse(data.generatedText);
          console.log('✅ Parsed extracted data:', extractedData);
        } catch (e) {
          console.log('🔍 JSON parsing failed, trying to extract JSON from text...');
          // If JSON parsing fails, try to extract JSON from the text
          const jsonMatch = data.generatedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            try {
              extractedData = JSON.parse(jsonMatch[0]);
              console.log('✅ Extracted data from regex match:', extractedData);
            } catch (parseError) {
              console.error('🔍 JSON parsing of matched content failed:', parseError);
              // If all parsing fails, show the raw response and continue with empty data
              console.log('Raw response that failed to parse:', data.generatedText);
              extractedData = {};
            }
          } else {
            console.error('🔍 Could not find JSON in response:', data.generatedText);
            // Don't throw error, just use empty data
            extractedData = {};
          }
        }
        
        // Update the row data with extracted information
        const updatedData = { ...localRowData };
        
        // Parse and populate the extracted data
        Object.entries(extractedData).forEach(([field, value]) => {
          if (editableFields.includes(field) && value && typeof value === 'string') {
            updatedData[field] = value;
          }
        });
        
        setLocalRowData(updatedData);
        onUpdateRow(rowIndex, updatedData);
        
        // Auto-save to runsheet state
        if (activeRunsheet) {
          const updatedRunsheetData = [...(activeRunsheet.data || [])];
          updatedRunsheetData[rowIndex] = updatedData;
          
          // Update active runsheet with new data - database-first approach will handle persistence
          setCurrentRunsheet(activeRunsheet.id); // Trigger refresh
        }

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

  const handleReExtractWithNotes = async (notes: string) => {
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
      
      toast({
        title: "Field re-extracted",
        description: `Successfully re-extracted "${reExtractDialog.fieldName}" with your feedback.`,
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
          {!isPdf && (
            <>
              <Button variant="outline" size="sm" onClick={handleZoomOut}>
                <ZoomOut className="h-4 w-4" />
              </Button>
              <span className="text-sm font-medium">{Math.round(zoom * 100)}%</span>
              <Button variant="outline" size="sm" onClick={handleZoomIn}>
                <ZoomIn className="h-4 w-4" />
              </Button>
              <Button variant="outline" size="sm" onClick={handleZoomReset}>
                <RotateCcw className="h-4 w-4" />
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={openInNewWindow}>
            <ExternalLink className="h-4 w-4" />
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
              ) : isPdf ? (
                <PDFViewer file={null} previewUrl={documentUrl} />
              ) : (
                <ScrollArea className="h-full overscroll-contain">
                  <div className="min-h-full bg-muted/10 flex items-center justify-center p-4" onWheel={handleImageWheel}>
                    <img
                      src={documentUrl}
                      alt={documentName}
                      className="max-w-full object-contain transition-transform duration-200 select-none cursor-grab active:cursor-grabbing"
                      style={{
                        transform: `translate(${panX / zoom}px, ${panY / zoom}px) scale(${zoom}) rotate(${rotation}deg)`,
                        transformOrigin: 'center',
                        willChange: 'transform'
                      }}
                      draggable={false}
                      onMouseDown={handleImageMouseDown}
                      onMouseMove={handleImageMouseMove}
                      onMouseUp={handleImageMouseUp}
                      onMouseLeave={handleImageMouseUp}
                      onError={() => setError('Failed to load image')}
                    />
                  </div>
                </ScrollArea>
              )}
            </div>
          </ResizablePanel>

          {/* Resize handle */}
          <ResizableHandle className="bg-border hover:bg-primary/20 transition-colors" />

          {/* Row data panel */}
          <ResizablePanel defaultSize={30} minSize={25} maxSize={60}>
            <Card className="h-full border-t-2 border-primary border-b flex flex-col">
              <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <h4 className="font-semibold">Working Row {rowIndex + 1}</h4>
                  {documentUrl && !isLoading && !error && (
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
                      disabled={isAnalyzing}
                      className="gap-2 text-blue-600 hover:text-blue-700 border-blue-200 hover:border-blue-300"
                      title="Analyze document and extract data to populate row fields"
                    >
                      <Brain className="h-4 w-4" />
                      {isAnalyzing ? 'Analyzing...' : 'Analyze'}
                    </Button>
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
              <div className="flex-1 min-h-0 flex flex-col border-b border-border" ref={tableRef}>
                <div className="min-w-max flex-1 flex flex-col">
                  {/* Sticky Header */}
                  <div className="sticky top-0 z-10 bg-muted/50 border-b border-border">
                    <div className="flex">
                      {editableFields.map((column) => (
                        <div 
                          key={column}
                          className="border-r border-border font-semibold text-foreground relative group p-3 flex items-center justify-between"
                          style={{ 
                            width: `${getColumnWidth(column)}px`, 
                            minWidth: `${getColumnWidth(column)}px`
                          }}
                        >
                          <span>{column}</span>
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

                  {/* Fixed Height Row */}
                  <div className="flex-1 min-h-0 flex hover:bg-muted/30">
                    {editableFields.map((column) => {
                      const isEditing = editingColumn === column;
                      const isFocused = focusedColumn === column;
                      const alignment = columnAlignments[column] || 'left';
                      
                      return (
                        <div 
                          key={column}
                          className="border-r border-border relative flex"
                          style={{ 
                            width: `${getColumnWidth(column)}px`, 
                            minWidth: `${getColumnWidth(column)}px`
                          }}
                        >
                          {isEditing ? (
                            <Textarea
                              value={editingValue}
                              onChange={(e) => setEditingValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                  e.preventDefault();
                                  finishEditing();
                                } else if (e.key === 'Escape') {
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
                                  setTimeout(() => startEditing(nextColumn), 0);
                                }
                              }}
                              onBlur={finishEditing}
                              className={`w-full h-full border-2 border-primary rounded-none bg-background focus:ring-0 focus:outline-none resize-none p-2 ${
                                alignment === 'center' ? 'text-center' : 
                                alignment === 'right' ? 'text-right' : 'text-left'
                              }`}
                              autoFocus
                            />
                           ) : (
                             <div
                               className={`w-full h-full flex flex-col cursor-cell transition-colors focus:outline-none relative group
                                 ${isFocused ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20' : 'hover:bg-muted/50 border-2 border-transparent'}
                                 ${alignment === 'center' ? 'text-center items-center' : 
                                   alignment === 'right' ? 'text-right items-end' : 'text-left items-start'}`}
                               onClick={() => handleCellClick(column)}
                               onDoubleClick={() => handleCellDoubleClick(column)}
                               onKeyDown={(e) => handleKeyDown(e, column)}
                               tabIndex={0}
                             >
                               {/* Scrollable content area */}
                               <div className={`flex-1 overflow-auto p-3 whitespace-pre-wrap min-h-0 ${
                                 alignment === 'center' ? 'text-center' : 
                                 alignment === 'right' ? 'text-right' : 'text-left'
                               }`}>
                                 {localRowData[column] || ''}
                               </div>
                               
                               {/* Re-extract button - show for all cells including empty ones */}
                               <div className="p-2 flex justify-end">
                                 <Button
                                   variant="ghost"
                                   size="sm"
                                   onClick={(e) => {
                                     e.stopPropagation();
                                     handleReExtractField(column);
                                   }}
                                   className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-100 dark:hover:bg-purple-900/20 text-purple-600 dark:text-purple-400 flex-shrink-0"
                                   title={`Re-extract "${column}" field with AI feedback`}
                                 >
                                   <Sparkles className="h-4 w-4" />
                                 </Button>
                               </div>
                             </div>
                           )}
                        </div>
                      );
                    })}
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
              This row already contains data. Analyzing will replace existing values with extracted information.
              Are you sure you want to continue?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setShowAnalyzeWarning(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowAnalyzeWarning(false); analyzeDocumentAndPopulateRow(); }}>
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
    </div>
  );
};

export default FullScreenDocumentWorkspace;
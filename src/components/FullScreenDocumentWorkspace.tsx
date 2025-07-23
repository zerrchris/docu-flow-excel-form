import React, { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { X, ZoomIn, ZoomOut, RotateCcw, ExternalLink, ArrowLeft, Brain } from 'lucide-react';
import { DocumentService } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { useMultipleRunsheets } from '@/hooks/useMultipleRunsheets';
import PDFViewer from './PDFViewer';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  const tableRef = useRef<HTMLDivElement>(null);
  
  // Get runsheet management hook for auto-saving changes
  const { updateRunsheet, currentRunsheet } = useMultipleRunsheets();
  const { toast } = useToast();
  
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
        
        const document = await DocumentService.getDocumentForRow(runsheetId, rowIndex);
        if (document) {
          const url = DocumentService.getDocumentUrl(document.file_path);
          setDocumentUrl(url);
          setDocumentName(document.original_filename);
          setIsPdf(document.content_type === 'application/pdf' || document.original_filename.toLowerCase().endsWith('.pdf'));
        } else {
          setError('No document found for this row');
        }
      } catch (error) {
        console.error('Error loading document:', error);
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
    if (currentRunsheet) {
      const updatedRunsheetData = [...currentRunsheet.data];
      updatedRunsheetData[rowIndex] = updatedData;
      
      updateRunsheet(currentRunsheet.id, {
        data: updatedRunsheetData,
        hasUnsavedChanges: true
      });
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

  const analyzeDocumentAndPopulateRow = async () => {
    if (!documentUrl || isAnalyzing) return;
    
    try {
      setIsAnalyzing(true);
      console.log('🔍 Starting document analysis for row:', rowIndex);
      
      // Get extraction preferences
      const extractionPrefs = await ExtractionPreferencesService.getDefaultPreferences();
      const extractionFields = extractionPrefs?.columns?.map(col => `${col}: ${extractionPrefs.column_instructions?.[col] || 'Extract this field'}`).join('\n') || 
        editableFields.map(col => `${col}: Extract this field`).join('\n');

      // Convert the document URL to base64 for analysis
      const response = await fetch(documentUrl);
      const blob = await response.blob();
      
      let imageData: string;
      if (isPdf) {
        // For PDFs, we'll need to convert to image first
        toast({
          title: "PDF Analysis",
          description: "PDF analysis is currently limited. Consider converting to image first.",
          variant: "default"
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

      // Call the analyze-document function
      const { data, error } = await supabase.functions.invoke('analyze-document', {
        body: {
          imageData,
          extractionFields,
          analysisType: 'spreadsheet'
        },
      });

      if (error) {
        console.error('Analysis error:', error);
        toast({
          title: "Analysis failed",
          description: error.message || "Could not analyze the document",
          variant: "destructive"
        });
        return;
      }

      if (data?.extractedData) {
        console.log('✅ Analysis successful, extracted data:', data.extractedData);
        
        // Update the row data with extracted information
        const updatedData = { ...localRowData };
        
        // Parse and populate the extracted data
        Object.entries(data.extractedData).forEach(([field, value]) => {
          if (editableFields.includes(field) && value && typeof value === 'string') {
            updatedData[field] = value;
          }
        });
        
        setLocalRowData(updatedData);
        onUpdateRow(rowIndex, updatedData);
        
        // Auto-save to runsheet state
        if (currentRunsheet) {
          const updatedRunsheetData = [...currentRunsheet.data];
          updatedRunsheetData[rowIndex] = updatedData;
          
          updateRunsheet(currentRunsheet.id, {
            data: updatedRunsheetData,
            hasUnsavedChanges: true
          });
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
      console.error('Analysis failed:', error);
      toast({
        title: "Analysis failed",
        description: "An error occurred during document analysis",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {/* Document Area */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* Header with controls */}
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

        {/* Document content */}
        <div className="flex-1 overflow-hidden">
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
            <ScrollArea className="h-full">
              <div className="min-h-full bg-muted/10 flex items-center justify-center p-4">
                <img
                  src={documentUrl}
                  alt={documentName}
                  className="max-w-full object-contain transition-transform duration-200"
                  style={{
                    transform: `scale(${zoom}) rotate(${rotation}deg)`,
                    transformOrigin: 'center'
                  }}
                  onError={() => setError('Failed to load image')}
                />
              </div>
            </ScrollArea>
          )}
        </div>
      </div>

      {/* Working Row Area - Fixed at bottom */}
      <Card className="border-t-2 border-primary shrink-0">
        <div className="p-4 border-b bg-muted/20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <h4 className="font-semibold">Working Row {rowIndex + 1}</h4>
            {documentUrl && !isLoading && !error && (
              <Button
                variant="outline"
                size="sm"
                onClick={analyzeDocumentAndPopulateRow}
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
        <div className="h-48 overflow-auto" ref={tableRef}>
          <div className="min-w-max">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {editableFields.map((column) => (
                    <TableHead 
                      key={column}
                      className="border-r border-border font-semibold text-foreground relative group"
                      style={{ 
                        width: `${getColumnWidth(column)}px`, 
                        minWidth: `${getColumnWidth(column)}px`
                      }}
                    >
                      {column}
                      {/* Column resize handle */}
                      <div
                        className="absolute right-0 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/70 group-hover:bg-primary/40 transition-colors"
                        onMouseDown={(e) => handleMouseDown(e, column)}
                        style={{ right: '-4px' }}
                      />
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-muted/30">
                  {editableFields.map((column) => {
                    const isEditing = editingColumn === column;
                    const isFocused = focusedColumn === column;
                    const alignment = columnAlignments[column] || 'left';
                    
                    return (
                      <TableCell 
                        key={column}
                        className="border-r border-border p-0 relative"
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
                            className={`w-full border-2 border-primary rounded-none bg-background focus:ring-0 focus:outline-none resize-none p-2 ${
                              alignment === 'center' ? 'text-center' : 
                              alignment === 'right' ? 'text-right' : 'text-left'
                            }`}
                            style={{ 
                              minHeight: '60px',
                              width: '100%'
                            }}
                            autoFocus
                            rows={Math.max(3, Math.ceil(editingValue.length / 50))}
                          />
                        ) : (
                          <div
                            className={`min-h-[2rem] py-2 px-3 cursor-cell flex items-start transition-colors whitespace-pre-wrap focus:outline-none
                              ${isFocused ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20' : 'hover:bg-muted/50 border-2 border-transparent'}
                              ${alignment === 'center' ? 'text-center justify-center' : 
                                alignment === 'right' ? 'text-right justify-end' : 'text-left justify-start'}`}
                            onClick={() => handleCellClick(column)}
                            onDoubleClick={() => handleCellDoubleClick(column)}
                            onKeyDown={(e) => handleKeyDown(e, column)}
                            tabIndex={0}
                          >
                            {localRowData[column] || ''}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default FullScreenDocumentWorkspace;
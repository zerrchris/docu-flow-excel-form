import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { CheckCircle, XCircle, FileText, FileEdit, RefreshCw, Settings } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';

interface BatchRenameResult {
  rowIndex: number;
  originalName: string;
  newName?: string;
  status: 'pending' | 'renaming' | 'success' | 'error';
  error?: string;
}

interface BatchFileRenameDialogProps {
  isOpen: boolean;
  onClose: () => void;
  runsheetId: string;
  columns: string[];
  documentMap: Map<number, DocumentRecord>;
  currentData: Record<string, string>[];
  onDocumentMapUpdate: (documentMap: Map<number, DocumentRecord>) => void;
}

export const BatchFileRenameDialog: React.FC<BatchFileRenameDialogProps> = ({
  isOpen,
  onClose,
  runsheetId,
  columns,
  documentMap,
  currentData,
  onDocumentMapUpdate
}) => {
  const { toast } = useToast();
  const [isRenaming, setIsRenaming] = useState(false);
  const [results, setResults] = useState<BatchRenameResult[]>([]);
  const [progress, setProgress] = useState(0);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [maxParts, setMaxParts] = useState(2);
  const [showSettings, setShowSettings] = useState(false);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(false);
  const [previewNames, setPreviewNames] = useState<Map<number, string>>(new Map());

  // Load user preferences and initialize results when dialog opens
  useEffect(() => {
    if (isOpen && documentMap.size > 0) {
      const initializeDialog = async () => {
        const initialResults: BatchRenameResult[] = [];
        documentMap.forEach((doc, rowIndex) => {
          initialResults.push({
            rowIndex,
            originalName: doc.stored_filename,
            status: 'pending'
          });
        });
        setResults(initialResults.sort((a, b) => a.rowIndex - b.rowIndex));
        setProgress(0);
        
        // Load user's default preferences if not already set
        if (selectedColumns.length === 0) {
          setIsLoadingPreferences(true);
          try {
            const preferences = await ExtractionPreferencesService.getDefaultPreferences();
            
            if (preferences?.columns && preferences.columns.length > 0) {
              // Use user's preferred columns, filtered to those that exist in current runsheet
              const availablePreferredColumns = preferences.columns.filter(col => columns.includes(col));
              setSelectedColumns(availablePreferredColumns.slice(0, 3)); // Limit to 3 for filename
            } else {
              // Fallback to smart defaults if user has no preferences
              const defaultColumns = columns.filter(col => 
                ['name', 'title', 'invoice_number', 'document_number', 'reference'].includes(col.toLowerCase())
              ).slice(0, 3);
              setSelectedColumns(defaultColumns.length > 0 ? defaultColumns : columns.slice(0, 2));
            }
          } catch (error) {
            console.error('Error loading user preferences:', error);
            // Fallback to smart defaults
            const defaultColumns = columns.filter(col => 
              ['name', 'title', 'invoice_number', 'document_number', 'reference'].includes(col.toLowerCase())
            ).slice(0, 3);
            setSelectedColumns(defaultColumns.length > 0 ? defaultColumns : columns.slice(0, 2));
          } finally {
            setIsLoadingPreferences(false);
          }
        }
        
        // Generate preview names after a short delay to ensure state is updated
        setTimeout(() => generatePreviewNames(), 100);
      };
      
      initializeDialog();
    }
  }, [isOpen, documentMap]);

  // Regenerate preview names when settings change
  useEffect(() => {
    if (selectedColumns.length > 0 && !isLoadingPreferences) {
      generatePreviewNames();
    }
  }, [selectedColumns, maxParts]);

  const generatePreviewNames = async () => {
    const newPreviewNames = new Map<number, string>();
    
    documentMap.forEach((doc, rowIndex) => {
      const rowData = currentData[rowIndex] || {};
      const originalFilename = doc.original_filename;
      
      // Generate smart filename based on row data
      const smartName = generateSmartFilename(rowData, originalFilename);
      newPreviewNames.set(rowIndex, smartName);
    });
    
    setPreviewNames(newPreviewNames);
  };

  const generateSmartFilename = (rowData: Record<string, string>, originalFilename: string): string => {
    const filenameParts: string[] = [];
    
    // Get file extension
    const extension = originalFilename.includes('.') 
      ? '.' + originalFilename.split('.').pop() 
      : '';
    
    // Use selected columns in order
    for (const columnName of selectedColumns) {
      const value = rowData[columnName];
      if (value && value.trim() !== '' && !value.toLowerCase().includes('screenshot')) {
        // Clean the value for filename
        const cleanValue = value
          .replace(/[^a-zA-Z0-9\-_\s]/g, '')
          .replace(/\s+/g, '_')
          .substring(0, 30);
        
        if (cleanValue.length > 2) {
          filenameParts.push(cleanValue);
          if (filenameParts.length >= maxParts) break;
        }
      }
    }
    
    // Fallback to row index if no meaningful data
    if (filenameParts.length === 0) {
      return `Document_Row_${rowData.rowIndex || 'Unknown'}${extension}`;
    }
    
    return filenameParts.join('_') + extension;
  };

  const renameDocument = async (document: DocumentRecord, rowIndex: number, newFilename: string): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('documents')
        .update({ stored_filename: newFilename })
        .eq('id', document.id);

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error renaming document:', error);
      throw error;
    }
  };

  const startBatchRename = async () => {
    if (documentMap.size === 0) {
      toast({
        title: "No documents to rename",
        description: "There are no documents linked to this runsheet.",
        variant: "destructive"
      });
      return;
    }

    setIsRenaming(true);
    const controller = new AbortController();
    setAbortController(controller);

    const documentsToRename = Array.from(documentMap.entries());
    const totalDocuments = documentsToRename.length;
    let completedCount = 0;
    const updatedDocumentMap = new Map(documentMap);

    // Add warning for page navigation during renaming
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'File renaming in progress. Are you sure you want to leave?';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    try {
      for (const [rowIndex, document] of documentsToRename) {
        if (controller.signal.aborted) break;

        // Get the new filename using selected columns
        const newFilename = previewNames.get(rowIndex) || document.stored_filename;

        // Skip if name hasn't changed
        if (newFilename === document.stored_filename) {
          setResults(prev => prev.map(result => 
            result.rowIndex === rowIndex 
              ? { ...result, status: 'success', newName: newFilename, error: 'No change needed' }
              : result
          ));
          completedCount++;
          setProgress((completedCount / totalDocuments) * 100);
          continue;
        }

        // Update status to renaming
        setResults(prev => prev.map(result => 
          result.rowIndex === rowIndex 
            ? { ...result, status: 'renaming' }
            : result
        ));

        try {
          await renameDocument(document, rowIndex, newFilename);
          
          // Update the document map
          const updatedDocument = { ...document, stored_filename: newFilename };
          updatedDocumentMap.set(rowIndex, updatedDocument);

          // Update results
          setResults(prev => prev.map(result => 
            result.rowIndex === rowIndex 
              ? { ...result, status: 'success', newName: newFilename }
              : result
          ));
        } catch (error) {
          console.error(`Error renaming document at row ${rowIndex}:`, error);
          setResults(prev => prev.map(result => 
            result.rowIndex === rowIndex 
              ? { ...result, status: 'error', error: error.message }
              : result
          ));
        }

        completedCount++;
        setProgress((completedCount / totalDocuments) * 100);
      }

      if (!controller.signal.aborted) {
        // Update the document map in parent component
        onDocumentMapUpdate(updatedDocumentMap);
        
        const successCount = results.filter(r => r.status === 'success').length;
        const errorCount = results.filter(r => r.status === 'error').length;
        
        toast({
          title: "Batch renaming completed",
          description: `Successfully renamed ${successCount} documents. ${errorCount > 0 ? `${errorCount} failed.` : ''}`,
        });
      }
    } catch (error) {
      console.error('Batch rename error:', error);
      toast({
        title: "Batch renaming failed",
        description: "An error occurred during batch renaming. Please try again.",
        variant: "destructive"
      });
    } finally {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      setIsRenaming(false);
      setAbortController(null);
    }
  };

  const handleAbort = () => {
    if (abortController) {
      abortController.abort();
      setIsRenaming(false);
      toast({
        title: "Renaming cancelled",
        description: "Batch file renaming has been cancelled.",
      });
    }
  };

  const getStatusIcon = (status: BatchRenameResult['status']) => {
    switch (status) {
      case 'pending':
        return <FileText className="w-4 h-4 text-muted-foreground" />;
      case 'renaming':
        return <RefreshCw className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-destructive" />;
    }
  };

  const getStatusText = (status: BatchRenameResult['status']) => {
    switch (status) {
      case 'pending':
        return 'Pending';
      case 'renaming':
        return 'Renaming...';
      case 'success':
        return 'Success';
      case 'error':
        return 'Failed';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileEdit className="w-5 h-5" />
            Batch File Rename
          </DialogTitle>
          <DialogDescription>
            Rename all linked documents using smart naming based on runsheet data.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden">
          {documentMap.size === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No documents found in this runsheet.</p>
              <p className="text-sm">Link some documents first, then try batch renaming.</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                <Collapsible open={showSettings} onOpenChange={setShowSettings}>
                  <CollapsibleTrigger asChild>
                    <Button variant="outline" size="sm" className="flex items-center gap-2">
                      <Settings className="w-4 h-4" />
                      Customize Naming {isLoadingPreferences ? '(Loading preferences...)' : '(Using your defaults)'}
                    </Button>
                  </CollapsibleTrigger>
                  <CollapsibleContent className="mt-4 space-y-4 border rounded-lg p-4">
                    <div className="space-y-3">
                      <div className="text-sm text-muted-foreground mb-3">
                        These settings started with your default extraction preferences and can be customized for this batch rename.
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Columns to use for naming (in order):</Label>
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          {columns.map(column => (
                            <div key={column} className="flex items-center space-x-2">
                              <Checkbox
                                id={`column-${column}`}
                                checked={selectedColumns.includes(column)}
                                disabled={isLoadingPreferences}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedColumns(prev => [...prev, column]);
                                  } else {
                                    setSelectedColumns(prev => prev.filter(c => c !== column));
                                  }
                                }}
                              />
                              <Label htmlFor={`column-${column}`} className="text-sm">
                                {column}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      <div>
                        <Label className="text-sm font-medium">Maximum filename parts:</Label>
                        <Select 
                          value={maxParts.toString()} 
                          onValueChange={(value) => setMaxParts(parseInt(value))}
                          disabled={isLoadingPreferences}
                        >
                          <SelectTrigger className="w-32 mt-1">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">1 part</SelectItem>
                            <SelectItem value="2">2 parts</SelectItem>
                            <SelectItem value="3">3 parts</SelectItem>
                            <SelectItem value="4">4 parts</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        onClick={generatePreviewNames}
                        disabled={isLoadingPreferences}
                        className="mt-2"
                      >
                        Update Preview
                      </Button>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
                
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">
                      Progress: {Math.round(progress)}%
                    </span>
                    <span className="text-sm text-muted-foreground">
                      {results.filter(r => r.status === 'success').length} / {results.length} completed
                    </span>
                  </div>
                  <Progress value={progress} className="w-full" />
                </div>
              </div>

              <ScrollArea className="flex-1 h-[400px] border rounded-md p-4">
                <div className="space-y-2">
                  {results.map((result) => (
                    <div
                      key={result.rowIndex}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3 flex-1">
                        {getStatusIcon(result.status)}
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">Row {result.rowIndex + 1}</p>
                          <p className="text-sm text-muted-foreground truncate">
                            From: {result.originalName}
                          </p>
                          {(result.newName || previewNames.get(result.rowIndex)) && (
                            <p className="text-sm text-primary truncate">
                              To: {result.newName || previewNames.get(result.rowIndex)}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-medium">{getStatusText(result.status)}</p>
                        {result.status === 'error' && result.error && (
                          <p className="text-xs text-destructive max-w-[150px] truncate">
                            {result.error}
                          </p>
                        )}
                        {result.status === 'success' && result.error && (
                          <p className="text-xs text-yellow-600 max-w-[150px] truncate">
                            {result.error}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </>
          )}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onClose} disabled={isRenaming}>
            {isRenaming ? 'Close When Done' : 'Close'}
          </Button>
          
          <div className="flex gap-2">
            {isRenaming && (
              <Button variant="destructive" onClick={handleAbort}>
                Cancel Renaming
              </Button>
            )}
            {!isRenaming && documentMap.size > 0 && (
              <>
                {results.length > 0 && results.every(r => r.status === 'success' || r.status === 'error') ? (
                  <Button onClick={onClose} className="flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Close
                  </Button>
                ) : (
                  <Button onClick={startBatchRename} className="flex items-center gap-2">
                    <FileEdit className="w-4 h-4" />
                    Start Renaming
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
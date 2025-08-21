import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSimpleRunsheet } from '@/hooks/useSimpleRunsheet';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Check, X, ArrowUp, ArrowDown, Save, FolderOpen, Download, Upload, AlignLeft, AlignCenter, AlignRight, Cloud, ChevronDown, FileText, Archive, ExternalLink, AlertTriangle, FileStack, Settings, Eye, EyeOff, Sparkles, Maximize2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GoogleDrivePicker } from './GoogleDrivePicker';
import DocumentUpload from './DocumentUpload';
import DocumentLinker from './DocumentLinker';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import DocumentNamingSettings from './DocumentNamingSettings';
import InlineDocumentViewer from './InlineDocumentViewer';
import ColumnPreferencesDialog from './ColumnPreferencesDialog';
import FullScreenDocumentWorkspace from './FullScreenDocumentWorkspace';
import ViewportPortal from './ViewportPortal';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import DocumentWorkspaceButton from './DocumentWorkspaceButton';
import type { User } from '@supabase/supabase-js';

interface SpreadsheetProps {
  initialColumns: string[];
  initialData: Record<string, string>[];
  onColumnChange: (columns: string[]) => void;
  onDataChange?: (data: Record<string, string>[]) => void;
  onColumnInstructionsChange?: (columnInstructions: Record<string, string>) => void;
  onUnsavedChanges?: (hasUnsavedChanges: boolean) => void;
  missingColumns?: string[];
  initialRunsheetName?: string;
  initialRunsheetId?: string;
  onShowMultipleUpload?: () => void;
  onDocumentMapChange?: (documentMap: Map<number, DocumentRecord>) => void;
}

const SimpleEditableSpreadsheet: React.FC<SpreadsheetProps> = ({ 
  initialColumns, 
  initialData,
  onColumnChange,
  onDataChange,
  onColumnInstructionsChange,
  onUnsavedChanges,
  missingColumns = [],
  initialRunsheetName,
  initialRunsheetId,
  onShowMultipleUpload,
  onDocumentMapChange
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { runsheet, isLoading, isSaving, createRunsheet, loadRunsheet, updateData, updateColumns, updateColumnInstructions, updateName, save: saveRunsheet, lastSavedAt } = useSimpleRunsheet();
  const [user, setUser] = useState<User | null>(null);
  
  // UI state
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [editingRunsheetName, setEditingRunsheetName] = useState<boolean>(false);
  const [tempRunsheetName, setTempRunsheetName] = useState<string>('');
  const [documentMap, setDocumentMap] = useState<Map<number, DocumentRecord>>(new Map());
  const [showColumnPreferencesDialog, setShowColumnPreferencesDialog] = useState(false);
  const [showDocumentNamingDialog, setShowDocumentNamingDialog] = useState(false);
  const [showDocumentFileNameColumn, setShowDocumentFileNameColumn] = useState(true);
  const [inlineViewerRow, setInlineViewerRow] = useState<number | null>(null);
  const [fullScreenWorkspace, setFullScreenWorkspace] = useState<{ runsheetId: string; rowIndex: number } | null>(null);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [savedRunsheets, setSavedRunsheets] = useState<any[]>([]);
  const [showGoogleDrivePicker, setShowGoogleDrivePicker] = useState(false);

  // Get current working data
  const currentColumns = runsheet?.columns || initialColumns;
  const currentData = runsheet?.data || initialData;
  const currentName = runsheet?.name || initialRunsheetName || 'Untitled Runsheet';
  const currentInstructions = runsheet?.columnInstructions || {};
  const currentRunsheetId = runsheet?.id || initialRunsheetId;

  // Initialize user
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Initialize runsheet if ID provided
  useEffect(() => {
    if (initialRunsheetId && !runsheet) {
      loadRunsheet(initialRunsheetId);
    }
  }, [initialRunsheetId, runsheet, loadRunsheet]);

  // Create new runsheet when needed
  const handleCreateNewRunsheet = useCallback(async (name: string) => {
    if (!user) return;
    
    try {
      const runsheetId = await createRunsheet(name, currentColumns, currentInstructions);
      toast({
        title: "Runsheet created",
        description: `Created new runsheet "${name}"`,
        variant: "default"
      });
      return runsheetId;
    } catch (error) {
      console.error('Failed to create runsheet:', error);
    }
  }, [user, createRunsheet, currentColumns, currentInstructions, toast]);

  // Update handlers
  const handleDataChange = useCallback((newData: Record<string, string>[]) => {
    if (runsheet) {
      updateData(newData);
    }
    onDataChange?.(newData);
  }, [runsheet, updateData, onDataChange]);

  const handleColumnChange = useCallback((newColumns: string[]) => {
    if (runsheet) {
      updateColumns(newColumns);
    }
    onColumnChange(newColumns);
  }, [runsheet, updateColumns, onColumnChange]);

  const handleColumnInstructionsChange = useCallback((newInstructions: Record<string, string>) => {
    if (runsheet) {
      updateColumnInstructions(newInstructions);
    }
    onColumnInstructionsChange?.(newInstructions);
  }, [runsheet, updateColumnInstructions, onColumnInstructionsChange]);

  const handleNameChange = useCallback((newName: string) => {
    if (runsheet) {
      updateName(newName);
    }
  }, [runsheet, updateName]);

  // Cell editing
  const handleCellClick = (rowIndex: number, column: string) => {
    setSelectedCell({ rowIndex, column });
    setEditingCell({ rowIndex, column });
    setCellValue(currentData[rowIndex]?.[column] || '');
  };

  const handleCellChange = (value: string) => {
    setCellValue(value);
  };

  const handleCellSave = () => {
    if (editingCell) {
      const newData = [...currentData];
      if (!newData[editingCell.rowIndex]) {
        newData[editingCell.rowIndex] = {};
      }
      newData[editingCell.rowIndex][editingCell.column] = cellValue;
      handleDataChange(newData);
    }
    setEditingCell(null);
    setCellValue('');
  };

  const handleCellCancel = () => {
    setEditingCell(null);
    setCellValue('');
  };

  // Add rows
  const addRows = (count: number) => {
    const newRows = Array.from({ length: count }, () => {
      const row: Record<string, string> = {};
      currentColumns.forEach(col => row[col] = '');
      return row;
    });
    handleDataChange([...currentData, ...newRows]);
  };

  // Column management
  const addColumn = () => {
    const newColumnName = `Column ${currentColumns.length + 1}`;
    const newColumns = [...currentColumns, newColumnName];
    const newData = currentData.map(row => ({ ...row, [newColumnName]: '' }));
    handleColumnChange(newColumns);
    handleDataChange(newData);
  };

  const deleteColumn = (columnToDelete: string) => {
    const newColumns = currentColumns.filter(col => col !== columnToDelete);
    const newData = currentData.map(row => {
      const { [columnToDelete]: _, ...rest } = row;
      return rest;
    });
    handleColumnChange(newColumns);
    handleDataChange(newData);
  };

  // Export functionality
  const exportToExcel = () => {
    const worksheet = XLSX.utils.json_to_sheet(currentData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Runsheet');
    XLSX.writeFile(workbook, `${currentName}.xlsx`);
  };

  // Save runsheets list
  const loadSavedRunsheets = async () => {
    if (!user) return;
    
    try {
      const { data, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSavedRunsheets(data || []);
    } catch (error) {
      console.error('Failed to load runsheets:', error);
    }
  };

  const openRunsheet = async (runsheetToOpen: any) => {
    try {
      await loadRunsheet(runsheetToOpen.id);
      setShowOpenDialog(false);
      
      toast({
        title: "Runsheet opened",
        description: `Opened "${runsheetToOpen.name}"`,
        variant: "default"
      });
    } catch (error) {
      console.error('Failed to open runsheet:', error);
    }
  };

  // Document map update helper
  const updateDocumentMapHelper = (newMap: Map<number, DocumentRecord>) => {
    setDocumentMap(newMap);
    onDocumentMapChange?.(newMap);
  };

  return (
    <div className="w-full space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          {editingRunsheetName ? (
            <div className="flex items-center space-x-2">
              <Input
                value={tempRunsheetName}
                onChange={(e) => setTempRunsheetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNameChange(tempRunsheetName);
                    setEditingRunsheetName(false);
                  } else if (e.key === 'Escape') {
                    setEditingRunsheetName(false);
                    setTempRunsheetName('');
                  }
                }}
                autoFocus
                className="text-xl font-bold"
              />
              <Button
                size="sm"
                onClick={() => {
                  handleNameChange(tempRunsheetName);
                  setEditingRunsheetName(false);
                }}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingRunsheetName(false);
                  setTempRunsheetName('');
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <h1 
              className="text-xl font-bold cursor-pointer hover:text-blue-600"
              onClick={() => {
                setTempRunsheetName(currentName);
                setEditingRunsheetName(true);
              }}
            >
              {currentName}
            </h1>
          )}
          
          <AutoSaveIndicator
            status={isSaving ? 'saving' : (lastSavedAt ? 'saved' : 'idle')}
            lastSavedAt={lastSavedAt}
          />
        </div>

        <div className="flex items-center space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              loadSavedRunsheets();
              setShowOpenDialog(true);
            }}
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            Open
          </Button>
          
          <Button
            variant="outline"
            size="sm"
            onClick={exportToExcel}
          >
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnPreferencesDialog(true)}
          >
            <Settings className="h-4 w-4 mr-2" />
            Columns
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDocumentNamingDialog(true)}
          >
            <FileText className="h-4 w-4 mr-2" />
            Document Settings
          </Button>
        </div>
      </div>

      {/* Spreadsheet */}
      <Card className="p-4">
        <div className="overflow-auto max-h-[600px]">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-background">
              <tr>
                <th className="border p-2 bg-muted text-left w-12">#</th>
                {showDocumentFileNameColumn && (
                  <th className="border p-2 bg-muted text-left min-w-[200px]">
                    Document File Name
                  </th>
                )}
                {currentColumns.map((column) => (
                  <th key={column} className="border p-2 bg-muted text-left min-w-[150px]">
                    <div className="flex items-center justify-between">
                      <span>{column}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent>
                          <DropdownMenuItem onClick={() => deleteColumn(column)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete Column
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </th>
                ))}
                <th className="border p-2 bg-muted text-left w-12">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addColumn}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </th>
              </tr>
            </thead>
            <tbody>
              {currentData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  <td className="border p-2 bg-muted text-center">{rowIndex + 1}</td>
                  {showDocumentFileNameColumn && (
                    <td className="border p-1 relative">
                      <DocumentLinker
                        runsheetId={currentRunsheetId || ''}
                        rowIndex={rowIndex}
                        onDocumentLinked={(filename) => {
                          // Update document map when document is linked
                          const newMap = new Map(documentMap);
                          // This is a simplified version - you may need to create a proper DocumentRecord
                           newMap.set(rowIndex, {
                             id: '',
                             original_filename: filename,
                             stored_filename: filename,
                             file_path: '',
                             file_size: null,
                             content_type: null,
                             row_index: rowIndex,
                             runsheet_id: currentRunsheetId || '',
                             user_id: user?.id || '',
                             created_at: new Date().toISOString(),
                             updated_at: new Date().toISOString()
                           } as any);
                          updateDocumentMapHelper(newMap);
                        }}
                        onDocumentRemoved={() => {
                          const newMap = new Map(documentMap);
                          newMap.delete(rowIndex);
                          updateDocumentMapHelper(newMap);
                        }}
                      />
                    </td>
                  )}
                  {currentColumns.map((column) => (
                    <td key={column} className="border p-1">
                      {editingCell?.rowIndex === rowIndex && editingCell?.column === column ? (
                        <div className="flex items-center space-x-1">
                          <Textarea
                            value={cellValue}
                            onChange={(e) => handleCellChange(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleCellSave();
                              } else if (e.key === 'Escape') {
                                handleCellCancel();
                              }
                            }}
                            className="min-h-[32px] resize-none"
                            autoFocus
                          />
                          <div className="flex flex-col space-y-1">
                            <Button size="sm" onClick={handleCellSave}>
                              <Check className="h-3 w-3" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={handleCellCancel}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="min-h-[32px] p-2 cursor-pointer hover:bg-muted/50 whitespace-pre-wrap"
                          onClick={() => handleCellClick(rowIndex, column)}
                        >
                          {row[column] || ''}
                        </div>
                      )}
                    </td>
                  ))}
                  <td className="border p-2 text-center">
                    <div className="flex items-center space-x-1">
                      {documentMap.has(rowIndex) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setInlineViewerRow(rowIndex)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setFullScreenWorkspace({ 
                              runsheetId: currentRunsheetId || '', 
                              rowIndex 
                            })}
                          >
                            <Maximize2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addRows(10)}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add 10 Rows
            </Button>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Simple upload button - you can enhance this later
                toast({
                  title: "Upload",
                  description: "Document upload functionality",
                  variant: "default"
                });
              }}
            >
              <Upload className="h-4 w-4 mr-2" />
              Upload Documents
            </Button>
          </div>

          <div className="text-sm text-muted-foreground">
            {currentData.filter(row => Object.values(row).some(value => value.trim())).length} / {currentData.length} rows with data
          </div>
        </div>
      </Card>

      {/* Dialogs */}
      <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Open Runsheet</DialogTitle>
            <DialogDescription>
              Select a runsheet to open
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {savedRunsheets.map((runsheet) => (
              <div
                key={runsheet.id}
                className="flex items-center justify-between p-2 border rounded cursor-pointer hover:bg-muted"
                onClick={() => openRunsheet(runsheet)}
              >
                <div>
                  <div className="font-medium">{runsheet.name}</div>
                  <div className="text-sm text-muted-foreground">
                    Updated: {new Date(runsheet.updated_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showColumnPreferencesDialog} onOpenChange={setShowColumnPreferencesDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Column Preferences</DialogTitle>
            <DialogDescription>
              Configure your columns and extraction instructions
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Columns</Label>
              <div className="space-y-2">
                {currentColumns.map((column, index) => (
                  <div key={column} className="flex items-center space-x-2">
                    <Input
                      value={column}
                      onChange={(e) => {
                        const newColumns = [...currentColumns];
                        newColumns[index] = e.target.value;
                        handleColumnChange(newColumns);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteColumn(column)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button onClick={addColumn}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Column
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showDocumentNamingDialog} onOpenChange={setShowDocumentNamingDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Document Naming Settings</DialogTitle>
            <DialogDescription>
              Configure how documents are automatically named
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <p>Document naming settings will be configured here.</p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Document viewer - simplified for now */}
      {inlineViewerRow !== null && (
        <Dialog open={true} onOpenChange={() => setInlineViewerRow(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Document Viewer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>Document viewer for row {inlineViewerRow + 1}</p>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Full screen workspace - simplified for now */}
      {fullScreenWorkspace && (
        <ViewportPortal>
          <div className="fixed inset-0 bg-background z-50 p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">Document Workspace - Row {fullScreenWorkspace.rowIndex + 1}</h2>
              <Button onClick={() => setFullScreenWorkspace(null)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="bg-muted p-4 rounded">
              <p>Full screen document workspace will be implemented here.</p>
            </div>
          </div>
        </ViewportPortal>
      )}

      {/* Google Drive Picker - simplified for now */}
      {showGoogleDrivePicker && (
        <Dialog open={true} onOpenChange={() => setShowGoogleDrivePicker(false)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Google Drive</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p>Google Drive integration will be available here.</p>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
};

export default SimpleEditableSpreadsheet;
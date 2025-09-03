import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Download, Upload, FileText, Settings, ChevronDown, Trash2, GripVertical, RefreshCw, Save, Copy, Camera, Mic, MicOff, FolderOpen, X, Loader2, AlertCircle, Grid3X3, Users, FileUp, Link, Zap, Eye, EyeOff, MoreHorizontal, Combine, Columns3, ArrowUp, ArrowDown, Paintbrush, AlignLeft, AlignCenter, AlignRight, Clock, CheckCircle, XCircle, Move, Type, Hash, Calendar, RotateCcw, MousePointer, KeyRound, User, Info, HelpCircle, Database, FileX, Ban, Undo2, Pause, Play } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { useAutoSave } from '@/hooks/useAutoSave';

// Define common types
interface DocumentRecord {
  id: string;
  runsheet_id: string;
  user_id: string;
  original_filename: string;
  stored_filename: string;
  file_path: string;
  content_type: string | null;
  file_size: number | null;
  row_index: number;
  created_at: string;
  updated_at: string;
}

interface EditableSpreadsheetProps {
  initialColumns?: string[];
  initialData?: Record<string, string>[];
  onColumnChange?: (newColumns: string[]) => void;
  onDataChange?: (data: Record<string, string>[]) => void;
  onColumnInstructionsChange?: (instructions: Record<string, string>) => void;
  onUnsavedChanges?: (hasChanges: boolean) => void;
  missingColumns?: string[];
  currentRunsheet?: any;
  setCurrentRunsheet?: any;
  onShowMultipleUpload?: () => void;
  onBackToRunsheet?: () => void;
  onDocumentMapChange?: (newDocumentMap: Map<number, any>) => void;
  [key: string]: any; // Accept any additional props for now
}

const EditableSpreadsheet: React.FC<EditableSpreadsheetProps> = ({
  initialColumns = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'],
  initialData = [],
  onColumnChange,
  onDataChange,
  onColumnInstructionsChange,
  onUnsavedChanges,
  missingColumns = [],
  currentRunsheet,
  setCurrentRunsheet,
  onShowMultipleUpload,
  onBackToRunsheet,
  onDocumentMapChange,
  ...props
}) => {
  // State management
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [data, setData] = useState<Record<string, string>[]>(initialData);
  const [runsheetName, setRunsheetName] = useState('Untitled Runsheet');
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [documentMap, setDocumentMap] = useState<Map<number, DocumentRecord>>(new Map());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Dialog states
  const [showAddRowsDialog, setShowAddRowsDialog] = useState(false);
  const [rowsToAdd, setRowsToAdd] = useState<number>(1);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [editingColumnName, setEditingColumnName] = useState<string>('');
  const [editingColumnInstructions, setEditingColumnInstructions] = useState<string>('');

  // Auto-save
  const user = { id: 'temp-user' }; // Temporary user for now
  
  const { save: autoSave, forceSave: autoForceSave, isSaving: autoSaving } = useAutoSave({
    runsheetId: currentRunsheet?.id || null,
    runsheetName: runsheetName !== 'Untitled Runsheet' ? runsheetName : (currentRunsheet?.name || 'Untitled Runsheet'),
    columns,
    data,
    columnInstructions,
    userId: user?.id,
    debounceMs: 3000,
    onSaveStart: () => {
      setHasUnsavedChanges(false);
    },
    onSaveSuccess: (result) => {
      setHasUnsavedChanges(false);
      if (result && setCurrentRunsheet) {
        setCurrentRunsheet({
          id: result.id,
          name: result.name,
          data: result.data,
          columns: result.columns,
          columnInstructions: result.column_instructions
        });
      }
    },
    onSaveError: (error) => {
      console.error('Auto-save failed:', error);
    }
  });

  // Initialize data if empty
  useEffect(() => {
    if (data.length === 0) {
      const emptyRows = Array.from({ length: 10 }, () => {
        const row: Record<string, string> = {};
        columns.forEach(col => row[col] = '');
        return row;
      });
      setData(emptyRows);
    }
  }, []);

  // Load initial data from props
  useEffect(() => {
    if (initialData && initialData.length > 0) {
      setData(initialData);
    }
    if (initialColumns && initialColumns.length > 0) {
      setColumns(initialColumns);
    }
  }, [initialData, initialColumns]);

  // Update runsheet name from current runsheet
  useEffect(() => {
    if (currentRunsheet?.name && currentRunsheet.name !== 'Untitled Runsheet') {
      setRunsheetName(currentRunsheet.name);
    }
  }, [currentRunsheet?.name]);

  // Add rows function
  const addRows = () => {
    const newRows = Array.from({ length: rowsToAdd }, () => {
      const row: Record<string, string> = {};
      columns.forEach(col => row[col] = '');
      return row;
    });
    setData(prev => [...prev, ...newRows]);
    setHasUnsavedChanges(true);
    setShowAddRowsDialog(false);
    setRowsToAdd(1);
    onDataChange?.([...data, ...newRows]);
  };

  // Handle cell changes
  const handleCellChange = useCallback((rowIndex: number, column: string, value: string) => {
    setData(prev => {
      const newData = [...prev];
      if (!newData[rowIndex]) {
        newData[rowIndex] = {};
      }
      newData[rowIndex][column] = value;
      return newData;
    });
    setHasUnsavedChanges(true);
    onDataChange?.(data);
  }, [data, onDataChange]);

  // Start editing a cell
  const startEditing = (rowIndex: number, column: string) => {
    setEditingCell({ rowIndex, column });
    setCellValue(data[rowIndex]?.[column] || '');
    setSelectedCell({ rowIndex, column });
  };

  // Save cell edit
  const saveCellEdit = () => {
    if (editingCell) {
      handleCellChange(editingCell.rowIndex, editingCell.column, cellValue);
      setEditingCell(null);
      setCellValue('');
    }
  };

  // Cancel cell edit
  const cancelCellEdit = () => {
    setEditingCell(null);
    setCellValue('');
  };

  // Handle key press in cell
  const handleCellKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveCellEdit();
    } else if (e.key === 'Escape') {
      cancelCellEdit();
    }
  };

  // Open column dialog
  const openColumnDialog = (column: string) => {
    setSelectedColumn(column);
    setEditingColumnName(column);
    setEditingColumnInstructions(columnInstructions[column] || '');
    setShowColumnDialog(true);
  };

  // Save column changes
  const saveColumnChanges = () => {
    if (selectedColumn !== editingColumnName && editingColumnName.trim()) {
      // Rename column
      const newColumns = columns.map(col => col === selectedColumn ? editingColumnName.trim() : col);
      setColumns(newColumns);
      
      // Update data with renamed column
      const newData = data.map(row => {
        const newRow = { ...row };
        if (row[selectedColumn] !== undefined) {
          newRow[editingColumnName.trim()] = row[selectedColumn];
          delete newRow[selectedColumn];
        }
        return newRow;
      });
      setData(newData);
      
      // Update column instructions
      const newInstructions = { ...columnInstructions };
      if (newInstructions[selectedColumn]) {
        newInstructions[editingColumnName.trim()] = newInstructions[selectedColumn];
        delete newInstructions[selectedColumn];
      }
      if (editingColumnInstructions.trim()) {
        newInstructions[editingColumnName.trim()] = editingColumnInstructions.trim();
      }
      setColumnInstructions(newInstructions);
      
      onColumnChange?.(newColumns);
      onColumnInstructionsChange?.(newInstructions);
    } else if (editingColumnInstructions.trim() !== (columnInstructions[selectedColumn] || '')) {
      // Update instructions only
      const newInstructions = {
        ...columnInstructions,
        [selectedColumn]: editingColumnInstructions.trim()
      };
      setColumnInstructions(newInstructions);
      onColumnInstructionsChange?.(newInstructions);
    }
    
    setHasUnsavedChanges(true);
    setShowColumnDialog(false);
  };

  return (
    <div className="mt-6" data-spreadsheet-container>
      <div className="flex flex-col space-y-4 px-6">
        {/* Header */}
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Runsheet</h3>
            <span className="text-muted-foreground">•</span>
            <button
              onClick={() => {/* Handle runsheet name editing */}}
              className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
            >
              {runsheetName}
            </button>
            
            {/* Auto-save status */}
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {hasUnsavedChanges ? (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                  <span>Unsaved changes</span>
                </div>
              ) : (
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-green-500 rounded-full" />
                  <span>Saved</span>
                </div>
              )}
              
              <div className="flex items-center gap-1 ml-2 px-2 py-1 bg-muted rounded text-xs">
                <span>{data.length} rows</span>
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {/* Add Rows Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2">
                  <Plus className="h-4 w-4" />
                  Add Rows
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowAddRowsDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Rows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Save button */}
            <Button 
              onClick={() => autoForceSave()}
              variant="default" 
              size="sm" 
              disabled={autoSaving}
              className="gap-2"
            >
              {autoSaving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save
            </Button>
          </div>
        </div>

        {/* Table container */}
        <div className="border rounded-lg overflow-hidden bg-background">
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12 text-center">#</TableHead>
                  {columns.map((column) => (
                    <TableHead 
                      key={column}
                      className="min-w-[150px] cursor-pointer hover:bg-muted/50"
                      onClick={() => openColumnDialog(column)}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{column}</span>
                        {missingColumns.includes(column) && (
                          <Badge variant="destructive" className="ml-2 text-xs">
                            Missing
                          </Badge>
                        )}
                      </div>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    <TableCell className="text-center text-muted-foreground font-mono">
                      {rowIndex + 1}
                    </TableCell>
                    {columns.map((column) => (
                      <TableCell key={column} className="p-0">
                        {editingCell?.rowIndex === rowIndex && editingCell?.column === column ? (
                          <Textarea
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            onBlur={saveCellEdit}
                            onKeyDown={handleCellKeyPress}
                            className="min-h-[40px] border-0 resize-none focus:ring-2 focus:ring-primary"
                            autoFocus
                          />
                        ) : (
                          <div
                            className="min-h-[40px] p-3 cursor-text hover:bg-muted/50 transition-colors"
                            onClick={() => startEditing(rowIndex, column)}
                          >
                            {row[column] || ''}
                          </div>
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Add Rows Dialog */}
      <Dialog open={showAddRowsDialog} onOpenChange={setShowAddRowsDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Add Rows</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label htmlFor="rows" className="text-right">Rows</label>
              <Input
                id="rows"
                type="number"
                value={rowsToAdd}
                onChange={(e) => setRowsToAdd(Math.max(1, parseInt(e.target.value) || 1))}
                className="col-span-3"
                min="1"
                max="100"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddRowsDialog(false)}>
              Cancel
            </Button>
            <Button onClick={addRows}>Add Rows</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Column Edit Dialog */}
      <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Edit Column</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="columnName">Column Name</label>
              <Input
                id="columnName"
                value={editingColumnName}
                onChange={(e) => setEditingColumnName(e.target.value)}
                placeholder="Enter column name"
              />
            </div>
            <div className="grid gap-2">
              <label htmlFor="columnInstructions">Extraction Instructions</label>
              <Textarea
                id="columnInstructions"
                value={editingColumnInstructions}
                onChange={(e) => setEditingColumnInstructions(e.target.value)}
                placeholder="Enter instructions for data extraction..."
                rows={4}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowColumnDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveColumnChanges}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EditableSpreadsheet;
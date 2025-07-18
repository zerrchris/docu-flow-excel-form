import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Check, X, ArrowUp, ArrowDown, Save, FolderOpen } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from '@/lib/supabase';
import { useToast } from '@/hooks/use-toast';
import type { User } from '@supabase/supabase-js';

interface SpreadsheetProps {
  initialColumns: string[];
  initialData: Record<string, string>[];
  onColumnChange: (columns: string[]) => void;
}

const EditableSpreadsheet: React.FC<SpreadsheetProps> = ({ 
  initialColumns, 
  initialData,
  onColumnChange
}) => {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [savedRunsheets, setSavedRunsheets] = useState<any[]>([]);
  const [runsheetName, setRunsheetName] = useState<string>('Untitled Runsheet');
  const [editingRunsheetName, setEditingRunsheetName] = useState<boolean>(false);
  const [tempRunsheetName, setTempRunsheetName] = useState<string>('');
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [data, setData] = useState<Record<string, string>[]>(() => {
    // Ensure we always have at least 20 rows
    const minRows = 20;
    const existingRows = initialData.length;
    const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
    return [...initialData, ...emptyRows];
  });
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [editingHeader, setEditingHeader] = useState<string | null>(null);
  const [headerValue, setHeaderValue] = useState<string>('');
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [resizing, setResizing] = useState<{column: string, startX: number, startWidth: number} | null>(null);
  const [showAddRowsDialog, setShowAddRowsDialog] = useState(false);
  const [rowsToAdd, setRowsToAdd] = useState<number>(1);
  const [spreadsheetHeight, setSpreadsheetHeight] = useState<number>(768); // 768px = twice the original height
  const [resizingHeight, setResizingHeight] = useState<{startY: number, startHeight: number} | null>(null);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const headerInputRef = useRef<HTMLInputElement>(null);

  // Sync data with initialData prop changes
  useEffect(() => {
    const minRows = 20;
    const existingRows = initialData.length;
    const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
    setData([...initialData, ...emptyRows]);
  }, [initialData, initialColumns]);

  // Check user authentication status
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY) {
          const { data: { session } } = await supabase.auth.getSession();
          setUser(session?.user ?? null);

          const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
          });

          return () => subscription.unsubscribe();
        }
      } catch (error) {
        console.warn('Auth initialization failed in spreadsheet:', error);
      }
    };

    initAuth();
  }, []);

  // Save runsheet to Supabase
  const saveRunsheet = async () => {
    console.log('Save button clicked!');
    console.log('User state:', user);
    console.log('Runsheet name:', runsheetName);
    console.log('Columns:', columns);
    console.log('Data:', data);

    if (!user) {
      console.log('No user - showing auth required toast');
      toast({
        title: "Authentication required",
        description: "Please sign in to save your runsheet.",
        variant: "destructive",
      });
      return;
    }

    console.log('Starting save process...');
    setIsSaving(true);
    
    try {
      // Check if Supabase is configured
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        throw new Error('Supabase not configured - using demo mode');
      }

      console.log('Attempting to save to database...');
      const { error } = await supabase
        .from('runsheets')
        .upsert({
          name: runsheetName,
          columns: columns,
          data: data,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,name'
        });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Save successful!');
      toast({
        title: "Runsheet saved",
        description: `"${runsheetName}" has been saved successfully.`,
      });
    } catch (error: any) {
      console.error('Save failed:', error);
      toast({
        title: "Failed to save runsheet",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      console.log('Save process completed');
    }
  };

  // Fetch saved runsheets from Supabase
  const fetchSavedRunsheets = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to view saved runsheets.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
        throw new Error('Supabase not configured - using demo mode');
      }

      const { data: runsheets, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      setSavedRunsheets(runsheets || []);
      setShowOpenDialog(true);
    } catch (error: any) {
      toast({
        title: "Failed to load runsheets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Load a saved runsheet
  const loadRunsheet = (runsheet: any) => {
    setRunsheetName(runsheet.name);
    setColumns(runsheet.columns);
    onColumnChange(runsheet.columns);
    setData(runsheet.data);
    setShowOpenDialog(false);
    
    toast({
      title: "Runsheet loaded",
      description: `"${runsheet.name}" has been loaded successfully.`,
    });
  };

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingCell]);

  // Auto-focus header input when editing starts
  useEffect(() => {
    if (editingHeader && headerInputRef.current) {
      headerInputRef.current.focus();
      headerInputRef.current.select();
    }
  }, [editingHeader]);

  // Auto-start editing when a cell is selected and user types
  useEffect(() => {
    if (selectedCell && !editingCell) {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          startEditing(selectedCell.rowIndex, selectedCell.column, e.key);
          e.preventDefault();
        }
      };
      
      document.addEventListener('keydown', handleGlobalKeyDown);
      return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [selectedCell, editingCell]);

  // Column resizing functions
  const getColumnWidth = (column: string) => {
    return columnWidths[column] || 120; // default width
  };

  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = getColumnWidth(column);
    setResizing({ column, startX, startWidth });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizing) {
        const deltaX = e.clientX - resizing.startX;
        const newWidth = Math.max(80, resizing.startWidth + deltaX);
        setColumnWidths(prev => ({
          ...prev,
          [resizing.column]: newWidth
        }));
      }
      
      if (resizingHeight) {
        const deltaY = e.clientY - resizingHeight.startY;
        const newHeight = Math.max(200, Math.min(800, resizingHeight.startHeight + deltaY));
        setSpreadsheetHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
      setResizingHeight(null);
    };

    if (resizing || resizingHeight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizing, resizingHeight]);

  // Header editing functions
  const startEditingHeader = (columnName: string) => {
    setEditingHeader(columnName);
    setHeaderValue(columnName);
  };

  const saveHeaderEdit = () => {
    if (editingHeader && headerValue.trim() && !columns.includes(headerValue.trim()) || headerValue.trim() === editingHeader) {
      const updatedColumns = columns.map(col => col === editingHeader ? headerValue.trim() : col);
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Update data to use new column name
      const updatedData = data.map(row => {
        if (editingHeader in row && headerValue.trim() !== editingHeader) {
          const newRow = { ...row };
          newRow[headerValue.trim()] = newRow[editingHeader];
          delete newRow[editingHeader];
          return newRow;
        }
        return row;
      });
      setData(updatedData);
      
      setEditingHeader(null);
      setHeaderValue('');
    }
  };

  const cancelHeaderEdit = () => {
    setEditingHeader(null);
    setHeaderValue('');
  };

  // Runsheet name editing functions
  const startEditingRunsheetName = () => {
    setEditingRunsheetName(true);
    setTempRunsheetName(runsheetName);
  };

  const saveRunsheetNameEdit = () => {
    if (tempRunsheetName.trim()) {
      setRunsheetName(tempRunsheetName.trim());
    }
    setEditingRunsheetName(false);
    setTempRunsheetName('');
  };

  const cancelRunsheetNameEdit = () => {
    setEditingRunsheetName(false);
    setTempRunsheetName('');
  };

  // Column management
  const insertColumnBefore = (columnName: string) => {
    const newColumnName = prompt("Enter new column name");
    if (newColumnName && !columns.includes(newColumnName)) {
      const columnIndex = columns.indexOf(columnName);
      const updatedColumns = [
        ...columns.slice(0, columnIndex),
        newColumnName,
        ...columns.slice(columnIndex)
      ];
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Add the new column to all data rows
      const updatedData = data.map(row => {
        const newRow = { ...row };
        // Reorder the object to maintain column order
        return updatedColumns.reduce((acc, col) => {
          acc[col] = newRow[col] || '';
          return acc;
        }, {} as Record<string, string>);
      });
      setData(updatedData);
    }
  };

  const insertColumnAfter = (columnName: string) => {
    const newColumnName = prompt("Enter new column name");
    if (newColumnName && !columns.includes(newColumnName)) {
      const columnIndex = columns.indexOf(columnName);
      const updatedColumns = [
        ...columns.slice(0, columnIndex + 1),
        newColumnName,
        ...columns.slice(columnIndex + 1)
      ];
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Add the new column to all data rows
      const updatedData = data.map(row => {
        const newRow = { ...row };
        // Reorder the object to maintain column order
        return updatedColumns.reduce((acc, col) => {
          acc[col] = newRow[col] || '';
          return acc;
        }, {} as Record<string, string>);
      });
      setData(updatedData);
    }
  };

  const removeColumn = (columnToRemove: string) => {
    if (columns.length > 1) {
      const updatedColumns = columns.filter(col => col !== columnToRemove);
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Remove data for this column
      const updatedData = data.map(row => {
        const newRow = {...row};
        delete newRow[columnToRemove];
        return newRow;
      });
      setData(updatedData);
    }
  };

  // Column drag and drop functions
  const handleDragStart = (e: React.DragEvent, column: string) => {
    setDraggedColumn(column);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', column);
  };

  const handleDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(column);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    
    if (draggedColumn && draggedColumn !== targetColumn) {
      const draggedIndex = columns.indexOf(draggedColumn);
      const targetIndex = columns.indexOf(targetColumn);
      
      // Create new column order
      const newColumns = [...columns];
      newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, draggedColumn);
      
      setColumns(newColumns);
      onColumnChange(newColumns);
      
      // Reorder data to match new column order
      const updatedData = data.map(row => {
        return newColumns.reduce((acc, col) => {
          acc[col] = row[col] || '';
          return acc;
        }, {} as Record<string, string>);
      });
      setData(updatedData);
    }
    
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  // Cell editing functions
  const selectCell = (rowIndex: number, column: string) => {
    setSelectedCell({ rowIndex, column });
    // Automatically start editing when selecting a cell
    startEditing(rowIndex, column, data[rowIndex]?.[column] || '');
  };

  const startEditing = useCallback((rowIndex: number, column: string, value: string) => {
    setEditingCell({ rowIndex, column });
    setCellValue(value);
    setSelectedCell({ rowIndex, column });
  }, []);

  const saveEdit = useCallback(() => {
    if (editingCell) {
      const newData = [...data];
      newData[editingCell.rowIndex] = {
        ...newData[editingCell.rowIndex],
        [editingCell.column]: cellValue
      };
      setData(newData);
      setEditingCell(null);
    }
  }, [editingCell, cellValue, data]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setCellValue('');
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, column: string) => {
    const columnIndex = columns.indexOf(column);
    
    switch (e.key) {
      case 'Enter':
        if (editingCell) {
          saveEdit();
        } else {
          startEditing(rowIndex, column, data[rowIndex]?.[column] || '');
        }
        e.preventDefault();
        break;
        
      case 'Escape':
        if (editingCell) {
          cancelEdit();
        }
        e.preventDefault();
        break;
        
      case 'Tab':
        e.preventDefault();
        if (editingCell) {
          saveEdit();
        }
        
        const nextColumnIndex = e.shiftKey ? columnIndex - 1 : columnIndex + 1;
        let nextRowIndex = rowIndex;
        let nextColumn = columns[nextColumnIndex];
        
        if (nextColumnIndex >= columns.length) {
          nextColumn = columns[0];
          nextRowIndex = Math.min(rowIndex + 1, data.length - 1);
        } else if (nextColumnIndex < 0) {
          nextColumn = columns[columns.length - 1];
          nextRowIndex = Math.max(rowIndex - 1, 0);
        }
        
        if (nextColumn && nextRowIndex >= 0 && nextRowIndex < data.length) {
          selectCell(nextRowIndex, nextColumn);
          // Auto-start editing the next cell
          setTimeout(() => {
            startEditing(nextRowIndex, nextColumn, data[nextRowIndex]?.[nextColumn] || '');
          }, 0);
        }
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        if (editingCell) return;
        if (rowIndex > 0) {
          selectCell(rowIndex - 1, column);
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (editingCell) return;
        if (rowIndex < data.length - 1) {
          selectCell(rowIndex + 1, column);
        }
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (editingCell) return;
        if (columnIndex > 0) {
          selectCell(rowIndex, columns[columnIndex - 1]);
        }
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (editingCell) return;
        if (columnIndex < columns.length - 1) {
          selectCell(rowIndex, columns[columnIndex + 1]);
        }
        break;
        
      case 'Delete':
      case 'Backspace':
        if (!editingCell && selectedCell?.rowIndex === rowIndex && selectedCell?.column === column) {
          const newData = [...data];
          newData[rowIndex] = {
            ...newData[rowIndex],
            [column]: ''
          };
          setData(newData);
          e.preventDefault();
        }
        break;
        
      default:
        if (!editingCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          startEditing(rowIndex, column, e.key);
          e.preventDefault();
        }
        break;
    }
  }, [columns, data, editingCell, selectedCell, saveEdit, cancelEdit, startEditing]);

  // Handle input key events during editing
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      saveEdit();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      cancelEdit();
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      saveEdit();
      
      if (editingCell) {
        const columnIndex = columns.indexOf(editingCell.column);
        const nextColumnIndex = e.shiftKey ? columnIndex - 1 : columnIndex + 1;
        let nextRowIndex = editingCell.rowIndex;
        let nextColumn = columns[nextColumnIndex];
        
        if (nextColumnIndex >= columns.length) {
          nextColumn = columns[0];
          nextRowIndex = Math.min(editingCell.rowIndex + 1, data.length - 1);
        } else if (nextColumnIndex < 0) {
          nextColumn = columns[columns.length - 1];
          nextRowIndex = Math.max(editingCell.rowIndex - 1, 0);
        }
        
        if (nextColumn && nextRowIndex >= 0 && nextRowIndex < data.length) {
          setTimeout(() => {
            selectCell(nextRowIndex, nextColumn);
            startEditing(nextRowIndex, nextColumn, data[nextRowIndex]?.[nextColumn] || '');
          }, 0);
        }
      }
    }
  }, [saveEdit, cancelEdit, editingCell, columns, data, selectCell, startEditing]);

  const deleteRow = (index: number) => {
    const newData = [...data];
    newData.splice(index, 1);
    setData(newData);
  };

  // Add rows function
  const addRows = () => {
    const newRows = Array.from({ length: rowsToAdd }, () => {
      const row: Record<string, string> = {};
      columns.forEach(col => row[col] = '');
      return row;
    });
    setData(prev => [...prev, ...newRows]);
    setShowAddRowsDialog(false);
    setRowsToAdd(1);
  };

  // Height resizing function
  const handleHeightMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = spreadsheetHeight;
    setResizingHeight({ startY, startHeight });
  };

  return (
    <Card className="p-6 mt-6">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Runsheet</h3>
            <span className="text-muted-foreground">•</span>
            {editingRunsheetName ? (
              <Input
                value={tempRunsheetName}
                onChange={(e) => setTempRunsheetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveRunsheetNameEdit();
                    e.preventDefault();
                  } else if (e.key === 'Escape') {
                    cancelRunsheetNameEdit();
                    e.preventDefault();
                  }
                }}
                onBlur={saveRunsheetNameEdit}
                className="h-7 text-sm font-medium min-w-[200px] max-w-[300px]"
                autoFocus
              />
            ) : (
              <button
                onClick={startEditingRunsheetName}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                {runsheetName}
              </button>
            )}
            {/* Save Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={saveRunsheet}
              disabled={isSaving || !user}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            
            {/* Open Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={fetchSavedRunsheets}
              disabled={isLoading || !user}
              className="gap-2"
            >
              <FolderOpen className="h-4 w-4" />
              {isLoading ? 'Loading...' : 'Open'}
            </Button>
          </div>
          <div className="text-sm text-muted-foreground">
            Right-click column headers to insert or remove columns
          </div>
        </div>

        {/* Fixed height container with scrolling and resize handle */}
        <div 
          className="border rounded-md flex flex-col bg-background relative"
          style={{ height: `${spreadsheetHeight}px` }}
        >
          {/* Single scrollable container for both header and body */}
          <div className="flex-1 overflow-auto">
            <Table className="border-collapse">
              {/* Sticky Header */}
              <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm border-b">
                <TableRow className="hover:bg-muted/50">
                  {columns.map((column) => (
                     <TableHead 
                       key={column}
                       className={`font-bold text-center border-r border-border relative p-0 last:border-r-0 cursor-move
                         ${draggedColumn === column ? 'opacity-50' : ''} 
                         ${dragOverColumn === column ? 'bg-primary/20' : ''}`}
                       style={{ width: `${getColumnWidth(column)}px`, minWidth: `${getColumnWidth(column)}px` }}
                       draggable
                       onDragStart={(e) => handleDragStart(e, column)}
                       onDragOver={(e) => handleDragOver(e, column)}
                       onDragLeave={handleDragLeave}
                       onDrop={(e) => handleDrop(e, column)}
                       onDragEnd={handleDragEnd}
                     >
                       <ContextMenu>
                         <ContextMenuTrigger className="w-full h-full p-0 select-none">
                           {editingHeader === column ? (
                             <Input
                               ref={headerInputRef}
                               value={headerValue}
                               onChange={(e) => setHeaderValue(e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter') {
                                   saveHeaderEdit();
                                   e.preventDefault();
                                 } else if (e.key === 'Escape') {
                                   cancelHeaderEdit();
                                   e.preventDefault();
                                 }
                               }}
                               onBlur={saveHeaderEdit}
                               className="h-full border-none rounded-none text-center font-bold focus:ring-2 focus:ring-primary"
                             />
                           ) : (
                             <div 
                               className="w-full h-full px-4 py-2 cursor-pointer hover:bg-primary/10 transition-colors relative"
                               onClick={() => startEditingHeader(column)}
                             >
                               {column}
                               {/* Resize handle */}
                               <div
                                 className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 bg-border/50"
                                 onMouseDown={(e) => handleMouseDown(e, column)}
                                 onClick={(e) => e.stopPropagation()}
                               />
                             </div>
                           )}
                         </ContextMenuTrigger>
                        <ContextMenuContent>
                          <ContextMenuItem onClick={() => insertColumnBefore(column)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Insert Column Before
                          </ContextMenuItem>
                          <ContextMenuItem onClick={() => insertColumnAfter(column)}>
                            <Plus className="h-4 w-4 mr-2" />
                            Insert Column After
                          </ContextMenuItem>
                          <ContextMenuSeparator />
                          <ContextMenuItem 
                            onClick={() => removeColumn(column)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Remove Column
                          </ContextMenuItem>
                        </ContextMenuContent>
                      </ContextMenu>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>

              {/* Scrollable Body */}
              <TableBody>
                {data.map((row, rowIndex) => (
                  <TableRow key={rowIndex} className="hover:bg-muted/30">
                     {columns.map((column) => {
                      const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.column === column;
                      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
                      
                      return (
                        <TableCell 
                          key={`${rowIndex}-${column}`}
                          className="border-r border-border p-0 last:border-r-0 relative"
                          style={{ width: `${getColumnWidth(column)}px`, minWidth: `${getColumnWidth(column)}px` }}
                        >
                         {isEditing ? (
                           <Textarea
                             ref={textareaRef}
                             value={cellValue}
                             onChange={(e) => setCellValue(e.target.value)}
                             onKeyDown={(e) => {
                               // Allow Shift+Enter for line breaks, but handle Tab/Enter normally
                               if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'Escape') {
                                 handleInputKeyDown(e);
                               }
                             }}
                             className="h-full min-h-[2rem] border-none rounded-none bg-background focus:ring-2 focus:ring-primary resize-none overflow-hidden p-2"
                             style={{ minHeight: '60px' }}
                           />
                         ) : (
                           <div
                             className={`min-h-[2rem] py-2 px-3 cursor-cell flex items-start transition-colors whitespace-pre-wrap
                               ${isSelected 
                                 ? 'bg-primary/10 border-2 border-primary ring-2 ring-primary/20' 
                                 : 'hover:bg-muted/50 border-2 border-transparent'
                               }`}
                              onClick={() => selectCell(rowIndex, column)}
                              onKeyDown={(e) => handleKeyDown(e, rowIndex, column)}
                             tabIndex={0}
                           >
                             {row[column] || ''}
                           </div>
                         )}
                       </TableCell>
                     );
                    })}
                 </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {/* Height resize handle */}
          <div
            className="absolute bottom-0 left-0 right-0 h-3 cursor-row-resize bg-border hover:bg-primary/50 transition-colors flex items-center justify-center group"
            onMouseDown={handleHeightMouseDown}
          >
            <div className="w-8 h-0.5 bg-muted-foreground group-hover:bg-primary transition-colors rounded-full" />
          </div>
        </div>

        <div className="flex justify-between items-center text-sm text-muted-foreground pt-2">
          <Dialog open={showAddRowsDialog} onOpenChange={setShowAddRowsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Rows
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Rows</DialogTitle>
                <DialogDescription>
                  Choose how many rows to add to the spreadsheet.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="rows" className="text-right">
                    Rows
                  </Label>
                  <Input
                    id="rows"
                    type="number"
                    min="1"
                    max="100"
                    value={rowsToAdd}
                    onChange={(e) => setRowsToAdd(Math.max(1, parseInt(e.target.value) || 1))}
                    className="col-span-3"
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
        </div>

        {/* Open Runsheet Dialog */}
        <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Open Saved Runsheet</DialogTitle>
              <DialogDescription>
                Select a runsheet to open. This will replace your current runsheet.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              {savedRunsheets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No saved runsheets found.</p>
                  <p className="text-sm">Save your current runsheet to see it here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRunsheets.map((runsheet) => (
                    <div
                      key={runsheet.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={() => loadRunsheet(runsheet)}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">{runsheet.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {runsheet.columns.length} columns • {runsheet.data.length} rows
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Last updated: {new Date(runsheet.updated_at).toLocaleDateString()} {new Date(runsheet.updated_at).toLocaleTimeString()}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="ml-2">
                          Open
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOpenDialog(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Card>
  );
};

export default EditableSpreadsheet;
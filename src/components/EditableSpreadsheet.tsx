import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Check, X, ArrowUp, ArrowDown } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingCell]);

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

  // Cell editing functions
  const selectCell = (rowIndex: number, column: string) => {
    setSelectedCell({ rowIndex, column });
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

  return (
    <Card className="p-6 mt-6">
      <div className="flex flex-col space-y-4">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-semibold text-foreground">Data Spreadsheet</h3>
          <div className="text-sm text-muted-foreground">
            Right-click column headers to insert or remove columns
          </div>
        </div>

        <div className="overflow-x-auto border rounded-md">
          <Table className="border-collapse">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-12 text-center font-bold border border-border">#</TableHead>
                {columns.map((column) => (
                  <ContextMenu key={column}>
                    <ContextMenuTrigger>
                      <TableHead 
                        className="font-bold text-center border border-border relative min-w-[120px] select-none"
                      >
                        {column}
                      </TableHead>
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
                ))}
                <TableHead className="w-16 text-center font-bold border border-border">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, rowIndex) => (
                <TableRow key={rowIndex} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-center bg-muted/20 border border-border sticky left-0">
                    {rowIndex + 1}
                  </TableCell>
                  
                  {columns.map((column) => {
                    const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.column === column;
                    const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
                    
                    return (
                      <TableCell 
                        key={`${rowIndex}-${column}`}
                        className="p-0 relative"
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
                            onDoubleClick={() => startEditing(rowIndex, column, row[column] || '')}
                            onKeyDown={(e) => handleKeyDown(e, rowIndex, column)}
                            tabIndex={0}
                          >
                            {row[column] || (
                              <span className="text-muted-foreground text-sm">Empty</span>
                            )}
                          </div>
                        )}
                      </TableCell>
                    );
                  })}
                  
                  <TableCell className="text-center bg-muted/20 border border-border">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRow(rowIndex)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
};

export default EditableSpreadsheet;
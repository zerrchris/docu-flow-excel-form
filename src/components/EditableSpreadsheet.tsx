import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Check, X, Columns, ArrowUp, ArrowDown } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

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
  const [data, setData] = useState<Record<string, string>[]>(initialData);
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [showNewColumnInput, setShowNewColumnInput] = useState(false);
  const [newColumnName, setNewColumnName] = useState('');
  const [selectedCell, setSelectedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingCell]);

  // Handle cell selection and editing
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
    if (e.key === 'Enter') {
      saveEdit();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      cancelEdit();
      e.preventDefault();
    }
  }, [saveEdit, cancelEdit]);

  // Column management
  const addColumn = () => {
    if (newColumnName && !columns.includes(newColumnName)) {
      const updatedColumns = [...columns, newColumnName];
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      setNewColumnName('');
      setShowNewColumnInput(false);
    }
  };

  const removeColumn = (columnToRemove: string) => {
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
  };

  // Row management
  const addRow = () => {
    const newRow: Record<string, string> = {};
    columns.forEach(col => newRow[col] = '');
    setData([...data, newRow]);
  };

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
          
          <div className="flex space-x-2">
            <Button onClick={addRow} size="sm" variant="outline" className="hover:bg-primary/10">
              <Plus className="h-4 w-4 mr-1" />
              Add Row
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline" className="hover:bg-primary/10">
                  <Columns className="h-4 w-4 mr-1" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[180px]">
                <DropdownMenuItem onClick={() => setShowNewColumnInput(true)} className="hover:bg-primary/10">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Column
                </DropdownMenuItem>
                {columns.map(col => (
                  <DropdownMenuItem 
                    key={col} 
                    onClick={() => removeColumn(col)}
                    className="text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Remove {col}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showNewColumnInput && (
          <div className="flex space-x-2 mb-2">
            <Input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Column name"
              className="max-w-xs"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  addColumn();
                } else if (e.key === 'Escape') {
                  setShowNewColumnInput(false);
                }
              }}
              autoFocus
            />
            <Button variant="outline" size="sm" onClick={addColumn} className="hover:bg-primary/10">
              <Check className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowNewColumnInput(false)} className="hover:bg-muted/80">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="overflow-x-auto border rounded-md">
          <Table className="border-collapse">
            <TableHeader>
              <TableRow className="bg-muted/50 hover:bg-muted/50">
                <TableHead className="w-12 text-center font-bold border border-border">#</TableHead>
                {columns.map((column) => (
                  <TableHead 
                    key={column} 
                    className="font-bold text-center border border-border relative min-w-[120px]"
                  >
                    {column}
                  </TableHead>
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
                           <Input
                             ref={inputRef}
                             value={cellValue}
                             onChange={(e) => setCellValue(e.target.value)}
                             onKeyDown={handleInputKeyDown}
                             className="h-full min-h-[2rem] border-none rounded-none bg-background focus:ring-2 focus:ring-primary"
                           />
                         ) : (
                           <div
                             className={`min-h-[2rem] py-2 px-3 cursor-cell flex items-center transition-colors
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
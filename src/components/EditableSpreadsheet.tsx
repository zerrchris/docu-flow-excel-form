import React, { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Plus, Trash2, Edit, Check, X, Columns } from 'lucide-react';
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

  // Handle cell editing
  const startEditing = (rowIndex: number, column: string, value: string) => {
    setEditingCell({ rowIndex, column });
    setCellValue(value);
  };

  const saveEdit = () => {
    if (editingCell) {
      const newData = [...data];
      newData[editingCell.rowIndex] = {
        ...newData[editingCell.rowIndex],
        [editingCell.column]: cellValue
      };
      setData(newData);
      setEditingCell(null);
    }
  };

  const cancelEdit = () => {
    setEditingCell(null);
    setCellValue('');
  };

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
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-foreground">Data Spreadsheet</h3>
          
          <div className="flex space-x-2">
            <Button onClick={addRow} size="sm" variant="outline">
              <Plus className="h-4 w-4 mr-1" />
              Add Row
            </Button>
            
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Columns className="h-4 w-4 mr-1" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setShowNewColumnInput(true)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Column
                </DropdownMenuItem>
                {columns.map(col => (
                  <DropdownMenuItem 
                    key={col} 
                    onClick={() => removeColumn(col)}
                    className="text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Remove {col}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {showNewColumnInput && (
          <div className="flex space-x-2">
            <Input
              value={newColumnName}
              onChange={(e) => setNewColumnName(e.target.value)}
              placeholder="Column name"
              className="max-w-xs"
            />
            <Button variant="outline" size="sm" onClick={addColumn}>
              <Check className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowNewColumnInput(false)}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                {columns.map((column) => (
                  <TableHead key={column}>{column}</TableHead>
                ))}
                <TableHead className="w-20">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row, rowIndex) => (
                <TableRow key={rowIndex}>
                  <TableCell className="font-medium">{rowIndex + 1}</TableCell>
                  
                  {columns.map((column) => (
                    <TableCell key={`${rowIndex}-${column}`}>
                      {editingCell?.rowIndex === rowIndex && editingCell?.column === column ? (
                        <div className="flex space-x-1">
                          <Input
                            value={cellValue}
                            onChange={(e) => setCellValue(e.target.value)}
                            className="h-8 py-1 text-sm"
                            autoFocus
                          />
                          <div className="flex space-x-1">
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8" 
                              onClick={saveEdit}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="h-8 w-8" 
                              onClick={cancelEdit}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div
                          className="min-h-[2rem] py-1 px-2 rounded hover:bg-secondary/50 cursor-pointer flex items-center"
                          onClick={() => startEditing(rowIndex, column, row[column] || '')}
                        >
                          {row[column] || '—'}
                        </div>
                      )}
                    </TableCell>
                  ))}
                  
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => deleteRow(rowIndex)}
                      className="h-8 w-8 text-destructive"
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
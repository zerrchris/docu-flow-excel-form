import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSimpleRunsheet } from '@/hooks/useSimpleRunsheet';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2, Save, Download, Upload, Settings } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { AutoSaveIndicator } from './AutoSaveIndicator';
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
  onDocumentMapChange?: (documentMap: Map<number, any>) => void;
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
  const [user, setUser] = useState<User | null>(null);
  
  // Load existing runsheet if ID provided
  const {
    runsheet,
    isSaving,
    lastSaved,
    updateRunsheet,
    loadRunsheet,
    saveRunsheet: forceSave
  } = useSimpleRunsheet({
    initialName: initialRunsheetName,
    initialColumns,
    initialData,
    initialColumnInstructions: {},
    userId: user?.id
  });

  // Local state for editing
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');

  // Get current user
  useEffect(() => {
    const getCurrentUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getCurrentUser();
  }, []);

  // Load runsheet if ID provided
  useEffect(() => {
    if (initialRunsheetId && user?.id) {
      loadRunsheet(initialRunsheetId);
    }
  }, [initialRunsheetId, user?.id, loadRunsheet]);

  // Update parent callbacks when runsheet changes
  useEffect(() => {
    if (runsheet) {
      onColumnChange(runsheet.columns);
      onDataChange?.(runsheet.data);
      onColumnInstructionsChange?.(runsheet.columnInstructions);
    }
  }, [runsheet, onColumnChange, onDataChange, onColumnInstructionsChange]);

  const handleCellClick = (rowIndex: number, column: string) => {
    setEditingCell({ rowIndex, column });
    setCellValue(runsheet?.data[rowIndex]?.[column] || '');
  };

  const handleCellChange = (value: string) => {
    setCellValue(value);
  };

  const handleCellBlur = () => {
    if (editingCell && runsheet) {
      const newData = [...runsheet.data];
      newData[editingCell.rowIndex] = {
        ...newData[editingCell.rowIndex],
        [editingCell.column]: cellValue
      };
      
      updateRunsheet({ data: newData });
      setEditingCell(null);
      setCellValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleCellBlur();
    }
    if (e.key === 'Escape') {
      setEditingCell(null);
      setCellValue('');
    }
  };

  const addColumn = () => {
    if (!runsheet) return;
    
    const newColumnName = `Column ${runsheet.columns.length + 1}`;
    const newColumns = [...runsheet.columns, newColumnName];
    const newData = runsheet.data.map(row => ({
      ...row,
      [newColumnName]: ''
    }));
    
    updateRunsheet({ 
      columns: newColumns, 
      data: newData 
    });
  };

  const addRow = () => {
    if (!runsheet) return;
    
    const newRow: Record<string, string> = {};
    runsheet.columns.forEach(col => newRow[col] = '');
    
    updateRunsheet({ 
      data: [...runsheet.data, newRow] 
    });
  };

  const exportToExcel = () => {
    if (!runsheet) return;
    
    const worksheet = XLSX.utils.json_to_sheet(runsheet.data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    XLSX.writeFile(workbook, `${runsheet.name}.xlsx`);
  };

  if (!runsheet) {
    return <div>Loading runsheet...</div>;
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-4">
          <h1 className="text-xl font-semibold">{runsheet.name}</h1>
          <AutoSaveIndicator 
            status={isSaving ? 'saving' : 'saved'}
            lastSavedAt={lastSaved}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={addColumn} size="sm">
            <Plus className="w-4 h-4" />
            Add Column
          </Button>
          <Button onClick={addRow} size="sm">
            <Plus className="w-4 h-4" />
            Add Row
          </Button>
          <Button onClick={exportToExcel} size="sm" variant="outline">
            <Download className="w-4 h-4" />
            Export
          </Button>
          <Button onClick={forceSave} size="sm" variant="outline">
            <Save className="w-4 h-4" />
            Save
          </Button>
        </div>
      </div>

      {/* Spreadsheet */}
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              <th className="w-12 p-2 border border-border bg-muted">#</th>
              {runsheet.columns.map((column, index) => (
                <th key={column} className="p-2 border border-border bg-muted min-w-32">
                  <Input
                    value={column}
                    onChange={(e) => {
                      const newColumns = [...runsheet.columns];
                      newColumns[index] = e.target.value;
                      updateRunsheet({ columns: newColumns });
                    }}
                    className="border-0 bg-transparent text-center font-medium"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {runsheet.data.map((row, rowIndex) => (
              <tr key={rowIndex}>
                <td className="p-2 border border-border bg-muted text-center text-sm text-muted-foreground">
                  {rowIndex + 1}
                </td>
                {runsheet.columns.map((column) => (
                  <td key={column} className="p-0 border border-border">
                    {editingCell?.rowIndex === rowIndex && editingCell?.column === column ? (
                      <Input
                        value={cellValue}
                        onChange={(e) => handleCellChange(e.target.value)}
                        onBlur={handleCellBlur}
                        onKeyDown={handleKeyPress}
                        className="border-0 rounded-none w-full h-full"
                        autoFocus
                      />
                    ) : (
                      <div
                        className="p-2 min-h-10 cursor-text hover:bg-muted/50"
                        onClick={() => handleCellClick(rowIndex, column)}
                      >
                        {row[column] || ''}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SimpleEditableSpreadsheet;
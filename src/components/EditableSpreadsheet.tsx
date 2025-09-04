import React, { useState, useEffect, forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
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

const EditableSpreadsheet = forwardRef<any, SpreadsheetProps>((props, ref) => {
  const {
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
  } = props;

  const { toast } = useToast();
  const { activeRunsheet, setCurrentRunsheet } = useActiveRunsheet();
  
  const [columns, setColumns] = useState<string[]>(initialColumns);
  const [data, setData] = useState<Record<string, string>[]>(() => {
    if (initialData && initialData.length > 0) {
      return initialData;
    }
    // Create 20 empty rows
    return Array.from({ length: 20 }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
  });
  const [runsheetName, setRunsheetName] = useState<string>(initialRunsheetName || 'Untitled Runsheet');
  const [currentRunsheetId, setCurrentRunsheetId] = useState<string | null>(initialRunsheetId || null);
  const [user, setUser] = useState<User | null>(null);
  const [documentMap, setDocumentMap] = useState<Map<number, DocumentRecord>>(new Map());

  // Load user on mount
  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();
  }, []);

  // Load runsheet from URL parameter
  useEffect(() => {
    const loadSpecificRunsheet = async (runsheetId: string) => {
      if (!user) return;
      
      try {
        console.log('Loading runsheet:', runsheetId);
        const { data: runsheet, error } = await supabase
          .from('runsheets')
          .select('*')
          .eq('id', runsheetId)
          .eq('user_id', user.id)
          .single();

        if (error) {
          throw error;
        }

        if (runsheet) {
          console.log('Runsheet loaded:', runsheet);
          setRunsheetName(runsheet.name);
          setColumns(runsheet.columns as string[]);
          setData((runsheet.data as Record<string, string>[]) || []);
          setCurrentRunsheetId(runsheet.id);
          onColumnChange(runsheet.columns as string[]);
          onDataChange?.((runsheet.data as Record<string, string>[]) || []);
        }
      } catch (error) {
        console.error('Error loading runsheet:', error);
        toast({
          title: "Error loading runsheet",
          description: "Could not load the runsheet from database.",
          variant: "destructive"
        });
      }
    };

    const handleLoadSpecificRunsheet = (event: CustomEvent) => {
      const { runsheetId } = event.detail;
      loadSpecificRunsheet(runsheetId);
    };

    window.addEventListener('loadSpecificRunsheet', handleLoadSpecificRunsheet as EventListener);

    // Load runsheet if ID is provided initially
    if (initialRunsheetId && user) {
      loadSpecificRunsheet(initialRunsheetId);
    }

    return () => {
      window.removeEventListener('loadSpecificRunsheet', handleLoadSpecificRunsheet as EventListener);
    };
  }, [user, initialRunsheetId, onColumnChange, onDataChange, toast]);

  // Handle cell value changes
  const handleCellChange = (rowIndex: number, columnName: string, value: string) => {
    const newData = [...data];
    newData[rowIndex] = { ...newData[rowIndex], [columnName]: value };
    setData(newData);
    onDataChange?.(newData);
    onUnsavedChanges?.(true);
  };

  // Add more rows if needed
  const addEmptyRows = () => {
    const newRows = Array.from({ length: 10 }, () => {
      const row: Record<string, string> = {};
      columns.forEach(col => row[col] = '');
      return row;
    });
    const newData = [...data, ...newRows];
    setData(newData);
    onDataChange?.(newData);
  };

  return (
    <div className="w-full">
      <div className="mb-4">
        <h2 className="text-2xl font-bold">{runsheetName}</h2>
        {currentRunsheetId && (
          <p className="text-sm text-muted-foreground">ID: {currentRunsheetId}</p>
        )}
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-auto max-h-[600px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-12">#</TableHead>
                  {columns.map((column, index) => (
                    <TableHead key={index} className="min-w-[150px]">
                      {column}
                    </TableHead>
                  ))}
                  <TableHead className="min-w-[200px]">Document</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((row, rowIndex) => (
                  <TableRow key={rowIndex}>
                    <TableCell className="text-sm text-muted-foreground">
                      {rowIndex + 1}
                    </TableCell>
                    {columns.map((column, colIndex) => (
                      <TableCell key={colIndex}>
                        <Input
                          value={row[column] || ''}
                          onChange={(e) => handleCellChange(rowIndex, column, e.target.value)}
                          className="border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
                        />
                      </TableCell>
                    ))}
                    <TableCell>
                      <div className="text-sm text-muted-foreground">
                        Document linker will go here
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 flex gap-2">
        <Button onClick={addEmptyRows} variant="outline">
          Add Rows
        </Button>
        {onShowMultipleUpload && (
          <Button onClick={onShowMultipleUpload} variant="outline">
            Upload Documents
          </Button>
        )}
      </div>
    </div>
  );
});

EditableSpreadsheet.displayName = 'EditableSpreadsheet';

export default EditableSpreadsheet;
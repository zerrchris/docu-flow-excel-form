import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, FileSpreadsheet, X, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';

interface RunsheetFileUploadProps {
  onFileSelected: (data: { name: string; columns: string[]; rows: Record<string, string>[] }) => void;
  onCancel: () => void;
}

export const RunsheetFileUpload: React.FC<RunsheetFileUploadProps> = ({ 
  onFileSelected, 
  onCancel 
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateFile = (file: File): boolean => {
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];
    
    const validExtensions = ['.xlsx', '.xls', '.csv'];
    const hasValidExtension = validExtensions.some(ext => 
      file.name.toLowerCase().endsWith(ext)
    );
    
    return validTypes.includes(file.type) || hasValidExtension;
  };

  const processFile = async (file: File) => {
    if (!validateFile(file)) {
      toast({
        title: "Invalid file type",
        description: "Please select an Excel (.xlsx, .xls) or CSV file.",
        variant: "destructive"
      });
      return;
    }

    setIsProcessing(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get the first worksheet
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      console.log('📊 Processing Excel file:', file.name);
      console.log('📊 Worksheet:', firstSheetName);
      
      // Convert to JSON with more flexible parsing
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1,
        defval: '', // Use empty string for empty cells
        raw: false  // Convert everything to strings
      });
      
      console.log('📊 Raw JSON data:', jsonData);
      
      if (jsonData.length === 0) {
        throw new Error('The file appears to be empty');
      }

      // Find the header row - it might not be the first row
      let headerRowIndex = 0;
      let headers: string[] = [];
      
      // Common runsheet column patterns to help identify the header row
      const commonRunsheetColumns = [
        'recording', 'instrument', 'date', 'record', 'grantor', 'grantee', 
        'description', 'comment', 'book', 'page', 'legal', 'type', 'info'
      ];
      
      // Look for the row that looks most like actual column headers
      let bestHeaderScore = 0;
      let bestHeaderIndex = 0;
      
      for (let i = 0; i < Math.min(15, jsonData.length); i++) {
        const row = jsonData[i] as any[];
        if (!row) continue;
        
        const nonEmptyCount = row.filter(cell => cell && cell.toString().trim() !== '').length;
        
        // Must have at least 4 non-empty cells to be considered
        if (nonEmptyCount >= 4) {
          let score = 0;
          
          // Check how many cells look like column headers
          row.forEach(cell => {
            if (cell && typeof cell === 'string') {
              const cellText = cell.toString().toLowerCase().trim();
              
              // Score based on length (good headers are usually 5-30 characters)
              if (cellText.length >= 4 && cellText.length <= 30) {
                score += 1;
              }
              
              // Bonus points for containing common runsheet terms
              commonRunsheetColumns.forEach(term => {
                if (cellText.includes(term)) {
                  score += 3;
                }
              });
              
              // Bonus for multiple words (typical header pattern)
              if (cellText.includes(' ') || cellText.includes('_')) {
                score += 1;
              }
              
              // Penalty for very short single words or numbers only
              if (cellText.length < 3 || /^\d+$/.test(cellText)) {
                score -= 1;
              }
            }
          });
          
          console.log(`📊 Row ${i + 1} header score: ${score}, content:`, row.slice(0, 5));
          
          if (score > bestHeaderScore) {
            bestHeaderScore = score;
            bestHeaderIndex = i;
          }
        }
      }
      
      // Use the best scoring row as headers
      if (bestHeaderScore > 0) {
        headerRowIndex = bestHeaderIndex;
        headers = (jsonData[headerRowIndex] as any[]).map(cell => 
          cell ? cell.toString().trim() : ''
        );
      } else {
        // Fallback: find first row with substantial data
        for (let i = 0; i < Math.min(10, jsonData.length); i++) {
          const row = jsonData[i] as any[];
          const nonEmptyCount = row.filter(cell => cell && cell.toString().trim() !== '').length;
          
          if (nonEmptyCount >= 3) {
            headers = row.map(cell => cell ? cell.toString().trim() : '');
            headerRowIndex = i;
            break;
          }
        }
      }

      if (!headers || headers.length === 0) {
        throw new Error('No column headers found in the file');
      }

      console.log('📊 Found headers at row', headerRowIndex + 1, ':', headers);

      // Get data rows (everything after the header row)
      const dataRows = jsonData.slice(headerRowIndex + 1) as any[][];
      
      // Convert rows to objects, filtering out completely empty rows
      const processedRows = dataRows
        .filter(row => {
          // Keep row if it has at least one non-empty cell
          return row && row.some(cell => cell && cell.toString().trim() !== '');
        })
        .map((row, index) => {
          const rowObj: Record<string, string> = {};
          headers.forEach((header, colIndex) => {
            if (header) {
              // Convert cell value to string, handling various data types
              const cellValue = row[colIndex];
              if (cellValue !== undefined && cellValue !== null) {
                rowObj[header] = cellValue.toString().trim();
              } else {
                rowObj[header] = '';
              }
            }
          });
          return rowObj;
        });

      // Filter out headers that are completely empty
      const validHeaders = headers.filter((header, index) => {
        if (!header) return false;
        // Keep header if at least one row has data in this column
        return processedRows.some(row => row[header] && row[header].trim() !== '');
      });

      // Create runsheet name from filename (remove extension)
      const runsheetName = file.name.replace(/\.(xlsx|xls|csv)$/i, '');

      console.log('📊 Processing complete:', {
        name: runsheetName,
        headers: validHeaders,
        rowCount: processedRows.length
      });

      onFileSelected({
        name: runsheetName,
        columns: validHeaders,
        rows: processedRows
      });

      toast({
        title: "File processed successfully",
        description: `Loaded ${processedRows.length} rows with ${validHeaders.length} columns.`
      });

    } catch (error: any) {
      console.error('Error processing file:', error);
      toast({
        title: "Error processing file",
        description: error.message || "Failed to read the file. Please ensure it's a valid Excel or CSV file.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      setSelectedFile(file);
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const clearFile = () => {
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="space-y-4">
      {/* File Drop Zone */}
      <Card 
        className={`border-2 border-dashed transition-colors cursor-pointer ${
          isDragOver 
            ? 'border-primary bg-primary/5' 
            : 'border-muted-foreground/25 hover:border-primary/50'
        }`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <div className="p-3 rounded-full bg-primary/10 mb-4">
            <FileSpreadsheet className="h-8 w-8 text-primary" />
          </div>
          <h3 className="text-lg font-medium mb-2">Upload Runsheet File</h3>
          <p className="text-muted-foreground text-sm mb-4">
            Drop your Excel or CSV file here, or click to browse
          </p>
          <p className="text-xs text-muted-foreground">
            Supports: .xlsx, .xls, .csv files only
          </p>
          <Button className="mt-4" disabled={isProcessing}>
            <Upload className="h-4 w-4 mr-2" />
            {isProcessing ? 'Processing...' : 'Choose File'}
          </Button>
        </CardContent>
      </Card>

      {/* Selected File Display */}
      {selectedFile && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded bg-primary/10">
                  <FileSpreadsheet className="h-4 w-4 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm">{selectedFile.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {isProcessing ? (
                  <div className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                    <span className="text-sm text-muted-foreground">Processing...</span>
                  </div>
                ) : (
                  <CheckCircle className="h-4 w-4 text-green-500" />
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    clearFile();
                  }}
                  disabled={isProcessing}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
          Cancel
        </Button>
      </div>

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
};
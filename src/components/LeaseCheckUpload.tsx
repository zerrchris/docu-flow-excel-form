import React, { useCallback, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, AlertCircle, Table } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface LeaseCheckUploadProps {
  onDocumentUpload: (text: string) => void;
}

export const LeaseCheckUpload: React.FC<LeaseCheckUploadProps> = ({ onDocumentUpload }) => {
  const [dragActive, setDragActive] = useState(false);
  const [textInput, setTextInput] = useState('');
  const [runsheets, setRunsheets] = useState<any[]>([]);
  const [selectedRunsheet, setSelectedRunsheet] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Fetch user's runsheets on component mount
  useEffect(() => {
    fetchRunsheets();
  }, []);

  const fetchRunsheets = async () => {
    try {
      const { data, error } = await supabase
        .from('runsheets')
        .select('id, name, created_at, data')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRunsheets(data || []);
    } catch (error) {
      console.error('Error fetching runsheets:', error);
      toast({
        title: "Error",
        description: "Failed to load your runsheets",
        variant: "destructive"
      });
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      await handleFile(files[0]);
    }
  }, []);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    try {
      if (file.type === 'text/plain' || file.name.endsWith('.txt')) {
        const text = await file.text();
        onDocumentUpload(text);
        toast({
          title: "File uploaded successfully",
          description: `${file.name} has been processed`,
        });
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.type.includes('spreadsheet')) {
        // Handle Excel files
        const XLSX = await import('xlsx');
        const arrayBuffer = await file.arrayBuffer();
        const workbook = XLSX.read(arrayBuffer, { type: 'array' });
        
        // Get the first worksheet
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        
        // Format as text for analysis
        let formattedText = `EXCEL FILE: ${file.name}\n\n`;
        jsonData.forEach((row: any, index: number) => {
          if (row.length > 0) {
            formattedText += `ROW ${index + 1}: ${row.join(' | ')}\n`;
          }
        });
        
        onDocumentUpload(formattedText);
        toast({
          title: "Excel file uploaded successfully",
          description: `${file.name} has been processed`,
        });
      } else {
        toast({
          title: "Unsupported file type",
          description: "Please upload a .txt or .xlsx/.xls file, or paste the document text directly into the text area below.",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Error reading file:', error);
      toast({
        title: "Error",
        description: "Failed to read the file. Please try again.",
        variant: "destructive"
      });
    }
  };

  const handleRunsheetImport = async () => {
    if (!selectedRunsheet) {
      toast({
        title: "Error",
        description: "Please select a runsheet to import",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const runsheet = runsheets.find(r => r.id === selectedRunsheet);
      if (!runsheet) throw new Error('Runsheet not found');

      // Convert runsheet data to text format for analysis
      const runsheetText = formatRunsheetForAnalysis(runsheet);
      onDocumentUpload(runsheetText);
      
      toast({
        title: "Runsheet imported successfully",
        description: `${runsheet.name} has been loaded for lease check analysis`,
      });
    } catch (error) {
      console.error('Error importing runsheet:', error);
      toast({
        title: "Error",
        description: "Failed to import runsheet. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatRunsheetForAnalysis = (runsheet: any) => {
    // Convert runsheet data to a formatted text that can be analyzed
    let formattedText = `RUNSHEET: ${runsheet.name}\n\n`;
    
    if (runsheet.data && Array.isArray(runsheet.data)) {
      runsheet.data.forEach((row: any, index: number) => {
        formattedText += `ENTRY ${index + 1}:\n`;
        Object.entries(row).forEach(([key, value]) => {
          if (value && value !== '') {
            formattedText += `${key}: ${value}\n`;
          }
        });
        formattedText += '\n';
      });
    }
    
    return formattedText;
  };

  const handleTextSubmit = () => {
    if (textInput.trim()) {
      onDocumentUpload(textInput);
      toast({
        title: "Text processed",
        description: "Document content has been loaded",
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Import from Existing Runsheets */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Table className="w-5 h-5" />
            Import from Existing Runsheet
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Select a runsheet to analyze:</label>
            <Select value={selectedRunsheet} onValueChange={setSelectedRunsheet}>
              <SelectTrigger>
                <SelectValue placeholder="Choose a runsheet..." />
              </SelectTrigger>
              <SelectContent>
                {runsheets.map((runsheet) => (
                  <SelectItem key={runsheet.id} value={runsheet.id}>
                    {runsheet.name} ({runsheet.data?.length || 0} entries)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button 
            onClick={handleRunsheetImport}
            disabled={!selectedRunsheet || loading}
            className="w-full"
          >
            {loading ? 'Importing...' : 'Import Runsheet for Analysis'}
          </Button>
          {runsheets.length === 0 && (
            <p className="text-sm text-muted-foreground text-center">
              No runsheets found. Create a runsheet first or upload a local document below.
            </p>
          )}
        </CardContent>
      </Card>

      <div className="flex items-center justify-center">
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <div className="h-px bg-border flex-1" />
          <span>or</span>
          <div className="h-px bg-border flex-1" />
        </div>
      </div>

      {/* File Upload Area */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Runsheet Document
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragActive 
                ? 'border-primary bg-primary/5' 
                : 'border-muted-foreground/25 hover:border-primary/50'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 rounded-full bg-muted">
                <Upload className="w-8 h-8 text-muted-foreground" />
              </div>
              <div className="space-y-2">
                <p className="text-lg font-medium">
                  Drop your runsheet document here
                </p>
                <p className="text-sm text-muted-foreground">
                  Supports .txt and Excel (.xlsx/.xls) files. You can also import saved runsheets using the option above.
                </p>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span>or</span>
              </div>
              <Input
                type="file"
                onChange={handleFileInput}
                accept=".txt,.xlsx,.xls"
                className="max-w-xs"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Text Input Alternative */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Or Paste Document Text
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Textarea
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            placeholder="Paste your runsheet document content here..."
            className="min-h-[200px]"
          />
          <Button 
            onClick={handleTextSubmit}
            disabled={!textInput.trim()}
            className="w-full"
          >
            Process Text
          </Button>
        </CardContent>
      </Card>

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5" />
            Instructions
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong>Document Format:</strong> Upload or paste your oil and gas runsheet document 
              containing mineral ownership and lease information.
            </p>
            <p>
              <strong>What we analyze:</strong> Mineral owners, lease status, legal descriptions, 
              vesting documents, and production status.
            </p>
            <p>
              <strong>Output:</strong> Formatted lease check report and exportable spreadsheet data 
              showing leased/unleased status for each tract and owner.
            </p>
            <p>
              <strong>Note:</strong> If production information is missing, you'll be prompted to 
              provide details about active wells and Pugh clauses.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
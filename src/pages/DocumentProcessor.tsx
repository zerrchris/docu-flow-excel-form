import React, { useState, useEffect } from 'react';
import { toast } from '@/components/ui/use-toast';
import DocumentUpload from '@/components/DocumentUpload';
import DocumentViewer from '@/components/DocumentViewer';
import DataForm from '@/components/DataForm';
import EditableSpreadsheet from '@/components/EditableSpreadsheet';
import GoogleSheetEmbed from '@/components/GoogleSheetEmbed';
import extractorLogo from '@/assets/document-extractor-logo.png';

// Initial columns for the spreadsheet
const DEFAULT_COLUMNS = ['Name', 'Date', 'Amount', 'Category'];

const DocumentProcessor: React.FC = () => {
  // Document state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  
  // Form and analysis state
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [spreadsheetData, setSpreadsheetData] = useState<Record<string, string>[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  
  // Update form state when columns change
  useEffect(() => {
    const newFormData = { ...formData };
    // Add any new columns
    columns.forEach(column => {
      if (!(column in newFormData)) {
        newFormData[column] = '';
      }
    });
    // Remove any columns that are no longer present
    Object.keys(newFormData).forEach(key => {
      if (!columns.includes(key)) {
        delete newFormData[key];
      }
    });
    setFormData(newFormData);
  }, [columns]);

  // Handle file selection
  const handleFileSelect = (selectedFile: File) => {
    // Revoke any previous object URL to avoid memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    setFile(selectedFile);
    
    // Create preview URL for the file
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    
    // Reset form data
    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
    
    toast({
      title: "Document uploaded",
      description: `${selectedFile.name} has been uploaded. Click 'Analyze Document' to extract data.`,
    });
  };

  // Handle form field changes
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Simulate document analysis with OpenAI
  const analyzeDocument = async () => {
    if (!file) {
      toast({
        title: "No document selected",
        description: "Please upload a document first.",
        variant: "destructive",
      });
      return;
    }

    setIsAnalyzing(true);
    
    try {
      // In a real app, you would send the file to an API endpoint
      // that would use OpenAI Vision or Document API to extract information
      // For this demo, we'll simulate the analysis with a timeout
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Simulated response data
      const mockData: Record<string, string> = {};
      columns.forEach(column => {
        switch (column) {
          case 'Name':
            mockData[column] = 'Sample Company LLC';
            break;
          case 'Date':
            mockData[column] = new Date().toLocaleDateString();
            break;
          case 'Amount':
            mockData[column] = '$' + (Math.random() * 1000).toFixed(2);
            break;
          case 'Category':
            mockData[column] = ['Invoice', 'Receipt', 'Statement'][Math.floor(Math.random() * 3)];
            break;
          default:
            mockData[column] = `Sample ${column} data`;
        }
      });
      
      setFormData(mockData);
      
      toast({
        title: "Document analyzed",
        description: "Data has been extracted from the document.",
      });
    } catch (error) {
      toast({
        title: "Analysis failed",
        description: "There was a problem analyzing the document.",
        variant: "destructive",
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // Add current form data to spreadsheet
  const addToSpreadsheet = () => {
    // Check if any field has data
    const hasData = Object.values(formData).some(value => value.trim() !== '');
    
    if (!hasData) {
      toast({
        title: "No data to add",
        description: "Please fill in some fields or analyze the document first.",
        variant: "destructive",
      });
      return;
    }

    setSpreadsheetData(prev => [...prev, { ...formData }]);
    
    toast({
      title: "Data added to spreadsheet",
      description: "The current data has been added as a new row.",
    });

    // Reset form data for next entry
    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      <div className="flex items-center gap-4 mb-8">
        <img 
          src={extractorLogo} 
          alt="Document Data Extractor Logo" 
          className="h-16 w-16"
        />
        <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
          Document Data Extractor
        </h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DocumentUpload onFileSelect={handleFileSelect} selectedFile={file} />
        <DocumentViewer file={file} previewUrl={previewUrl} />
      </div>
      
      <div className="mt-6">
        <DataForm 
          fields={columns}
          formData={formData}
          onChange={handleFieldChange}
          onAnalyze={analyzeDocument}
          onAddToSpreadsheet={addToSpreadsheet}
          isAnalyzing={isAnalyzing}
        />
      </div>
      
      <EditableSpreadsheet 
        initialColumns={columns}
        initialData={spreadsheetData}
        onColumnChange={setColumns}
      />
      
      <GoogleSheetEmbed />
    </div>
  );
};

export default DocumentProcessor;
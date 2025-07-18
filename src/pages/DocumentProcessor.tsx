import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FolderOpen, Plus } from 'lucide-react';
import DocumentFrame from '@/components/DocumentFrame';
import EditableSpreadsheet from '@/components/EditableSpreadsheet';
import AuthButton from '@/components/AuthButton';
import BatchProcessing from '@/components/BatchProcessing';

import extractorLogo from '@/assets/document-extractor-logo.png';

// Initial columns for the spreadsheet
const DEFAULT_COLUMNS = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'];

const DocumentProcessor: React.FC = () => {
  // Document state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [showCombineConfirmation, setShowCombineConfirmation] = useState(false);
  const [isProcessingCombination, setIsProcessingCombination] = useState(false);
  
  // Form and analysis state
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [spreadsheetData, setSpreadsheetData] = useState<Record<string, string>[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  // Get started dialog state
  
  const [showGetStarted, setShowGetStarted] = useState(true);
  
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

  // Handle document reset - clear file and form data
  const resetDocument = () => {
    // Revoke any previous object URL to avoid memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    setFile(null);
    setPreviewUrl(null);
    
    // Reset form data
    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
    
    // Clear any pending files
    setPendingFiles([]);
    setShowCombineConfirmation(false);
  };

  // Handle single file selection
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
    
    // Clear any pending files
    setPendingFiles([]);
    setShowCombineConfirmation(false);
    
    toast({
      title: "Document uploaded",
      description: `${selectedFile.name} has been uploaded. Click 'Analyze Document' to extract data.`,
    });
  };

  // Handle multiple file selection
  const handleMultipleFilesSelect = (files: File[]) => {
    // Check if all files are images
    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    
    if (imageFiles.length !== files.length) {
      toast({
        title: "Invalid file types",
        description: "Multiple file combination only supports image files. Please select only images.",
        variant: "destructive",
      });
      return;
    }

    if (imageFiles.length < 2) {
      toast({
        title: "Not enough files",
        description: "Please select at least 2 images to combine.",
        variant: "destructive",
      });
      return;
    }

    setPendingFiles(imageFiles);
    setShowCombineConfirmation(true);
  };

  // Handle combine confirmation - automatically create PDF
  const handleCombineConfirm = async () => {
    setShowCombineConfirmation(false);
    setIsProcessingCombination(true);
    
    try {
      const { combineImages } = await import('@/utils/imageCombiner');
      const { file: combinedFile, previewUrl: newPreviewUrl } = await combineImages(pendingFiles, { type: 'pdf' });
      
      // Revoke the OLD preview URL before setting the new one
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      
      setFile(combinedFile);
      setPreviewUrl(newPreviewUrl);
      console.log('Combined file set:', combinedFile);
      console.log('New preview URL set:', newPreviewUrl);
      setPendingFiles([]);
      
      // Reset form data
      const emptyFormData: Record<string, string> = {};
      columns.forEach(column => {
        emptyFormData[column] = '';
      });
      setFormData(emptyFormData);
      
      toast({
        title: "Images combined successfully",
        description: `Created PDF document with ${pendingFiles.length} pages.`,
      });
    } catch (error) {
      console.error('Error combining images:', error);
      toast({
        title: "Error combining images",
        description: "Please try again or upload images individually.",
        variant: "destructive",
      });
    } finally {
      setIsProcessingCombination(false);
    }
  };

  const handleCombineCancel = () => {
    setShowCombineConfirmation(false);
    setPendingFiles([]);
  };

  // Handle form field changes
  const handleFieldChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  // Extract document information using OpenAI API
  const analyzeDocument = async (fileToAnalyze?: File) => {
    console.log('analyzeDocument called with fileToAnalyze:', fileToAnalyze);
    const targetFile = fileToAnalyze || file;
    console.log('targetFile:', targetFile);
    
    if (!targetFile) {
      toast({
        title: "No document selected",
        description: "Please upload a document first.",
        variant: "destructive",
      });
      return {};
    }

    // Check if all columns have extraction instructions configured
    const columnsWithoutInstructions = columns.filter(column => 
      !columnInstructions[column] || columnInstructions[column].trim() === ''
    );
    
    if (columnsWithoutInstructions.length > 0) {
      setMissingColumns(columnsWithoutInstructions);
      setShowValidationDialog(true);
      return {};
    }

    setIsAnalyzing(true);
    console.log('Starting analysis...');
    
    try {
      // Convert file to base64 for OpenAI API
      const fileBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix (data:image/jpeg;base64,)
          const base64 = result.split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(targetFile);
      });

      // Get OpenAI API key from user input (temporary solution)
      const apiKey = window.prompt("Please enter your OpenAI API key:");
      if (!apiKey) {
        throw new Error("OpenAI API key is required");
      }

      // Build extraction prompt using column instructions
      const extractionFields = Object.entries(columnInstructions)
        .map(([column, instruction]) => `- ${column}: ${instruction}`)
        .join('\n');

      const extractionPrompt = `Analyze this document and extract the following information. Return the data as a JSON object with the exact field names specified:

${extractionFields}

Instructions:
1. Extract only the information requested for each field
2. If information is not found, use an empty string ""
3. Be as accurate as possible to the source document
4. Return valid JSON format only, no additional text

Expected JSON format:
{
${Object.keys(columnInstructions).map(col => `  "${col}": "extracted value"`).join(',\n')}
}`;

      // Call OpenAI API
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: extractionPrompt
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:${targetFile.type};base64,${fileBase64}`,
                    detail: 'high'
                  }
                }
              ]
            }
          ],
          max_tokens: 1000,
          temperature: 0.1
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      const extractedText = result.choices[0]?.message?.content;

      if (!extractedText) {
        throw new Error('No response from OpenAI API');
      }

      // Parse the JSON response
      let extractedData: Record<string, string>;
      try {
        // Remove any markdown code blocks if present
        const cleanedText = extractedText.replace(/```json\n?|\n?```/g, '').trim();
        extractedData = JSON.parse(cleanedText);
      } catch (parseError) {
        console.error('Failed to parse OpenAI response:', extractedText);
        throw new Error('Failed to parse extracted data. Please try again.');
      }

      console.log('Extracted data:', extractedData);
      
      // Only update the main form data if no specific file was passed (main document)
      if (!fileToAnalyze) {
        console.log('Updating main formData with extracted data');
        setFormData(extractedData);
        
        toast({
          title: "Document analyzed successfully",
          description: "Data has been extracted from the document using AI.",
        });
      } else {
        console.log('Not updating main formData - this is for batch processing');
      }
      
      return extractedData;
      
    } catch (error: any) {
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze document. Please check your API key and try again.",
        variant: "destructive",
      });
      return {};
    } finally {
      setIsAnalyzing(false);
      console.log('Analysis completed');
    }
  };

  // Add current form data to spreadsheet
  const addToSpreadsheet = (dataToAdd?: Record<string, string>) => {
    console.log('addToSpreadsheet called with dataToAdd:', dataToAdd);
    const targetData = dataToAdd || formData;
    console.log('targetData:', targetData);
    
    // Check if any field has data
    const hasData = Object.values(targetData).some(value => value.trim() !== '');
    console.log('hasData:', hasData);
    
    if (!hasData) {
      toast({
        title: "No data to add",
        description: "Please fill in some fields or analyze the document first.",
        variant: "destructive",
      });
      return;
    }

    console.log('Adding data to spreadsheet:', targetData);
    console.log('Current spreadsheetData before adding:', spreadsheetData);
    
    setSpreadsheetData(prev => {
      // Find the first completely empty row
      const firstEmptyRowIndex = prev.findIndex(row => 
        Object.values(row).every(value => value.trim() === '')
      );
      
      let newData;
      if (firstEmptyRowIndex >= 0) {
        // Insert data into the first empty row
        newData = [...prev];
        newData[firstEmptyRowIndex] = { ...targetData };
        console.log('Inserted data at row index:', firstEmptyRowIndex);
      } else {
        // If no empty row found, append to the end
        newData = [...prev, { ...targetData }];
        console.log('Appended data to end of spreadsheet');
      }
      
      console.log('New spreadsheetData after adding:', newData);
      return newData;
    });
    
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

  // Get started dialog handlers
  const handleUploadRunsheet = () => {
    setShowGetStarted(false);
    // Trigger the upload functionality from EditableSpreadsheet
    const uploadEvent = new CustomEvent('triggerSpreadsheetUpload');
    window.dispatchEvent(uploadEvent);
  };

  const handleOpenExisting = () => {
    setShowGetStarted(false);
    // Trigger the open existing functionality from EditableSpreadsheet
    const openEvent = new CustomEvent('triggerSpreadsheetOpen');
    window.dispatchEvent(openEvent);
  };

  const handleStartNew = () => {
    setShowGetStarted(false);
    // Just close the dialog and start with the current empty state
  };

  return (
    <div className="w-full px-4 py-6">
      <div className="flex items-center justify-between mb-8">
        <Link to="/" className="flex items-center gap-4 hover:opacity-80 transition-opacity">
          <img 
            src={extractorLogo} 
            alt="Document Data Extractor Logo" 
            className="h-16 w-16"
          />
          <h1 className="text-3xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            RunsheetPro
          </h1>
        </Link>
        <AuthButton />
      </div>
      
      <div className="mt-6">
        <DocumentFrame 
          file={file}
          previewUrl={previewUrl}
          fields={columns}
          formData={formData}
          onChange={handleFieldChange}
          onAnalyze={analyzeDocument}
          onAddToSpreadsheet={addToSpreadsheet}
          onFileSelect={handleFileSelect}
          onMultipleFilesSelect={handleMultipleFilesSelect}
          onResetDocument={resetDocument}
          isAnalyzing={isAnalyzing}
        />
      </div>
      
      <BatchProcessing 
        fields={columns}
        onAddToSpreadsheet={addToSpreadsheet}
        onAnalyze={analyzeDocument}
        isAnalyzing={isAnalyzing}
      />
      
      <EditableSpreadsheet 
        initialColumns={columns}
        initialData={spreadsheetData}
        onColumnChange={setColumns}
        onDataChange={setSpreadsheetData}
        onColumnInstructionsChange={setColumnInstructions}
      />
      
      {/* Get Started Dialog */}
      <Dialog open={showGetStarted} onOpenChange={setShowGetStarted}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-center">Welcome to RunsheetPro</DialogTitle>
            <DialogDescription className="text-center pt-2">
              How would you like to get started today?
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-6">
            <Button
              onClick={handleUploadRunsheet}
              className="h-16 flex flex-col gap-2 text-left"
              variant="outline"
            >
              <div className="flex items-center gap-3 w-full">
                <Upload className="h-6 w-6" />
                <div className="flex flex-col text-left">
                  <span className="font-semibold">Upload Runsheet</span>
                  <span className="text-sm text-muted-foreground">Import an existing CSV or Excel file</span>
                </div>
              </div>
            </Button>
            
            <Button
              onClick={handleOpenExisting}
              className="h-16 flex flex-col gap-2 text-left"
              variant="outline"
            >
              <div className="flex items-center gap-3 w-full">
                <FolderOpen className="h-6 w-6" />
                <div className="flex flex-col text-left">
                  <span className="font-semibold">Open Existing Runsheet</span>
                  <span className="text-sm text-muted-foreground">Load a previously saved runsheet</span>
                </div>
              </div>
            </Button>
            
            <Button
              onClick={handleStartNew}
              className="h-16 flex flex-col gap-2 text-left"
              variant="default"
            >
              <div className="flex items-center gap-3 w-full">
                <Plus className="h-6 w-6" />
                <div className="flex flex-col text-left">
                  <span className="font-semibold">Start New Runsheet</span>
                  <span className="text-sm text-muted-foreground">Begin with a fresh, empty runsheet</span>
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Combine Images Confirmation Dialog */}
      <Dialog open={showCombineConfirmation} onOpenChange={setShowCombineConfirmation}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Combine Images</DialogTitle>
            <DialogDescription>
              You've selected {pendingFiles.length} images. Would you like to combine them into a single PDF document? Each image will become a separate page.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 justify-end pt-4">
            <Button variant="outline" onClick={handleCombineCancel} disabled={isProcessingCombination}>
              Cancel
            </Button>
            <Button onClick={handleCombineConfirm} disabled={isProcessingCombination}>
              {isProcessingCombination ? "Combining..." : "Yes, combine them"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Column Instructions Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Configuration Required</DialogTitle>
            <DialogDescription>
              All column headers must have extraction instructions configured before analyzing documents.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-3">
              Please configure extraction instructions for the following columns:
            </p>
            <div className="bg-muted p-3 rounded-md">
              <ul className="list-disc list-inside space-y-1">
                {missingColumns.map((column) => (
                  <li key={column} className="text-sm font-medium text-foreground">
                    {column}
                  </li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Click on any column header in the spreadsheet below to add extraction instructions.
            </p>
          </div>
          <div className="flex justify-end">
            <Button onClick={() => setShowValidationDialog(false)}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentProcessor;
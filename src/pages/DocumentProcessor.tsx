import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from '@/components/ui/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FolderOpen, Plus, AlertTriangle, Smartphone, Files, Home } from 'lucide-react';
import DocumentFrame from '@/components/DocumentFrame';
import EditableSpreadsheet from '@/components/EditableSpreadsheet';
import AuthButton from '@/components/AuthButton';
import BatchProcessing from '@/components/BatchProcessing';
import DocumentUpload from '@/components/DocumentUpload';
import { GoogleDrivePicker } from '@/components/GoogleDrivePicker';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { AdminSettingsService } from '@/services/adminSettings';
import { supabase } from '@/integrations/supabase/client';

import extractorLogo from '@/assets/document-extractor-logo.png';

// Initial columns for the spreadsheet
const DEFAULT_COLUMNS = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes', 'Document File Name'];

// Default extraction instructions for each column
const DEFAULT_EXTRACTION_INSTRUCTIONS: Record<string, string> = {
  'Inst Number': 'Extract the instrument number or recording number as it appears on the document',
  'Book/Page': 'Extract the book and page reference (format: Book XXX, Page XXX or XXX/XXX)',
  'Inst Type': 'Extract the document type (e.g., Deed, Mortgage, Lien, Assignment, etc.)',
  'Recording Date': 'Extract the official recording date in MM/DD/YYYY format',
  'Document Date': 'Extract the date the document was signed or executed in MM/DD/YYYY format',
  'Grantor': 'Extract the full name(s) of the grantor(s) - the party transferring or granting rights',
  'Grantee': 'Extract the full name(s) of the grantee(s) - the party receiving rights',
  'Legal Description': 'Extract the complete legal property description including lot, block, subdivision, and any metes and bounds',
  'Notes': 'Extract any special conditions, considerations, or additional relevant information',
  'Document File Name': 'The desired filename for the stored document (user-specified)'
};

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
  const [highlightMissingColumns, setHighlightMissingColumns] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  
  // Note: Navigation blocking removed since runsheet auto-saves
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Ref to track if we've already loaded a runsheet to prevent infinite loops
  const loadedRunsheetRef = useRef<string | null>(null);
  
  // Preferences loading state
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  // Load user preferences and handle selected runsheet on component mount
  useEffect(() => {
    const loadUserPreferences = async () => {
      setIsLoadingPreferences(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const preferences = await ExtractionPreferencesService.getDefaultPreferences();
          
          if (preferences && preferences.columns && preferences.column_instructions) {
            // Load saved preferences
            setColumns(preferences.columns);
            setColumnInstructions(preferences.column_instructions as Record<string, string>);
            console.log('Loaded user preferences:', preferences);
          } else {
            // No saved preferences, use defaults and save them
            setColumns(DEFAULT_COLUMNS);
            setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
            await ExtractionPreferencesService.saveDefaultPreferences(
              DEFAULT_COLUMNS, 
              DEFAULT_EXTRACTION_INSTRUCTIONS
            );
            console.log('Created default preferences for user');
          }
        } else {
          // Not authenticated, use defaults
          setColumns(DEFAULT_COLUMNS);
          setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
        }
      } catch (error) {
        console.error('Error loading user preferences:', error);
        // Fallback to defaults on error
        setColumns(DEFAULT_COLUMNS);
        setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
      } finally {
        setIsLoadingPreferences(false);
      }
    };

    loadUserPreferences();
  }, []);

  // Handle selected runsheet from navigation state
  useEffect(() => {
    const selectedRunsheet = location.state?.runsheet;
    
    // Use ref to prevent infinite loops - only load each runsheet once
    if (selectedRunsheet && loadedRunsheetRef.current !== selectedRunsheet.id) {
      console.log('Loading selected runsheet:', selectedRunsheet);
      loadedRunsheetRef.current = selectedRunsheet.id;
      
      // Load runsheet data
      if (selectedRunsheet.data && Array.isArray(selectedRunsheet.data)) {
        setSpreadsheetData(selectedRunsheet.data);
      }
      
      // Load runsheet columns if available
      if (selectedRunsheet.columns && Array.isArray(selectedRunsheet.columns)) {
        console.log('Loading runsheet columns:', selectedRunsheet.columns);
        setColumns(selectedRunsheet.columns);
      }
      
      // Load column instructions if available
      if (selectedRunsheet.column_instructions) {
        setColumnInstructions(selectedRunsheet.column_instructions);
      }
      
      toast({
        title: "Runsheet loaded",
        description: `Loaded "${selectedRunsheet.name}" with ${selectedRunsheet.data?.length || 0} rows.`,
      });
    }
  }, [location.state]);

  // Handle URL parameters for actions (upload, google-drive, etc.)
  useEffect(() => {
    const action = searchParams.get('action');
    
    if (action === 'upload') {
      // Trigger file input click to open upload dialog
      setTimeout(() => {
        const fileInput = document.getElementById('document-upload-input');
        if (fileInput) {
          fileInput.click();
        }
      }, 500); // Small delay to ensure component is rendered
    }
  }, [searchParams]);
  
  // Auto-save preferences when columns or instructions change
  useEffect(() => {
    if (!isLoadingPreferences && columns.length > 0 && Object.keys(columnInstructions).length > 0) {
      const savePreferences = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await ExtractionPreferencesService.saveDefaultPreferences(columns, columnInstructions);
          console.log('Auto-saved user preferences');
        }
      };
      
      // Debounce the save to avoid too many API calls
      const timeoutId = setTimeout(savePreferences, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [columns, columnInstructions, isLoadingPreferences]);

  // Load user preferences on component mount
  
  // Update form state when columns change - but only if form is being actively used
  useEffect(() => {
    // Only reset form data if we actually have meaningful columns to work with
    if (columns.length === 0) return;
    
    const newFormData: Record<string, string> = {};
    // Only include current columns, don't preserve old data
    columns.forEach(column => {
      newFormData[column] = '';
    });
    
    // Force clear any existing form data that doesn't match current columns
    setFormData(newFormData);
    console.log('Form data reset to match current columns:', columns);
    console.log('Previous form data cleared, new form data:', newFormData);
  }, [columns]);

  // Note: Navigation blocking removed since runsheet now auto-saves

  // Handle navigation - no longer blocked since runsheet auto-saves
  const handleNavigation = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  // Handle spreadsheet data changes
  const handleSpreadsheetDataChange = (data: Record<string, string>[]) => {
    setSpreadsheetData(data);
  };

  // Handle columns change
  const handleColumnsChange = (newColumns: string[]) => {
    console.log('Columns changed from spreadsheet:', newColumns);
    setColumns(newColumns);
  };

  // Handle validation dialog close and scroll to columns
  const handleValidationDialogClose = () => {
    setShowValidationDialog(false);
    
    // Scroll to spreadsheet and highlight missing columns
    setTimeout(() => {
      const spreadsheetElement = document.querySelector('[data-spreadsheet-container]');
      if (spreadsheetElement) {
        spreadsheetElement.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        });
        
        // Highlight missing columns for 10 seconds
        setHighlightMissingColumns(true);
        setTimeout(() => {
          setHighlightMissingColumns(false);
        }, 10000);
      }
    }, 100);
  };


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

  // Handle combine confirmation - create single image for analysis
  const handleCombineConfirm = async () => {
    setShowCombineConfirmation(false);
    setIsProcessingCombination(true);
    
    try {
      const { combineImages } = await import('@/utils/imageCombiner');
      const { file: combinedFile, previewUrl: newPreviewUrl } = await combineImages(pendingFiles, { type: 'vertical' });
      
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
        description: `Combined ${pendingFiles.length} images into a single document for analysis.`,
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

    // Check if all columns have extraction instructions configured (excluding Document File Name)
    console.log('Current columns:', columns);
    console.log('Current columnInstructions:', columnInstructions);
    const columnsWithoutInstructions = columns.filter(column => 
      column !== 'Document File Name' && // Skip Document File Name - it's user-specified, not extracted
      (!columnInstructions[column] || columnInstructions[column].trim() === '')
    );
    console.log('Columns without instructions:', columnsWithoutInstructions);
    
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

      // Build extraction prompt using column instructions (excluding Document File Name)
      const extractionFields = Object.entries(columnInstructions)
        .filter(([column]) => column !== 'Document File Name') // Skip Document File Name in AI extraction
        .map(([column, instruction]) => `- ${column}: ${instruction}`)
        .join('\n');

      // Get global admin instructions
      const globalInstructions = await AdminSettingsService.getGlobalExtractionInstructions();
      
      // Build extraction prompt including global instructions
      let extractionPrompt = `Analyze this document and extract the following information. Return the data as a JSON object with the exact field names specified:

${extractionFields}

Instructions:
1. Extract only the information requested for each field
2. If information is not found, use an empty string ""
3. Be as accurate as possible to the source document
4. Return valid JSON format only, no additional text`;

      // Add global admin instructions to user prompt as well for reinforcement
      if (globalInstructions.trim()) {
        extractionPrompt += `\n\nAdditional Extraction Guidelines:\n${globalInstructions}`;
      }

      extractionPrompt += `

Expected JSON format:
{
${Object.entries(columnInstructions).filter(([column]) => column !== 'Document File Name').map(([col]) => `  "${col}": "extracted value"`).join(',\n')}
}

Image: [base64 image data]`;

      // Build enhanced system message with global instructions
      let systemMessage = "You are a document analysis assistant. Analyze the provided image and extract the requested information in JSON format.";
      
      if (globalInstructions.trim()) {
        systemMessage += `\n\nGlobal Extraction Guidelines:\n${globalInstructions}`;
      }

      // Call company's OpenAI Edge Function for document analysis
      const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/analyze-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: extractionPrompt,
          imageData: `data:${targetFile.type};base64,${fileBase64}`,
          systemMessage: systemMessage
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`OpenAI API error: ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      const extractedText = result.generatedText;

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

  // Handle starting a new runsheet
  const handleStartNew = () => {
    // Reset to default state with default extraction instructions
    setColumns(DEFAULT_COLUMNS);
    setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
    setSpreadsheetData([]);
    setFormData({});
    
    // Dispatch event to reset the spreadsheet
    const resetEvent = new CustomEvent('resetSpreadsheet');
    window.dispatchEvent(resetEvent);
  };


  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link to="/" className="flex items-center gap-4">
              <img 
                src={extractorLogo} 
                alt="RunsheetPro Logo" 
                className="h-12 w-12"
              />
              <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                RunsheetPro
              </h1>
            </Link>
            <div className="flex items-center gap-4">
              <Button
                variant="default"
                size="sm"
                onClick={() => {
                  if (hasUnsavedChanges) {
                    setShowNavigationDialog(true);
                  } else {
                    navigate('/app');
                  }
                }}
                className="gap-2"
              >
                <Home className="h-4 w-4" />
                Dashboard
              </Button>
              <AuthButton />
            </div>
          </div>
        </div>
      </header>
      
      <div className="container mx-auto px-4 py-6">
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
        
        <BatchProcessing 
          fields={columns}
          onAddToSpreadsheet={addToSpreadsheet}
          onAnalyze={analyzeDocument}
          isAnalyzing={isAnalyzing}
        />
        
        <div className="mt-6">
          <EditableSpreadsheet 
            initialColumns={columns}
            initialData={spreadsheetData}
            onColumnChange={handleColumnsChange}
            onDataChange={handleSpreadsheetDataChange}
            onColumnInstructionsChange={setColumnInstructions}
            onUnsavedChanges={setHasUnsavedChanges}
            missingColumns={highlightMissingColumns ? missingColumns : []}
            initialRunsheetName={location.state?.runsheet?.name}
            initialRunsheetId={location.state?.runsheetId}
          />
        </div>
      </div>
      {/* Combine Images Confirmation Dialog */}
      <Dialog open={showCombineConfirmation} onOpenChange={setShowCombineConfirmation}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Combine Images</DialogTitle>
            <DialogDescription>
              You've selected {pendingFiles.length} images. Would you like to combine them into a single image for document analysis?
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
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleValidationDialogClose}>
              Continue
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Navigation Confirmation Dialog */}
      <Dialog open={showNavigationDialog} onOpenChange={setShowNavigationDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes in your runsheet. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-3">
            <Button variant="outline" onClick={() => setShowNavigationDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowNavigationDialog(false);
                navigate('/app');
              }}
            >
              Leave Without Saving
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentProcessor;
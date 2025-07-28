import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FolderOpen, Plus, AlertTriangle, Smartphone, Files, Home, FileStack, RefreshCw } from 'lucide-react';
import DocumentFrame from '@/components/DocumentFrame';
import EditableSpreadsheet from '@/components/EditableSpreadsheet';
import AuthButton from '@/components/AuthButton';
import BatchProcessing from '@/components/BatchProcessing';
import DocumentUpload from '@/components/DocumentUpload';
import MultipleFileUpload from '@/components/MultipleFileUpload';
import { GoogleDrivePicker } from '@/components/GoogleDrivePicker';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { AdminSettingsService } from '@/services/adminSettings';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import { supabase } from '@/integrations/supabase/client';

import extractorLogo from '@/assets/document-extractor-logo.png';

// Initial columns for the spreadsheet
const DEFAULT_COLUMNS = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'];

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
  'Notes': 'Extract any special conditions, considerations, or additional relevant information'
};

const DocumentProcessor: React.FC = () => {
  // Hook to get active runsheet data  
  const { activeRunsheet, setActiveRunsheet } = useActiveRunsheet();
  
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
  const [analysisAbortController, setAnalysisAbortController] = useState<AbortController | null>(null);
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [documentMap, setDocumentMap] = useState<Map<number, any>>(new Map());
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [missingColumns, setMissingColumns] = useState<string[]>([]);
  const [highlightMissingColumns, setHighlightMissingColumns] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNavigationDialog, setShowNavigationDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<{path: string, state?: any} | null>(null);
  const [showMultipleFileUpload, setShowMultipleFileUpload] = useState(false);
  const [missingDataDialog, setMissingDataDialog] = useState(false);
  const [confirmAddFileDialog, setConfirmAddFileDialog] = useState(false);
  
  // Note: Navigation blocking removed since runsheet auto-saves
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Ref to track if we've already loaded a runsheet to prevent infinite loops
  const loadedRunsheetRef = useRef<string | null>(null);
  
  // Preferences loading state
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);

  // Note: Removed activeRunsheet syncing since we're removing tab functionality
  
  // Load user preferences and handle selected runsheet on component mount
  useEffect(() => {
    const loadUserPreferences = async () => {
      // Don't load user preferences if we have a runsheet - runsheet columns take priority
      const selectedRunsheet = location.state?.runsheet;
      if (selectedRunsheet && selectedRunsheet.columns) {
        console.log('Skipping user preferences load - using runsheet columns instead');
        setIsLoadingPreferences(false);
        return;
      }
      
      setIsLoadingPreferences(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const preferences = await ExtractionPreferencesService.getDefaultPreferences();
          
          if (preferences && preferences.columns && preferences.column_instructions) {
            // Load saved preferences only if no runsheet is active
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
      
      // Load runsheet columns if available - these should take priority over user preferences
      if (selectedRunsheet.columns && Array.isArray(selectedRunsheet.columns)) {
        console.log('Loading runsheet columns (takes priority over user preferences):', selectedRunsheet.columns);
        setColumns(selectedRunsheet.columns);
        
        // Also update user preferences to match the runsheet columns to keep them in sync
        const updatePreferences = async () => {
          try {
            const { data: { user } } = await supabase.auth.getUser();
            if (user && selectedRunsheet.column_instructions) {
              // Filter column instructions to only include columns that exist in the runsheet
              const filteredInstructions: Record<string, string> = {};
              selectedRunsheet.columns.forEach(column => {
                if (selectedRunsheet.column_instructions[column]) {
                  filteredInstructions[column] = selectedRunsheet.column_instructions[column];
                }
              });
              
              // Save the filtered preferences to prevent future conflicts
              await ExtractionPreferencesService.saveDefaultPreferences(
                selectedRunsheet.columns, 
                filteredInstructions
              );
              console.log('Updated user preferences to match runsheet columns');
            }
          } catch (error) {
            console.error('Error updating user preferences:', error);
          }
        };
        
        updatePreferences();
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

  // Handle URL parameters for actions (upload, google-drive, etc.) and runsheet ID
  useEffect(() => {
    const action = searchParams.get('action');
    const runsheetId = searchParams.get('id') || searchParams.get('runsheet');
    console.log('DocumentProcessor useEffect - action from searchParams:', action);
    console.log('DocumentProcessor useEffect - runsheetId from searchParams:', runsheetId);
    
    // Load specific runsheet if ID is provided
    if (runsheetId && !loadedRunsheetRef.current) {
      console.log('Loading runsheet from URL parameter:', runsheetId);
      loadedRunsheetRef.current = runsheetId;
      
      // Dispatch event to load the runsheet
      const loadEvent = new CustomEvent('loadSpecificRunsheet', {
        detail: { runsheetId }
      });
      window.dispatchEvent(loadEvent);
    }
    
    if (action === 'upload') {
      console.log('Upload action detected, triggering runsheet file dialog...');
      
      // Use the hidden file input that's already in the DOM
      const existingInput = document.getElementById('dashboard-upload-input') as HTMLInputElement;
      
      if (existingInput) {
        console.log('🔧 Using existing hidden file input');
        existingInput.click();
      } else {
        console.log('🔧 Creating new file input programmatically');
        // Create a file input programmatically as fallback
        const fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.xlsx,.xls,.csv';
        fileInput.multiple = false;
        fileInput.style.display = 'none';
        
        // Use a simple event handler that calls our function
        fileInput.onchange = (e) => {
          console.log('🔧 Programmatic file input change event triggered');
          handleDashboardFileSelect(e as any);
        };
        
        document.body.appendChild(fileInput);
        fileInput.click();
        
        // Clean up after a delay
        setTimeout(() => {
          if (document.body.contains(fileInput)) {
            document.body.removeChild(fileInput);
          }
        }, 1000);
      }
    } else if (action === 'google-drive') {
      console.log('Google Drive action detected, opening Google Drive picker...');
      // Trigger the Google Drive picker in the EditableSpreadsheet component
      const googleDriveEvent = new CustomEvent('openGoogleDrivePicker');
      window.dispatchEvent(googleDriveEvent);
    }
  }, [searchParams, loadedRunsheetRef]);

  // Handle file selection from dashboard upload
  const handleDashboardFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('🔧 handleDashboardFileSelect called!');
    console.log('🔧 Event target:', e.target);
    console.log('🔧 Files:', e.target.files);
    
    const files = e.target.files;
    if (files && files.length > 0) {
      // For runsheet uploads, we only handle single files
      const selectedFile = files[0];
      console.log('🔧 DocumentProcessor: File selected:', selectedFile.name, 'Type:', selectedFile.type);
      
      // Check if it's a valid runsheet file type
      const validExtensions = ['.xlsx', '.xls', '.csv'];
      const fileExtension = selectedFile.name.toLowerCase().substr(selectedFile.name.lastIndexOf('.'));
      console.log('🔧 File extension:', fileExtension);
      
      if (!validExtensions.includes(fileExtension)) {
        console.log('🔧 Invalid file type detected');
        toast({
          title: "Invalid file type",
          description: "Please select an Excel (.xlsx, .xls) or CSV (.csv) file for runsheet upload.",
          variant: "destructive",
        });
        return;
      }
      
      // Trigger the spreadsheet import functionality directly
      // Create a custom event that the EditableSpreadsheet component can listen to
      console.log('🔧 DocumentProcessor: Dispatching importRunsheetFile event with file:', selectedFile.name);
      const importEvent = new CustomEvent('importRunsheetFile', {
        detail: { file: selectedFile }
      });
      window.dispatchEvent(importEvent);
      console.log('🔧 DocumentProcessor: importRunsheetFile event dispatched successfully');
      
      toast({
        title: "Importing runsheet",
        description: `Processing ${selectedFile.name}...`,
      });
    } else {
      console.log('🔧 No files selected or files array is empty');
    }
    // Reset the input so the same file can be selected again
    e.target.value = '';
  };
  
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
    
    // Create completely new form data object with only current columns
    const newFormData: Record<string, string> = {};
    columns.forEach(column => {
      newFormData[column] = '';
    });
    
    // Force replace the entire form data object to ensure no old fields persist
    setFormData(newFormData);
    console.log('Form data completely replaced to match current columns:', columns);
    console.log('Old form data cleared, new form data keys:', Object.keys(newFormData));
  }, [columns]);

  // Listen for force form data reset events from DataForm refresh button
  useEffect(() => {
    const handleForceFormDataReset = (event: CustomEvent) => {
      const { targetFields } = event.detail;
      console.log('DocumentProcessor: Received force form data reset event for fields:', targetFields);
      
      // Create completely new form data object with only target fields
      const newFormData: Record<string, string> = {};
      targetFields.forEach((field: string) => {
        newFormData[field] = '';
      });
      
      // Force replace the entire form data object
      setFormData(newFormData);
      console.log('DocumentProcessor: Force reset complete - new form data keys:', Object.keys(newFormData));
    };

    window.addEventListener('forceFormDataReset', handleForceFormDataReset as EventListener);
    
    return () => {
      window.removeEventListener('forceFormDataReset', handleForceFormDataReset as EventListener);
    };
  }, []);

  // Listen for force reset to defaults events from DataForm refresh button
  useEffect(() => {
    const handleForceResetToDefaults = (event: CustomEvent) => {
      const { defaultColumns } = event.detail;
      console.log('DocumentProcessor: Received force reset to defaults event for columns:', defaultColumns);
      
      // Force reset the DocumentProcessor state to defaults
      setColumns(defaultColumns);
      setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
      
      // ONLY clear spreadsheet data if we don't have an active runsheet
      // This prevents losing runsheet data when refreshing fields
      const currentRunsheetId = activeRunsheet?.id || location.state?.runsheet?.id;
      if (!currentRunsheetId) {
        console.log('No active runsheet - clearing spreadsheet data');
        setSpreadsheetData([]);
      } else {
        console.log('Active runsheet found - preserving spreadsheet data');
      }
      
      console.log('DocumentProcessor: Force reset to defaults complete');
    };

    window.addEventListener('forceResetToDefaults', handleForceResetToDefaults as EventListener);
    
    return () => {
      window.removeEventListener('forceResetToDefaults', handleForceResetToDefaults as EventListener);
    };
  }, []);

  // Listen for unsaved changes navigation checks
  useEffect(() => {
    const handleCheckUnsavedChanges = (event: CustomEvent) => {
      const { targetPath, targetState } = event.detail;
      console.log('Navigation requested to:', targetPath, 'with state:', targetState);
      
      if (hasUnsavedChanges) {
        console.log('Has unsaved changes, storing pending navigation and showing dialog');
        setPendingNavigation({ path: targetPath, state: targetState });
        setShowNavigationDialog(true);
      } else {
        console.log('No unsaved changes, navigating directly');
        if (targetState) {
          navigate(targetPath, { state: targetState });
        } else {
          navigate(targetPath);
        }
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey && event.key === 's') {
        event.preventDefault();
        // Trigger save by dispatching save event to the spreadsheet
        const saveEvent = new CustomEvent('saveRunsheet');
        window.dispatchEvent(saveEvent);
      }
    };

    window.addEventListener('checkUnsavedChanges', handleCheckUnsavedChanges as EventListener);
    window.addEventListener('keydown', handleKeyDown);
    
    return () => {
      window.removeEventListener('checkUnsavedChanges', handleCheckUnsavedChanges as EventListener);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [hasUnsavedChanges, navigate]);

  // Listen for save completion events to clear unsaved changes flag
  useEffect(() => {
    const handleSaveComplete = () => {
      console.log('🔍 Runsheet save completed, clearing hasUnsavedChanges flag');
      setHasUnsavedChanges(false);
    };

    window.addEventListener('runsheetSaved', handleSaveComplete);
    
    return () => {
      window.removeEventListener('runsheetSaved', handleSaveComplete);
    };
  }, []);

  // Handle navigation - no longer blocked since runsheet auto-saves
  const handleNavigation = useCallback((path: string) => {
    navigate(path);
  }, [navigate]);

  // Handle spreadsheet data changes
  const handleSpreadsheetDataChange = (data: Record<string, string>[]) => {
    setSpreadsheetData(data);
    setHasUnsavedChanges(true); // Mark as unsaved when data changes
  };

  // Handle document map changes from EditableSpreadsheet
  const handleDocumentMapChange = (newDocumentMap: Map<number, any>) => {
    console.log('Document map updated in DocumentProcessor:', newDocumentMap);
    setDocumentMap(newDocumentMap);
  };

  // Handle columns change
  const handleColumnsChange = (newColumns: string[]) => {
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

  // Cancel document analysis
  const cancelAnalysis = () => {
    if (analysisAbortController) {
      analysisAbortController.abort();
      setAnalysisAbortController(null);
      setIsAnalyzing(false);
      toast({
        title: "Analysis cancelled",
        description: "Document analysis has been cancelled.",
        variant: "default",
      });
    }
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
    
    // Remove save check from analysis - analysis can happen without saving
    // The save check will be moved to addToSpreadsheet function instead
    
    // Create abort controller for this analysis
    const abortController = new AbortController();
    setAnalysisAbortController(abortController);
    
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
        }),
        signal: abortController.signal // Add abort signal to the fetch request
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
      
      // If we have a file being analyzed, we need to upload it to storage first to get a real storage path
      if (file || fileToAnalyze) {
        const targetFile = fileToAnalyze || file;
        if (targetFile) {
          console.log('Uploading analyzed document to storage for linking...');
          
          try {
            // Upload the file to storage to get a real storage path
            const { data: { user } } = await supabase.auth.getUser();
            if (user) {
              // Generate a unique filename
              const timestamp = Date.now();
              const fileExtension = targetFile.name.split('.').pop() || '';
              const fileName = `analyzed_${timestamp}.${fileExtension}`;
              const filePath = `${user.id}/analyzed/${fileName}`;
              
              // Upload to storage
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('documents')
                .upload(filePath, targetFile, {
                  cacheControl: '3600',
                  upsert: false
                });
              
              if (uploadError) {
                console.error('Error uploading analyzed document:', uploadError);
              } else {
                // Add the real storage path to extracted data
                extractedData['Storage Path'] = filePath;
                extractedData['Document File Name'] = targetFile.name;
                console.log('Successfully uploaded analyzed document, added storage info:', {
                  'Storage Path': extractedData['Storage Path'],
                  'Document File Name': extractedData['Document File Name']
                });
              }
            }
          } catch (error) {
            console.error('Error uploading analyzed document:', error);
            // Fall back to just the filename if upload fails
            extractedData['Document File Name'] = targetFile.name;
          }
        }
      }
      
      // Only update the main form data if no specific file was passed (main document)
      if (!fileToAnalyze) {
        console.log('🔧 ANALYSIS: Updating main formData with extracted data');
        console.log('🔧 ANALYSIS: extractedData contains Storage Path:', extractedData['Storage Path']);
        console.log('🔧 ANALYSIS: extractedData contains Document File Name:', extractedData['Document File Name']);
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
      // Handle cancellation gracefully
      if (error.name === 'AbortError') {
        console.log('Analysis was cancelled by user');
        return {};
      }
      
      console.error('Analysis error:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze document. Please check your API key and try again.",
        variant: "destructive",
      });
      return {};
    } finally {
      setIsAnalyzing(false);
      setAnalysisAbortController(null);
      console.log('Analysis completed');
    }
  };

  // Generate smart filename using user's naming preferences
  const generateSmartFilename = async (formData: Record<string, string>): Promise<string> => {
    try {
      let namingPrefs = {
        priority_columns: ['name', 'title', 'invoice_number', 'document_number', 'reference', 'id'],
        max_filename_parts: 3,
        separator: '_',
        include_extension: true,
        fallback_pattern: 'document_{row_index}_{timestamp}'
      };

      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Get user's naming preferences if logged in
        const { data: preferences } = await supabase
          .from('user_document_naming_preferences')
          .select('*')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (preferences) {
          namingPrefs = preferences;
        }
      }

      // Build filename from available form data using priority columns
      const filenameParts: string[] = [];
      
      for (const column of namingPrefs.priority_columns) {
        const value = formData[column];
        if (value && value.trim() && value.trim() !== 'N/A') {
          // Clean the value: remove special characters, limit length
          let cleanValue = value.trim()
            .replace(/[^a-zA-Z0-9\-_\s]/g, '')
            .replace(/\s+/g, namingPrefs.separator)
            .substring(0, 30);
          
          if (cleanValue) {
            filenameParts.push(cleanValue);
          }
          
          // Stop when we have enough parts
          if (filenameParts.length >= namingPrefs.max_filename_parts) {
            break;
          }
        }
      }

      // Generate filename
      let filename;
      if (filenameParts.length > 0) {
        filename = filenameParts.join(namingPrefs.separator);
      } else {
        // Use fallback pattern
        filename = namingPrefs.fallback_pattern
          .replace('{row_index}', '1')
          .replace('{timestamp}', Date.now().toString());
      }

      // Add extension if preferences say so
      if (namingPrefs.include_extension) {
        filename += '.pdf';
      }

      return filename;
      
    } catch (error) {
      console.error('Error generating smart filename:', error);
      return `document_${Date.now()}.pdf`;
    }
  };

  // Add current form data to spreadsheet
  const addToSpreadsheet = async (dataToAdd?: Record<string, string>) => {
    // Check localStorage for active runsheet as fallback
    let runsheetId = activeRunsheet?.id || location.state?.runsheet?.id;
    
    if (!runsheetId) {
      try {
        const storedRunsheet = localStorage.getItem('activeRunsheet');
        if (storedRunsheet) {
          const parsed = JSON.parse(storedRunsheet);
          runsheetId = parsed.id;
          setActiveRunsheet(parsed);
        }
      } catch (error) {
        // Silent error handling
      }
    }
    
    if (!runsheetId) {
      // Create temporary runsheet automatically
      const tempRunsheet = {
        id: 'temp-' + Date.now(),
        name: 'Quick Runsheet',
        data: spreadsheetData,
        columns: columns,
        columnInstructions: columnInstructions
      };
      
      setActiveRunsheet(tempRunsheet);
      runsheetId = tempRunsheet.id;
      
      toast({
        title: "Created Temporary Runsheet",
        description: "A quick runsheet was created so you can add documents. Save it when ready.",
      });
    }
    
    const targetData = dataToAdd || formData;
    
    // No longer auto-generate smart filenames - use original filename by default
    if (!targetData['Document File Name'] || targetData['Document File Name'].trim() === '') {
      // Use original filename if available, otherwise use a simple fallback
      const originalFilename = file?.name || `document_${Date.now()}.pdf`;
      targetData['Document File Name'] = originalFilename;
      console.log('📄 FILENAME: Using original filename:', originalFilename);
    } else {
      console.log('📄 FILENAME: Document File Name already set:', targetData['Document File Name']);
    }
    
    // Check if there's a file uploaded or meaningful data to add
    const hasFile = !!file;
    // Check if there's meaningful extracted data (excluding auto-generated fields)
    const autoGeneratedFields = ['Document File Name', 'Storage Path'];
    const hasFormData = Object.entries(targetData).some(([key, value]) => 
      !autoGeneratedFields.includes(key) && value && value.trim() !== ''
    );
    
    console.log('🔧 ADD_TO_SPREADSHEET: Validation check:', {
      hasFile,
      hasFormData,
      targetData,
      formDataKeys: Object.keys(targetData),
      formDataValues: Object.values(targetData)
    });
    
    if (!hasFile && !hasFormData) {
      // No file and no data - show the missing data dialog
      setMissingDataDialog(true);
      return;
    }
    
    if (hasFile && !hasFormData) {
      // Has file but no extracted data - ask if they want to proceed
      setConfirmAddFileDialog(true);
      return;
    }

    // For single document processing, don't permanently add new columns to the global state
    // Only include data that matches existing columns to prevent persistent fields
    const filteredData: Record<string, string> = {};
    columns.forEach(column => {
      filteredData[column] = targetData[column] || '';
    });
    
    // Always preserve Storage Path if it exists, even if not in current columns
    // This is needed for document record creation
    if (targetData['Storage Path']) {
      filteredData['Storage Path'] = targetData['Storage Path'];
    }
    
    // Use filtered data instead of allowing new columns to persist
    const finalData = filteredData;
    
    console.log('🔧 DEBUG: finalData before spreadsheet addition:', finalData);
    
    console.log('Original analyzed data:', targetData);
    console.log('Filtered data to match current columns:', finalData);
    console.log('Current columns (unchanged):', columns);
    
    setSpreadsheetData(prev => {
      // Find the first row that is both empty in spreadsheet data AND has no linked document
      const firstEmptyRowIndex = prev.findIndex((row, index) => {
        const isDataEmpty = Object.values(row).every(value => value.trim() === '');
        const hasLinkedDocument = documentMap.has(index);
        return isDataEmpty && !hasLinkedDocument;
      });
      
      let newData;
      let targetRowIndex;
      if (firstEmptyRowIndex >= 0) {
        // Insert data into the first empty row
        newData = [...prev];
        newData[firstEmptyRowIndex] = { ...finalData };
        targetRowIndex = firstEmptyRowIndex;
      } else {
        // If no empty row found, append to the end
        newData = [...prev, { ...finalData }];
        targetRowIndex = prev.length; // New row index is the current length
      }
      
      // If data contains a storage path, create a document record
      if (finalData['Storage Path']) {
        createDocumentRecord(finalData, targetRowIndex);
      }
      
      return newData;
    });
    
    // Auto-save the runsheet after adding data to show filename options
    setTimeout(() => {
      const saveEvent = new CustomEvent('saveRunsheet');
      window.dispatchEvent(saveEvent);
    }, 100);
    
    toast({
      title: "Data added to spreadsheet",
      description: "The current data has been added as a new row.",
    });

    // Reset form data for next entry - use current columns (which may have been updated)
    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
  };

  // Continue adding to spreadsheet without validation (used after user confirms)
  const continueAddToSpreadsheet = () => {
    const targetData = formData;
    
    // Use original filename if available
    if (!targetData['Document File Name'] || targetData['Document File Name'].trim() === '') {
      const originalFilename = file?.name || `document_${Date.now()}.pdf`;
      targetData['Document File Name'] = originalFilename;
    }
    
    // Continue with the rest of the addToSpreadsheet logic
    const filteredData: Record<string, string> = {};
    columns.forEach(column => {
      filteredData[column] = targetData[column] || '';
    });
    
    if (targetData['Storage Path']) {
      filteredData['Storage Path'] = targetData['Storage Path'];
    }
    
    setSpreadsheetData(prev => {
      const firstEmptyRowIndex = prev.findIndex((row, index) => {
        const isDataEmpty = Object.values(row).every(value => value.trim() === '');
        const hasLinkedDocument = documentMap.has(index);
        return isDataEmpty && !hasLinkedDocument;
      });
      
      let newData;
      let targetRowIndex;
      if (firstEmptyRowIndex >= 0) {
        newData = [...prev];
        newData[firstEmptyRowIndex] = { ...filteredData };
        targetRowIndex = firstEmptyRowIndex;
      } else {
        newData = [...prev, { ...filteredData }];
        targetRowIndex = prev.length;
      }
      
      if (filteredData['Storage Path']) {
        createDocumentRecord(filteredData, targetRowIndex);
      }
      
      return newData;
    });
    
    setTimeout(() => {
      const saveEvent = new CustomEvent('saveRunsheet');
      window.dispatchEvent(saveEvent);
    }, 100);
    
    toast({
      title: "File added to spreadsheet",
      description: "The file has been added with just the filename.",
    });

    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
  };

  // Helper function to create a document record in the database
  const createDocumentRecord = async (data: Record<string, string>, rowIndex: number) => {
    console.log('🔧 CREATE_DOC_RECORD: createDocumentRecord called');
    console.log('🔧 CREATE_DOC_RECORD: data:', data);
    console.log('🔧 CREATE_DOC_RECORD: rowIndex:', rowIndex);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🔧 CREATE_DOC_RECORD: No user found, returning');
        return;
      }

      // Get the current runsheet ID from active runsheet or location state
      const runsheetId = activeRunsheet?.id || location.state?.runsheetId;
      console.log('🔧 CREATE_DOC_RECORD: activeRunsheet?.id:', activeRunsheet?.id);
      console.log('🔧 CREATE_DOC_RECORD: location.state?.runsheetId:', location.state?.runsheetId);
      console.log('🔧 CREATE_DOC_RECORD: Final runsheetId:', runsheetId);
      if (!runsheetId) {
        console.log('🔧 DocumentProcessor: No runsheet ID available, document record will be created when runsheet is saved');
        
        // Store the document info for later creation when the runsheet is saved
        const documentInfo = {
          rowIndex,
          storagePath: data['Storage Path'],
          fileName: data['Document File Name'] || file?.name || 'Unknown Document'
        };
        
        // Store in sessionStorage to be processed later
        const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
        pendingDocs.push(documentInfo);
        sessionStorage.setItem('pendingDocuments', JSON.stringify(pendingDocs));
        
        console.log('🔧 DocumentProcessor: Stored document info for later creation:', documentInfo);
        return;
      }

      const storagePath = data['Storage Path'];
      const fileName = data['Document File Name'] || file?.name || 'Unknown Document';
      
      if (storagePath) {
        console.log('🔧 DocumentProcessor: Creating document record with runsheet ID:', runsheetId);
        
        const { error } = await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            runsheet_id: runsheetId,
            row_index: rowIndex,
            file_path: storagePath,
            stored_filename: fileName,
            original_filename: fileName,
            content_type: 'application/pdf' // Default for most documents
          });
        
        if (error) {
          console.error('Error creating document record:', error);
        } else {
          console.log('Document record created successfully for row', rowIndex);
          
          // Dispatch a custom event to notify the spreadsheet to refresh documents
          console.log('🚨 DocumentProcessor: DISPATCHING EVENT! runsheetId:', runsheetId, 'rowIndex:', rowIndex);
          console.log('🔧 DocumentProcessor: Dispatching documentRecordCreated event with runsheetId:', runsheetId, 'rowIndex:', rowIndex);
          console.log('🔧 DocumentProcessor: Also including all possible IDs - activeRunsheet?.id:', activeRunsheet?.id, 'location.state?.runsheetId:', location.state?.runsheetId);
          window.dispatchEvent(new CustomEvent('documentRecordCreated', {
            detail: { 
              runsheetId, 
              rowIndex,
              allPossibleIds: {
                activeRunsheetId: activeRunsheet?.id,
                locationStateId: location.state?.runsheetId,
                finalRunsheetId: runsheetId
              }
            }
          }));
        }
      }
    } catch (error) {
      console.error('Error in createDocumentRecord:', error);
    }
  };

  // Handle starting a new runsheet
  const handleStartNew = () => {
    if (hasUnsavedChanges) {
      setPendingNavigation({ path: 'new-runsheet' });
      setShowNavigationDialog(true);
    } else {
      startNewRunsheet();
    }
  };

  const startNewRunsheet = async () => {
    // Clear the loaded runsheet ref to allow fresh loading
    loadedRunsheetRef.current = null;
    
    // Clear any file state
    setFile(null);
    setPreviewUrl(null);
    setPendingFiles([]);
    setSpreadsheetData([]);
    setFormData({});
    
    // Clear unsaved changes flag
    setHasUnsavedChanges(false);
    
    // Load user preferences for new runsheet
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (user) {
        const preferences = await ExtractionPreferencesService.getDefaultPreferences();
        
        if (preferences && preferences.columns && preferences.column_instructions) {
          setColumns(preferences.columns);
          setColumnInstructions(preferences.column_instructions as Record<string, string>);
          console.log('Loaded user preferences for new runsheet:', preferences);
        } else {
          // No saved preferences, use defaults
          setColumns(DEFAULT_COLUMNS);
          setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
        }
      } else {
        // Not authenticated, use defaults
        setColumns(DEFAULT_COLUMNS);
        setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
      }
    } catch (error) {
      console.error('Error loading user preferences for new runsheet:', error);
      // Fallback to defaults on error
      setColumns(DEFAULT_COLUMNS);
      setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
    }
    
    // Dispatch event to reset the spreadsheet to fresh state
    const resetEvent = new CustomEvent('startNewRunsheet');
    window.dispatchEvent(resetEvent);
    
    toast({
      title: "New runsheet started",
      description: "Started a fresh runsheet with your preferred columns.",
    });
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
                    setPendingNavigation({ path: '/app' });
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
      
      <div className="w-full px-4 py-6">
        <DocumentFrame 
          file={file}
          previewUrl={previewUrl}
          fields={columns}
          formData={formData}
          columnInstructions={columnInstructions}
          onChange={handleFieldChange}
          onAnalyze={analyzeDocument}
          onCancelAnalysis={cancelAnalysis}
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
          onShowMultipleUpload={() => setShowMultipleFileUpload(true)}
          onDocumentMapChange={handleDocumentMapChange}
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
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Unsaved Changes</DialogTitle>
            <DialogDescription>
              You have unsaved changes in your current runsheet. What would you like to do?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex flex-col sm:flex-row justify-end gap-3 pt-4">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowNavigationDialog(false);
                setPendingNavigation(null);
              }}
              className="w-full sm:w-auto sm:min-w-[120px]"
            >
              Cancel
            </Button>
            <Button 
              variant="destructive" 
              onClick={() => {
                setShowNavigationDialog(false);
                if (pendingNavigation) {
                  if (pendingNavigation.path === 'new-runsheet') {
                    startNewRunsheet();
                  } else if (pendingNavigation.state) {
                    navigate(pendingNavigation.path, { state: pendingNavigation.state });
                  } else {
                    navigate(pendingNavigation.path);
                  }
                  setPendingNavigation(null);
                }
              }}
              className="w-full sm:w-auto sm:min-w-[180px]"
            >
              Continue Without Saving
            </Button>
            <Button 
              variant="default" 
              onClick={async () => {
                // Save the runsheet first, then navigate
                const saveEvent = new CustomEvent('forceSaveRunsheet');
                window.dispatchEvent(saveEvent);
                
                // Small delay to allow save to complete
                setTimeout(() => {
                  setShowNavigationDialog(false);
                  if (pendingNavigation) {
                    if (pendingNavigation.path === 'new-runsheet') {
                      startNewRunsheet();
                    } else if (pendingNavigation.state) {
                      navigate(pendingNavigation.path, { state: pendingNavigation.state });
                    } else {
                      navigate(pendingNavigation.path);
                    }
                    setPendingNavigation(null);
                  }
                }, 500);
              }}
              className="w-full sm:w-auto sm:min-w-[140px]"
            >
              Save & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Missing Data Dialog */}
      <Dialog open={missingDataDialog} onOpenChange={setMissingDataDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>No Data to Add</DialogTitle>
            <DialogDescription>
              Please upload a document or enter data in the form fields before adding to the runsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-3 text-sm text-muted-foreground">
              <p>To add data to your runsheet, you need to:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Upload a document and click "Analyze Document" to extract data automatically, OR</li>
                <li>Manually enter data in the form fields above</li>
              </ul>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setMissingDataDialog(false)}>
              Understood
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirm Add File Without Data Dialog */}
      <Dialog open={confirmAddFileDialog} onOpenChange={setConfirmAddFileDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>Maximize Document Value - Extract Data First?</DialogTitle>
            <DialogDescription>
              You uploaded a document but haven't extracted the valuable data from it yet. 
              Document analysis automatically reads and extracts key information to populate your runsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-4 text-sm">
              <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                <p className="font-medium text-blue-900 dark:text-blue-100 mb-2">💡 Recommended: Extract Data First</p>
                <p className="text-blue-800 dark:text-blue-200">
                  Let AI analyze your document to automatically extract instrument numbers, dates, parties, and other key information. 
                  This saves time and ensures accuracy.
                </p>
              </div>
              <div className="space-y-2">
                <p className="font-medium">Your options:</p>
                <ul className="list-disc list-inside space-y-1 ml-4 text-muted-foreground">
                  <li><strong>Extract Data First:</strong> AI analyzes the document and fills in all relevant fields automatically</li>
                  <li><strong>Add File Only:</strong> Just the filename is added - you'll miss valuable document data</li>
                </ul>
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmAddFileDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="secondary" 
              onClick={() => {
                setConfirmAddFileDialog(false);
                // Continue with adding just the file
                continueAddToSpreadsheet();
              }}
            >
              Add File Only
            </Button>
            <Button 
              onClick={() => {
                setConfirmAddFileDialog(false);
                // Trigger analysis first
                analyzeDocument();
              }}
              className="bg-blue-600 hover:bg-blue-700"
            >
              Extract Data First ✨
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Hidden file input for dashboard upload action */}
      <input
        id="dashboard-upload-input"
        type="file"
        className="sr-only"
        accept=".xlsx,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
        onChange={handleDashboardFileSelect}
        multiple={false}
      />

      {/* Multiple File Upload Dialog */}
      <Dialog open={showMultipleFileUpload} onOpenChange={setShowMultipleFileUpload}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden p-0">
          <MultipleFileUpload
            runsheetData={{
              id: activeRunsheet?.id || location.state?.runsheetId || 'temp-id',
              name: activeRunsheet?.name || location.state?.runsheet?.name || 'Untitled Runsheet',
              data: spreadsheetData
            }}
            onAutoSave={async () => {
              try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) {
                  console.error('Auto-save failed: User not authenticated');
                  throw new Error('Not authenticated');
                }

                const runsheetName = activeRunsheet?.name || location.state?.runsheet?.name || 'Untitled Runsheet';
                
                console.log('Auto-saving runsheet:', { 
                  name: runsheetName, 
                  columns: columns.length, 
                  data: spreadsheetData.length 
                });

                // Check if runsheet already exists - update instead of insert if it has an ID
                if (activeRunsheet?.id && !activeRunsheet.id.startsWith('temp-')) {
                  console.log('Updating existing runsheet:', activeRunsheet.id);
                  const { data: updateResult, error } = await supabase
                    .from('runsheets')
                    .update({
                      name: runsheetName,
                      columns: columns,
                      data: spreadsheetData,
                      column_instructions: columnInstructions,
                      updated_at: new Date().toISOString(),
                    })
                    .eq('id', activeRunsheet.id)
                    .select('id')
                    .single();

                  if (error) {
                    console.error('Update error:', error);
                    throw error;
                  }

                  return activeRunsheet.id;
                } else {
                  // Insert new runsheet
                  console.log('Inserting new runsheet');
                  const { data: insertResult, error } = await supabase
                    .from('runsheets')
                    .insert({
                      name: runsheetName,
                      columns: columns,
                      data: spreadsheetData,
                      column_instructions: columnInstructions,
                      user_id: user.id,
                    })
                    .select('id')
                    .single();

                  if (error) {
                    console.error('Insert error:', error);
                    // Check if it's a duplicate name error
                    if (error.code === '23505' && error.message.includes('runsheets_user_id_name_key')) {
                      // Show dialog asking user what to do
                      return new Promise((resolve) => {
                        const handleOverwrite = async () => {
                          try {
                            // Find and update the existing runsheet
                            const { data: existingRunsheet, error: findError } = await supabase
                              .from('runsheets')
                              .select('id')
                              .eq('user_id', user.id)
                              .eq('name', runsheetName)
                              .single();

                            if (findError) throw findError;

                            const { data: updateResult, error: updateError } = await supabase
                              .from('runsheets')
                              .update({
                                columns: columns,
                                data: spreadsheetData,
                                column_instructions: columnInstructions,
                                updated_at: new Date().toISOString(),
                              })
                              .eq('id', existingRunsheet.id)
                              .select('id')
                              .single();

                            if (updateError) throw updateError;

                            // Update the active runsheet with the existing ID
                            if (setActiveRunsheet) {
                              setActiveRunsheet({
                                id: existingRunsheet.id,
                                name: runsheetName,
                                data: spreadsheetData,
                                columns,
                                columnInstructions,
                                hasUnsavedChanges: false,
                                lastSaveTime: new Date()
                              });
                            }

                            resolve(existingRunsheet.id);
                          } catch (overwriteError) {
                            console.error('Overwrite error:', overwriteError);
                            resolve(null);
                          }
                        };

                        // Show confirmation dialog
                        const confirmed = window.confirm(
                          `Runsheet needs to be saved before uploading.\n\nA runsheet named "${runsheetName}" already exists. Would you like to overwrite it?\n\nClick OK to overwrite, or Cancel to stop the upload.`
                        );

                        if (confirmed) {
                          handleOverwrite();
                        } else {
                          resolve(null);
                        }
                      });
                    }
                    throw error;
                  }

                  console.log('Auto-saved runsheet with ID:', insertResult.id);
                  
                  // Update the active runsheet with the new ID
                  if (setActiveRunsheet) {
                    setActiveRunsheet({
                      id: insertResult.id,
                      name: runsheetName,
                      data: spreadsheetData,
                      columns,
                      columnInstructions,
                      hasUnsavedChanges: false,
                      lastSaveTime: new Date()
                    });
                  }

                  return insertResult.id;
                }
              } catch (error) {
                console.error('Auto-save error details:', error);
                return null;
              }
            }}
            onUploadComplete={(count) => {
              toast({
                title: "Files uploaded successfully",
                description: `${count} file${count !== 1 ? 's' : ''} uploaded and linked to your runsheet.`
              });
              
              // Wait for the spreadsheet to refresh before closing the dialog
              setTimeout(() => {
                setShowMultipleFileUpload(false);
              }, 1500); // Give enough time for all refresh events to process
            }}
            onClose={() => setShowMultipleFileUpload(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentProcessor;
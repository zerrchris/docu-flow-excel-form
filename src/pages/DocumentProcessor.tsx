import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Upload, FolderOpen, Plus, AlertTriangle, Smartphone, Files, Home, FileStack, RefreshCw, Bug } from 'lucide-react';
import DocumentFrame from '@/components/DocumentFrame';
import DocumentViewer from '@/components/DocumentViewer';
import DataForm from '@/components/DataForm';
import RealtimeVoiceInput from '@/components/RealtimeVoiceInput';
import EditableSpreadsheet from '@/components/EditableSpreadsheet';
import AuthButton from '@/components/AuthButton';
import BatchProcessing from '@/components/BatchProcessing';
import DocumentUpload from '@/components/DocumentUpload';
import MultipleFileUpload from '@/components/MultipleFileUpload';
import { StorageDebugDialog } from '@/components/StorageDebugDialog';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { GoogleDrivePicker } from '@/components/GoogleDrivePicker';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { AdminSettingsService } from '@/services/adminSettings';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';
import { useAutoSave } from '@/hooks/useAutoSave';
import { DataRecoveryDialog } from '@/components/DataRecoveryDialog';
import { RunsheetFileUpload } from '@/components/RunsheetFileUpload';
import { supabase } from '@/integrations/supabase/client';
import { isRowEmpty } from '@/utils/rowValidation';

import LogoMark from '@/components/LogoMark';

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
  const { activeRunsheet, setActiveRunsheet, clearActiveRunsheet, setCurrentRunsheet } = useActiveRunsheet();
  
  // View state
  const [showDocument, setShowDocument] = useState(true);
  const [showDataForm, setShowDataForm] = useState(true);
  const [showSpreadsheet, setShowSpreadsheet] = useState(true);
  const [showBatchProcessing, setShowBatchProcessing] = useState(false);
  const [isBatchExpanded, setIsBatchExpanded] = useState(false);
  const [hideSpreadsheetForBatch, setHideSpreadsheetForBatch] = useState(false);
  const [showVoiceInput, setShowVoiceInput] = useState(false);
  const [showRunsheetUploadDialog, setShowRunsheetUploadDialog] = useState(false);

  // Document state  
  const [file, setFile] = useState<File | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [currentFileName, setCurrentFileName] = useState<string>('');
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storageUrl, setStorageUrl] = useState<string | null>(null);
  
  // Form data state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractedFieldCount, setExtractedFieldCount] = useState(0);
  const [spreadsheetData, setSpreadsheetData] = useState<Record<string, string>[]>([]);
  const [hasAddedToSpreadsheet, setHasAddedToSpreadsheet] = useState(false);
  const [showDataRecoveryDialog, setShowDataRecoveryDialog] = useState(false);
  const [showStorageDebugDialog, setShowStorageDebugDialog] = useState(false);
  
  // Column configuration
  const [columns, setColumns] = useState<string[]>(DEFAULT_COLUMNS);
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>(DEFAULT_EXTRACTION_INSTRUCTIONS);
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  // Dialog states
  const [missingDataDialog, setMissingDataDialog] = useState(false);
  const [confirmAddFileDialog, setConfirmAddFileDialog] = useState(false);
  const [showMultipleFileUpload, setShowMultipleFileUpload] = useState(false);
  
  // Navigation and URL handling
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const loadedRunsheetRef = useRef<string | null>(null);

  // Remove auto-save for simplified architecture - not needed in context-first approach

  // Handle URL parameters for actions (upload, google-drive, etc.) and runsheet ID - prioritize actions
  useEffect(() => {
    const action = searchParams.get('action');
    const runsheetId = searchParams.get('id') || searchParams.get('runsheet');
    console.log('DocumentProcessor useEffect - action from searchParams:', action);
    console.log('DocumentProcessor useEffect - runsheetId from searchParams:', runsheetId);
    
    // Prioritize actions over loading active runsheet
    if (action === 'upload') {
      console.log('Upload action detected, showing runsheet upload dialog...');
      
      // Clear any active runsheet display to show upload interface
      clearActiveRunsheet();
      setSpreadsheetData([]);
      setFormData({});
      
      // Prevent any automatic runsheet creation AND default column loading
      sessionStorage.setItem('prevent_default_runsheet_creation', 'true');
      sessionStorage.setItem('prevent_default_columns', 'true');
      
      // Clear any columns to prevent conflicts with uploaded data
      setColumns([]);
      setColumnInstructions({});
      
      // Show the proper runsheet upload dialog (same as Dashboard)
      setShowRunsheetUploadDialog(true);
      
      return; // Don't process other actions if upload is happening
    } else if (action === 'google-drive') {
      console.log('Google Drive action detected, opening Google Drive picker...');
      
      // Clear any active runsheet display
      clearActiveRunsheet();
      setSpreadsheetData([]);
      setFormData({});
      
      // Trigger the Google Drive picker in the EditableSpreadsheet component
      setTimeout(() => {
        const googleDriveEvent = new CustomEvent('openGoogleDrivePicker');
        window.dispatchEvent(googleDriveEvent);
      }, 100);
      
      return; // Don't process runsheet loading if google-drive action is happening
    }
    
    // Load specific runsheet if ID is provided and no action is specified
    if (runsheetId && !loadedRunsheetRef.current && !action) {
      console.log('Loading runsheet from URL parameter:', runsheetId);
      loadedRunsheetRef.current = runsheetId;
      
      // Check if this is coming from extension (force refresh)
      const fromExtension = searchParams.get('from') === 'extension';
      
      // Dispatch event to load the runsheet
      const loadEvent = new CustomEvent('loadSpecificRunsheet', {
        detail: { runsheetId, forceRefresh: fromExtension }
      });
      window.dispatchEvent(loadEvent);
    }
  }, [searchParams, loadedRunsheetRef]);

  // Load user preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const preferences = await ExtractionPreferencesService.getDefaultPreferences();
        if (preferences) {
          setColumns(preferences.columns);
          setColumnInstructions(preferences.column_instructions as Record<string, string>);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
      } finally {
        setIsLoadingPreferences(false);
      }
    };

    loadPreferences();
  }, []);

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

      savePreferences();
    }
  }, [columns, columnInstructions, isLoadingPreferences]);

  // Add current form data to spreadsheet - SIMPLIFIED APPROACH (like brain button)
  const addToSpreadsheet = async (dataToAdd?: Record<string, string>) => {
    console.log('🔧 DocumentProcessor: addToSpreadsheet called (simplified)');
    console.log('🔧 DocumentProcessor: dataToAdd:', dataToAdd);
    console.log('🔧 DocumentProcessor: formData:', formData);
    console.log('🔧 DocumentProcessor: activeRunsheet:', activeRunsheet);
    
    // Use formData as fallback when dataToAdd is not provided
    const targetData = dataToAdd || formData;
    
    // CRITICAL: We now require a valid runsheet context to operate (like brain button)
    if (!activeRunsheet?.id) {
      console.log('🔧 DocumentProcessor: No active runsheet context - redirecting to create one');
      
      toast({
        title: "No Active Runsheet",
        description: "Please create or select a runsheet first, then return to add documents.",
        variant: "destructive",
      });
      
      // Redirect to dashboard to create/select runsheet
      navigate('/dashboard');
      return;
    }

    const runsheetId = activeRunsheet.id;
    console.log('🔧 DocumentProcessor: Using active runsheet:', runsheetId);

    // Check if we have valid data to add
    if (!targetData || Object.keys(targetData).length === 0) {
      toast({
        title: "No data to add",
        description: "Please upload a document or enter data in the form fields before adding to the runsheet.",
        variant: "destructive",
      });
      return;
    }

    try {
      // Add the data directly to the active runsheet (like brain button does)
      console.log('🔧 DocumentProcessor: Adding data to existing runsheet');
      
      // Dispatch event to add row to the active runsheet
      const addRowEvent = new CustomEvent('externalAddRow', {
        detail: { data: targetData }
      });
      window.dispatchEvent(addRowEvent);

      // Handle document linking if we have a current file
      if (currentFile) {
        // Store document for the new row
        await handleDocumentCreation(currentFile, targetData, runsheetId);
      }

      toast({
        title: "Document added to runsheet",
        description: `Added data to "${activeRunsheet.name}".`,
      });

      // Clear the form and current file
      setFormData({});
      setCurrentFile(null);
      setCurrentFileName('');
      
      // Navigate back to the runsheet
      navigate(`/runsheet?id=${runsheetId}`, { replace: true });
      
    } catch (error) {
      console.error('Error adding to runsheet:', error);
      toast({
        title: "Failed to add to runsheet",
        description: error instanceof Error ? error.message : "An unexpected error occurred.",
        variant: "destructive",
      });
    }
  };

  // Helper function to create document record - SIMPLIFIED for new architecture
  const handleDocumentCreation = async (file: File, data: Record<string, string>, runsheetId: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('🔧 Creating document record for file:', file.name);
      
      // Upload file if needed
      let storagePath = data['Storage Path'];
      if (!storagePath) {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileExtension = file.name.split('.').pop() || 'pdf';
        const uniqueFilename = `${user.id}/${timestamp}_${randomSuffix}.${fileExtension}`;
        
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(uniqueFilename, file, {
            cacheControl: '3600',
            upsert: false
          });
          
        if (uploadError) {
          console.error('Error uploading file:', uploadError);
          return;
        }
        
        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(uniqueFilename);
        storagePath = urlData.publicUrl;
      }

      // Create document record
      const { error: docError } = await supabase
        .from('documents')
        .insert({
          user_id: user.id,
          runsheet_id: runsheetId,
          row_index: -1, // Will be set when row is actually created
          original_filename: file.name,
          stored_filename: storagePath.split('/').pop() || file.name,
          file_path: storagePath,
          file_size: file.size,
          content_type: file.type || 'application/octet-stream'
        });

      if (docError) {
        console.error('Error creating document record:', docError);
      } else {
        console.log('✅ Document record created successfully');
      }
    } catch (error) {
      console.error('Error in handleDocumentCreation:', error);
    }
  };

  // Analyze document using the backend service
  const analyzeDocument = async () => {
    if (!file) {
      toast({
        title: "No document selected",
        description: "Please upload a document first.",
        variant: "destructive"
      });
      return;
    }

    setIsAnalyzing(true);
    setExtractedFieldCount(0);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Authentication required",
          description: "Please sign in to analyze documents.",
          variant: "destructive",
        });
        return;
      }

      // Upload file if not already uploaded
      let uploadPath = storageUrl;
      if (!uploadPath) {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8);
        const fileExtension = file.name.split('.').pop() || 'pdf';
        const uniqueFilename = `${user.id}/${timestamp}_${randomSuffix}.${fileExtension}`;

        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(uniqueFilename, file, {
            cacheControl: '3600',
            upsert: false
          });

        if (uploadError) {
          console.error('File upload error:', uploadError);
          toast({
            title: "Upload failed",
            description: "Failed to upload document. Please try again.",
            variant: "destructive"
          });
          return;
        }

        const { data: urlData } = supabase.storage
          .from('documents')
          .getPublicUrl(uniqueFilename);
        uploadPath = urlData.publicUrl;
        setStorageUrl(uploadPath);
      }

      // Call the enhanced document analysis function
      const { data, error } = await supabase.functions.invoke('enhanced-document-analysis', {
        body: {
          document_url: uploadPath,
          filename: file.name,
          content_type: file.type,
          instructions: columnInstructions
        }
      });

      if (error) {
        console.error('Analysis error:', error);
        toast({
          title: "Analysis failed",
          description: error.message || "Failed to analyze document. Please try again.",
          variant: "destructive"
        });
        return;
      }

      if (data?.success) {
        const extractedData = data.data || {};
        
        // Add the storage path to the extracted data
        extractedData['Storage Path'] = uploadPath;
        extractedData['Document File Name'] = file.name;
        
        setFormData(extractedData);
        setCurrentFile(file);
        setCurrentFileName(file.name);
        
        const fieldCount = Object.keys(extractedData).filter(key => 
          extractedData[key] && extractedData[key].trim() !== '' && key !== 'Storage Path'
        ).length;
        
        setExtractedFieldCount(fieldCount);
        
        toast({
          title: "Document analyzed successfully",
          description: `Successfully extracted ${fieldCount} fields. Please review and verify the data before adding to runsheet.`,
        });
      } else {
        throw new Error(data?.error || 'Analysis failed');
      }
      
    } catch (error: any) {
      console.error('Document analysis error:', error);
      toast({
        title: "Analysis failed",
        description: error.message || "Failed to analyze document. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsAnalyzing(false);
    }
  };

  // NEW: Simplified new runsheet creation using the same pattern as Dashboard
  const startNewRunsheetSimple = async () => {
    console.log('🧹 DocumentProcessor: Starting new runsheet (simplified approach)');
    
    // Clear active runsheet state first
    clearActiveRunsheet();
    
    // Navigate to clean URL without runsheet ID
    navigate('/document-processor', { replace: true });
    
    // Reset all state to defaults
    setSpreadsheetData([]);
    setFormData({});
    setFile(null);
    setCurrentFile(null);
    setCurrentFileName('');
    setPreviewUrl(null);
    setStorageUrl(null);
    setHasAddedToSpreadsheet(false);
    
    // Reset columns and instructions to defaults
    setColumns(DEFAULT_COLUMNS);
    setColumnInstructions(DEFAULT_EXTRACTION_INSTRUCTIONS);
    
    // Clear any stored state
    sessionStorage.removeItem('activeRunsheet');
    sessionStorage.removeItem('pendingDocuments');
    
    // Clear loaded runsheet reference
    loadedRunsheetRef.current = null;
    
    toast({
      title: "New runsheet started",
      description: "You're now working on a fresh runsheet.",
    });
    
    console.log('🧹 DocumentProcessor: New runsheet creation completed successfully');
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card shadow-sm">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between h-16">
            {/* Left side - Logo and Title */}
            <div className="flex items-center gap-4">
              <Link to="/dashboard" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <LogoMark />
                <span className="font-semibold text-lg hidden sm:inline">DocuFlow</span>
              </Link>
              <div className="hidden md:block h-6 w-px bg-border" />
              <h1 className="text-lg font-medium hidden md:block">Document Processor</h1>
            </div>

            {/* Right side - Actions */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowStorageDebugDialog(true)}
                className="hidden lg:flex gap-2"
              >
                <Bug className="h-4 w-4" />
                Debug
              </Button>
              
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowDataRecoveryDialog(true)}
                className="hidden sm:flex gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Recover Data
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={startNewRunsheetSimple}
                className="gap-2"
              >
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New</span>
              </Button>

              <Link to="/dashboard">
                <Button variant="outline" size="sm" className="gap-2">
                  <Home className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Button>
              </Link>

              <AuthButton />
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-4">
        {/* Runsheet Context Requirement Notice */}
        {!activeRunsheet?.id && (
          <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <div className="flex items-center gap-2 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
              <div>
                <h3 className="font-medium">No Active Runsheet</h3>
                <p className="text-sm">
                  To add documents, please{' '}
                  <Link to="/dashboard" className="underline hover:no-underline">
                    create or select a runsheet first
                  </Link>
                  , then return here.
                </p>
              </div>
            </div>
          </div>
        )}

        <ResizablePanelGroup direction="horizontal" className="min-h-[600px]">
          {/* Document Panel */}
          {showDocument && (
            <>
              <ResizablePanel defaultSize={30} minSize={25}>
                <div className="h-full border rounded-lg bg-card">
                  <DocumentFrame
                    file={file}
                    previewUrl={previewUrl}
                    fields={columns}
                    formData={formData}
                    columnInstructions={columnInstructions}
                    onChange={(field: string, value: string) => {
                      setFormData(prev => ({ ...prev, [field]: value }));
                    }}
                    onAnalyze={analyzeDocument}
                    onAddToSpreadsheet={addToSpreadsheet}
                    onFileSelect={setFile}
                    onResetDocument={() => {
                      setFile(null);
                      setPreviewUrl(null);
                      setStorageUrl(null);
                      setFormData({});
                    }}
                    isAnalyzing={isAnalyzing}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Data Form Panel */}
          {showDataForm && (
            <>
              <ResizablePanel defaultSize={35} minSize={30}>
                <div className="h-full border rounded-lg bg-card">
                  <DataForm
                    fields={columns}
                    formData={formData}
                    onChange={(field: string, value: string) => {
                      setFormData(prev => ({ ...prev, [field]: value }));
                    }}
                    onAnalyze={analyzeDocument}
                    onAddToSpreadsheet={() => addToSpreadsheet()}
                    isAnalyzing={isAnalyzing}
                    hasAddedToSpreadsheet={hasAddedToSpreadsheet}
                    fileUrl={storageUrl || undefined}
                    fileName={file?.name}
                    columnInstructions={columnInstructions}
                  />
                </div>
              </ResizablePanel>
              <ResizableHandle />
            </>
          )}

          {/* Spreadsheet Panel */}
          {showSpreadsheet && !hideSpreadsheetForBatch && (
              <ResizablePanel defaultSize={35} minSize={30}>
                <div className="h-full border rounded-lg bg-card">
                  <EditableSpreadsheet
                    initialColumns={columns}
                    initialData={spreadsheetData}
                    onColumnChange={setColumns}
                    onDataChange={setSpreadsheetData}
                    onColumnInstructionsChange={setColumnInstructions}
                  />
                </div>
              </ResizablePanel>
          )}
        </ResizablePanelGroup>

        {/* Batch Processing */}
        {showBatchProcessing && (
          <div className="mt-4">
            <BatchProcessing
              fields={columns}
              onAddToSpreadsheet={addToSpreadsheet}
              onAnalyze={async (file: File) => {
                // For batch processing, we need to return the analyzed data
                // This is a simplified implementation that just returns the form data
                return formData;
              }}
              isAnalyzing={isAnalyzing}
              isExpanded={isBatchExpanded}
              onExpandedChange={(expanded) => {
                setIsBatchExpanded(expanded);
                setHideSpreadsheetForBatch(expanded);
              }}
            />
          </div>
        )}
      </div>

      {/* Data Recovery Dialog - Updated to match interface */}
      <DataRecoveryDialog 
        isOpen={showDataRecoveryDialog}
        onClose={() => setShowDataRecoveryDialog(false)}
        onUseBackup={() => {
          // Handle backup data usage
          setShowDataRecoveryDialog(false);
        }}
        onKeepCurrent={() => {
          // Keep current data
          setShowDataRecoveryDialog(false);
        }}
        backupData={{
          lastSaved: "Unknown",
          dataRows: 0
        }}
        currentData={{
          dataRows: spreadsheetData.length
        }}
      />

      <StorageDebugDialog 
        open={showStorageDebugDialog}
        onOpenChange={setShowStorageDebugDialog}
      />

      {/* Missing Data Dialog */}
      <Dialog open={missingDataDialog} onOpenChange={setMissingDataDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>No Data to Add</DialogTitle>
            <DialogDescription>
              Please upload a document or enter data in the form fields before adding to the runsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <p>To add data to your runsheet, you need to:</p>
            <ul className="list-disc list-inside mt-2 space-y-1">
              <li>Upload a document and analyze it</li>
              <li>Or manually enter data in the form fields</li>
            </ul>
          </div>
          <DialogFooter>
            <Button onClick={() => setMissingDataDialog(false)}>
              Got it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm Add File Dialog */}
      <Dialog open={confirmAddFileDialog} onOpenChange={setConfirmAddFileDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add File Without Data?</DialogTitle>
            <DialogDescription>
              You have uploaded a file but haven't extracted any data from it yet. Would you like to:
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmAddFileDialog(false)}>
              Cancel
            </Button>
            <Button onClick={() => {
              setConfirmAddFileDialog(false);
              analyzeDocument();
            }}>
              Analyze First
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Runsheet Upload Dialog */}
      <Dialog open={showRunsheetUploadDialog} onOpenChange={setShowRunsheetUploadDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Upload Runsheet</DialogTitle>
            <DialogDescription>
              Upload an Excel or CSV file to import as your runsheet.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RunsheetFileUpload 
              onFileSelected={async (runsheetData) => {
                console.log('📥 Runsheet file processed from DocumentProcessor:', runsheetData);
                console.log('📥 Columns received:', runsheetData.columns);
                console.log('📥 Data sample:', runsheetData.rows?.slice(0, 2));
                console.log('📥 First row keys:', runsheetData.rows?.[0] ? Object.keys(runsheetData.rows[0]) : 'No data');
                console.log('📥 Total rows count:', runsheetData.rows?.length);
                console.log('📥 All data keys in first row:', runsheetData.rows?.[0]);
                setShowRunsheetUploadDialog(false);
                
                // Use the same logic as Dashboard upload
                // Navigate to EditableSpreadsheet page with the uploaded data
                navigate('/runsheet', {
                  state: {
                    runsheet: {
                      name: runsheetData.name,
                      columns: runsheetData.columns,
                      data: runsheetData.rows,
                      columnInstructions: {}
                    }
                  }
                });
              }}
              onCancel={() => {
                // When upload is canceled, go back to dashboard instead of leaving broken state
                console.log('Upload canceled, redirecting to dashboard');
                navigate('/app');
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentProcessor;
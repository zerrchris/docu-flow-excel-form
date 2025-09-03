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
  const [isDocumentMode, setIsDocumentMode] = useState(false);
  const [isDocumentFrameExpanded, setIsDocumentFrameExpanded] = useState(false);
  const [isBatchProcessingExpanded, setIsBatchProcessingExpanded] = useState(false);
  
  // Document state
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [storageUrl, setStorageUrl] = useState<string | null>(null);
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
  const [hasAddedToSpreadsheet, setHasAddedToSpreadsheet] = useState(false);
  const [showDataRecovery, setShowDataRecovery] = useState(false);
  const [recoveryData, setRecoveryData] = useState<any>(null);
  const [showStorageDebug, setShowStorageDebug] = useState(false);
  const [showRunsheetUploadDialog, setShowRunsheetUploadDialog] = useState(false);
  
  // Note: Navigation blocking removed since runsheet auto-saves
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  
  // Ref to track if we've already loaded a runsheet to prevent infinite loops
  const loadedRunsheetRef = useRef<string | null>(null);
  
  // Preferences loading state
  const [isLoadingPreferences, setIsLoadingPreferences] = useState(true);
  
  // Add state to track user activity to prevent unwanted refreshes
  const [hasUserActivity, setHasUserActivity] = useState(false);
  const [lastActivityTime, setLastActivityTime] = useState<number>(Date.now());

  // Get current user for autosave
  const [currentUser, setCurrentUser] = useState<any>(null);
  
  // Initialize autosave with localStorage backup
  const { save, forceSave, isSaving, saveToLocalStorage, loadFromLocalStorage } = useAutoSave({
    runsheetId: activeRunsheet?.id,
    runsheetName: activeRunsheet?.name || '',
    columns,
    data: spreadsheetData,
    columnInstructions,
    userId: currentUser?.id,
    onSaveSuccess: (result) => {
      console.log('Autosave successful:', result);
      setHasUnsavedChanges(false);
    },
    onSaveError: (error) => {
      console.error('Autosave failed:', error);
      toast({
        title: "Auto-save failed",
        description: "Your changes are backed up locally and will be saved when connection is restored.",
        variant: "destructive",
      });
    }
  });
  
  // Load current user for autosave
  useEffect(() => {
    const loadUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setCurrentUser(user);
    };
    loadUser();
  }, []);

  // Check for backup data when runsheet changes
  useEffect(() => {
    if (activeRunsheet?.id && currentUser) {
      // Check if backup restoration is temporarily prevented (during new runsheet creation)
      const preventBackupKey = 'prevent_backup_restoration';
      const preventBackupUntil = sessionStorage.getItem(preventBackupKey);
      
      if (preventBackupUntil) {
        const preventUntilTime = parseInt(preventBackupUntil);
        if (Date.now() - preventUntilTime < 5000) {
          console.log('🚫 Backup restoration prevented - new runsheet in progress');
          return;
        } else {
          // Cleanup expired flag
          sessionStorage.removeItem(preventBackupKey);
        }
      }
      
      const backupData = loadFromLocalStorage(activeRunsheet.id);
      if (backupData && backupData.lastSaved) {
        // Compare backup with current data
        const backupRowCount = backupData.data?.length || 0;
        const currentRowCount = spreadsheetData.length;
        
        // Show recovery dialog if backup has more data or is significantly newer
        if (backupRowCount > currentRowCount) {
          setRecoveryData({
            backup: backupData,
            current: { dataRows: currentRowCount }
          });
          setShowDataRecovery(true);
        }
      }
    }
  }, [activeRunsheet?.id, currentUser, loadFromLocalStorage, spreadsheetData.length]);

  // Data recovery handlers
  const handleUseBackupData = () => {
    if (recoveryData?.backup) {
      const backup = recoveryData.backup;
      setSpreadsheetData(backup.data || []);
      setColumns(backup.columns || DEFAULT_COLUMNS);
      setColumnInstructions(backup.columnInstructions || {});
      toast({
        title: "Backup data restored",
        description: "Your previously saved work has been restored.",
      });
    }
    setShowDataRecovery(false);
    setRecoveryData(null);
  };

  const handleKeepCurrentData = () => {
    setShowDataRecovery(false);
    setRecoveryData(null);
  };

  // Track user activity to prevent data loss
  useEffect(() => {
    const trackActivity = () => {
      setHasUserActivity(true);
      setLastActivityTime(Date.now());
    };
    
    // Listen for user interactions that indicate active work
    const events = ['keydown', 'mousedown', 'input', 'change'];
    events.forEach(event => {
      document.addEventListener(event, trackActivity);
    });
    
    console.log('🔄 DocumentProcessor: User activity tracking enabled');
    
    return () => {
      events.forEach(event => {
        document.removeEventListener(event, trackActivity);
      });
    };
  }, []);

  // Cleanup file state when component unmounts or user navigates away
  useEffect(() => {
    return () => {
      // Clean up any preview URLs to avoid memory leaks
      if (previewUrl) {
        console.log('🧹 Cleaning up preview URL on unmount');
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);
  
  // Warn about potential data loss
  useEffect(() => {
    const beforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUserActivity && (spreadsheetData.length > 0 || Object.keys(formData).length > 0)) {
        console.log('⚠️ DocumentProcessor: Warning user about potential data loss');
        e.preventDefault();
        
        // Create a more descriptive message about what will be lost
        let message = 'You have unsaved work that will be lost if you leave:';
        
        if (spreadsheetData.length > 0) {
          message += `\n• ${spreadsheetData.length} row(s) of data in your spreadsheet`;
        }
        
        if (Object.values(formData).some(value => value.trim() !== '')) {
          message += '\n• Current form data being analyzed';
        }
        
        message += '\n\nAre you sure you want to leave without saving?';
        
        e.returnValue = message;
        return message;
      }
    };
    
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [hasUserActivity, spreadsheetData, formData]);

  // Note: Removed activeRunsheet syncing since we're removing tab functionality
  
  // Load user preferences and handle selected runsheet on component mount
  useEffect(() => {
    const loadUserPreferences = async () => {
      // Don't load user preferences if we have a runsheet - runsheet columns take priority
      const selectedRunsheet = location.state?.runsheet;
      const isUploadAction = searchParams.get('action') === 'upload';
      
      if (selectedRunsheet && selectedRunsheet.columns) {
        console.log('Skipping user preferences load - using runsheet columns instead');
        setIsLoadingPreferences(false);
        return;
      }
      
      if (isUploadAction) {
        console.log('Skipping user preferences load - upload action detected');
        setIsLoadingPreferences(false);
        return;
      }
      
      setIsLoadingPreferences(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (user) {
          const preferences = await ExtractionPreferencesService.getDefaultPreferences();
          
          if (preferences && preferences.columns && preferences.column_instructions) {
            // Clean up preferences immediately to remove any invalid columns
            const validColumns = preferences.columns.filter(col => 
              !col.includes('test insert') && col.trim() !== ''
            );
            
            if (validColumns.length !== preferences.columns.length) {
              console.log('🧹 Cleaning up invalid columns from preferences');
              await ExtractionPreferencesService.cleanupPreferences(validColumns);
              
              // Reload cleaned preferences
              const cleanedPrefs = await ExtractionPreferencesService.getDefaultPreferences();
              if (cleanedPrefs) {
                setColumns(cleanedPrefs.columns);
                setColumnInstructions(cleanedPrefs.column_instructions as Record<string, string>);
              }
            } else {
              // Load saved preferences only if no runsheet is active
              setColumns(preferences.columns);
              setColumnInstructions(preferences.column_instructions as Record<string, string>);
            }
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

    // Check if default columns should be prevented (during uploads)
    const preventDefaults = sessionStorage.getItem('prevent_default_columns');
    if (preventDefaults === 'true') {
      console.log('🚫 Preventing default column loading for upload');
      sessionStorage.removeItem('prevent_default_columns');
      setIsLoadingPreferences(false);
      return;
    }

    loadUserPreferences();
  }, []);

  // Ensure form fields match the active runsheet columns
  useEffect(() => {
    if (activeRunsheet?.columns && activeRunsheet.columns.length) {
      // Clean up preferences to match active runsheet columns
      ExtractionPreferencesService.cleanupPreferences(activeRunsheet.columns);
      
      setColumns(activeRunsheet.columns);
      
      // If runsheet has column instructions, use them. Otherwise, load from user preferences.
      const loadColumnInstructions = async () => {
        if (activeRunsheet.columnInstructions && Object.keys(activeRunsheet.columnInstructions).length > 0) {
          setColumnInstructions(activeRunsheet.columnInstructions);
        } else {
          try {
            // Load default extraction preferences if runsheet doesn't have instructions
            const defaultPrefs = await ExtractionPreferencesService.getDefaultPreferences();
            if (defaultPrefs?.column_instructions) {
              setColumnInstructions(defaultPrefs.column_instructions as Record<string, string>);
            } else {
              setColumnInstructions({});
            }
          } catch (error) {
            console.warn('Failed to load default extraction preferences:', error);
            setColumnInstructions({});
          }
        }
      };
      
      loadColumnInstructions();
      
      setFormData(prev => {
        const next: Record<string, string> = {};
        activeRunsheet.columns!.forEach(col => { next[col] = prev[col] || ''; });
        return next;
      });
    }
  }, [activeRunsheet?.id, activeRunsheet?.columns]);


  // Handle selected runsheet from navigation state - with stability improvements
  useEffect(() => {
    const selectedRunsheet = location.state?.runsheet;
    const shouldClearActive = location.state?.clearActiveRunsheet;
    const preventAutoSave = location.state?.preventAutoSave;
    
    console.log('🔄 DocumentProcessor: Navigation state effect triggered', {
      selectedRunsheet: selectedRunsheet?.id,
      selectedRunsheetName: selectedRunsheet?.name,
      shouldClearActive,
      preventAutoSave,
      loadedRef: loadedRunsheetRef.current,
      hasSpreadsheetData: spreadsheetData.length > 0,
      activeRunsheetName: activeRunsheet?.name,
      locationState: location.state
    });
    
    // If this is an uploaded runsheet, clear the active runsheet first
    if (shouldClearActive) {
      console.log('🧹 Clearing active runsheet for uploaded data');
      clearActiveRunsheet();
    }
    
    // Use ref to prevent infinite loops - only load each runsheet once
    if (selectedRunsheet && loadedRunsheetRef.current !== selectedRunsheet.id) {
      console.log('📋 Loading selected runsheet:', selectedRunsheet);
      loadedRunsheetRef.current = selectedRunsheet.id;
      
      // Set active runsheet immediately only if it has a real ID (not uploaded)
      if (!selectedRunsheet.id?.startsWith('uploaded-')) {
        setActiveRunsheet({
          id: selectedRunsheet.id,
          name: selectedRunsheet.name,
          data: selectedRunsheet.data || [],
          columns: selectedRunsheet.columns || [],
          columnInstructions: selectedRunsheet.column_instructions || {}
        });
      }
      
      // Only load runsheet data if we don't already have spreadsheet data (to prevent data loss)
      if (selectedRunsheet.data && Array.isArray(selectedRunsheet.data)) {
        console.log('📊 Loading uploaded runsheet data directly');
        console.log('📊 Data being set:', selectedRunsheet.data);
        console.log('📊 Data length:', selectedRunsheet.data.length);
        console.log('📊 First few rows:', selectedRunsheet.data.slice(0, 3));
        console.log('📊 Selected runsheet columns:', selectedRunsheet.columns);
        
        // Key insight: Check if there's a mismatch between data keys and columns
        if (selectedRunsheet.data.length > 0) {
          const firstRowKeys = Object.keys(selectedRunsheet.data[0]);
          console.log('📊 Data row keys:', firstRowKeys);
          console.log('📊 Column names:', selectedRunsheet.columns);
          
          const columnsMatch = selectedRunsheet.columns?.every(col => firstRowKeys.includes(col));
          console.log('📊 Columns match data keys:', columnsMatch);
          
          if (!columnsMatch) {
            console.log('⚠️ COLUMN MISMATCH DETECTED! Data will not display correctly.');
            console.log('⚠️ Expected columns:', selectedRunsheet.columns);
            console.log('⚠️ Actual data keys:', firstRowKeys);
            
            // Fix the mismatch: use the actual data keys as columns
            console.log('🔧 Fixing column mismatch by using data keys as columns');
            setColumns(firstRowKeys.filter(key => key.trim() !== ''));
            
            // Also set the data directly since the columns are correct now
            setSpreadsheetData(selectedRunsheet.data);
            
            // Don't load runsheet columns later - we've already fixed them
            return;
          }
        }
        
        // Convert the data to match the column structure if needed
        const convertedData = selectedRunsheet.data.map((row: any) => {
          // Create a new row object with the correct column keys
          const newRow: Record<string, string> = {};
          
          // If columns are different from current ones, map the data correctly
          if (selectedRunsheet.columns) {
            selectedRunsheet.columns.forEach((column: string) => {
              newRow[column] = row[column] || '';
            });
          } else {
            // Fallback to copying all properties
            Object.keys(row).forEach(key => {
              newRow[key] = row[key] || '';
            });
          }
          
          return newRow;
        });
        
        console.log('📊 Converted data sample:', convertedData.slice(0, 2));
        setSpreadsheetData(convertedData);
        
        // For uploaded runsheets, disable auto-save to prevent conflicts
        if (preventAutoSave) {
          console.log('🚫 Auto-save disabled for uploaded runsheet');
          setHasUnsavedChanges(false); // Prevent save attempts
        }
      } else if (spreadsheetData.length > 0) {
        console.log('⚠️ Skipping runsheet data load - preserving existing spreadsheet data to prevent loss');
      } else {
        console.log('⚠️ No data found in selectedRunsheet:', selectedRunsheet);
      }
      
      // Load runsheet columns if available - but be more careful about overriding user work
      if (selectedRunsheet.columns && Array.isArray(selectedRunsheet.columns)) {
        console.log('📝 Loading runsheet columns (checking if safe to override):', selectedRunsheet.columns);
        
        // For uploaded runsheets, always load the columns
        if (preventAutoSave || spreadsheetData.length === 0) {
          console.log('✅ Loading uploaded runsheet columns');
          setColumns(selectedRunsheet.columns);
        } else {
          // Only override columns if the user hasn't made significant changes
          const hasUserChanges = spreadsheetData.length > 0 || Object.keys(formData).length > 0;
          if (!hasUserChanges) {
            console.log('✅ Safe to load runsheet columns - no user changes detected');
            setColumns(selectedRunsheet.columns);
            
            // Update user preferences to match the runsheet columns
          const updatePreferences = async () => {
            try {
              const { data: { user } } = await supabase.auth.getUser();
              if (user && selectedRunsheet.column_instructions) {
                const filteredInstructions: Record<string, string> = {};
                selectedRunsheet.columns.forEach(column => {
                  if (selectedRunsheet.column_instructions[column]) {
                    filteredInstructions[column] = selectedRunsheet.column_instructions[column];
                  }
                });
                
                // Clean up any invalid columns from preferences first
                await ExtractionPreferencesService.cleanupPreferences(selectedRunsheet.columns);
                
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
        } else {
          console.log('⚠️ Skipping column override - preserving user changes');
        }
      }
      }
      
      // Load column instructions if available and safe
      if (selectedRunsheet.column_instructions && Object.keys(formData).length === 0) {
        console.log('📝 Loading column instructions');
        setColumnInstructions(selectedRunsheet.column_instructions);
      }
      
      toast({
        title: "Runsheet loaded",
        description: `Loaded "${selectedRunsheet.name}" with ${selectedRunsheet.data?.length || 0} rows.`,
      });
    }
  }, [location.state?.runsheet?.id]); // More specific dependency to reduce unnecessary re-runs

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

  // File handling now done through RunsheetFileUpload component
  
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
  
  // Update form state when columns change, but PRESERVE existing values
  useEffect(() => {
    if (columns.length === 0) return;

    setFormData(prev => {
      const next: Record<string, string> = {};
      // Keep any existing values for current columns; initialize new ones as empty
      columns.forEach(column => {
        next[column] = prev?.[column] ?? '';
      });
      return next;
    });

    console.log('Form data synchronized to current columns (values preserved). Columns:', columns);
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

  // Listen for processing pending documents after runsheet save
  useEffect(() => {
    const handleProcessPendingDocuments = async () => {
      console.log('🔧 PENDING_DOCS: Processing pending documents event received');
      
      try {
        const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
        if (pendingDocs.length === 0) {
          console.log('🔧 PENDING_DOCS: No pending documents to process');
          return;
        }
        
        console.log('🔧 PENDING_DOCS: Found pending documents to process:', pendingDocs);
        
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          console.log('🔧 PENDING_DOCS: No user found, cannot process pending documents');
          return;
        }
        
        // Get the current active runsheet ID
        const currentRunsheetId = activeRunsheet?.id;
        if (!currentRunsheetId || currentRunsheetId.startsWith('temp-')) {
          console.log('🔧 PENDING_DOCS: No valid runsheet ID available, keeping documents pending');
          return;
        }
        
        console.log('🔧 PENDING_DOCS: Processing documents for runsheet:', currentRunsheetId);
        
        // Process each pending document
        for (const doc of pendingDocs) {
          try {
            console.log('🔧 PENDING_DOCS: Creating document record for:', doc);
            
            const { error } = await supabase
              .from('documents')
              .insert({
                user_id: user.id,
                runsheet_id: currentRunsheetId,
                row_index: doc.rowIndex,
                file_path: doc.storagePath,
                stored_filename: doc.fileName,
                original_filename: doc.fileName,
                content_type: 'application/pdf'
              });
            
            if (error) {
              console.error('🔧 PENDING_DOCS: Error creating document record for row', doc.rowIndex, ':', error);
            } else {
              console.log('🔧 PENDING_DOCS: Successfully created document record for row', doc.rowIndex);
              
              // Dispatch event to refresh document display
              window.dispatchEvent(new CustomEvent('documentRecordCreated', {
                detail: { 
                  runsheetId: currentRunsheetId, 
                  rowIndex: doc.rowIndex
                }
              }));
            }
          } catch (error) {
            console.error('🔧 PENDING_DOCS: Error processing pending document:', error);
          }
        }
        
        // Clear processed documents from session storage
        sessionStorage.removeItem('pendingDocuments');
        console.log('🔧 PENDING_DOCS: Cleared processed pending documents from session storage');
        
      } catch (error) {
        console.error('🔧 PENDING_DOCS: Error processing pending documents:', error);
      }
    };

    window.addEventListener('processPendingDocuments', handleProcessPendingDocuments);
    
    return () => {
      window.removeEventListener('processPendingDocuments', handleProcessPendingDocuments);
    };
  }, [activeRunsheet?.id]);

  // Handle save-before-upload event
  useEffect(() => {
    const handleSaveBeforeUpload = async (event: CustomEvent) => {
      console.log('💾 Save before upload triggered');
      
      // Only save if there are unsaved changes and an active runsheet
      if (hasUnsavedChanges && activeRunsheet?.id && !activeRunsheet.id.startsWith('temp-')) {
        console.log('💾 Saving current runsheet before upload...');
        try {
          // Trigger the save
          const saveEvent = new CustomEvent('forceSaveRunsheet');
          window.dispatchEvent(saveEvent);
          
          // Mark as saved to prevent conflicts
          setHasUnsavedChanges(false);
          
          toast({
            title: "Current work saved",
            description: "Your previous runsheet has been saved before loading the new one.",
          });
        } catch (error) {
          console.error('💾 Error saving before upload:', error);
        }
      } else {
        console.log('💾 No unsaved changes or valid runsheet to save');
      }
    };

    window.addEventListener('saveBeforeUpload', handleSaveBeforeUpload as EventListener);
    
    return () => {
      window.removeEventListener('saveBeforeUpload', handleSaveBeforeUpload as EventListener);
    };
  }, [hasUnsavedChanges, activeRunsheet?.id]);

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
    setStorageUrl(null);
    
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

  // Function to go back to runsheet mode and clear document
  const goBackToRunsheet = () => {
    setIsDocumentMode(false);
    // Collapse both document processor sections
    setIsDocumentFrameExpanded(false);
    setIsBatchProcessingExpanded(false);
    // Clear the document from single document processing
    resetDocument();
  };

  // Function to upload new document (resets everything)
  const uploadNewDocument = () => {
    setHasAddedToSpreadsheet(false); // Reset the added state
    resetDocument();
    setIsDocumentMode(false);
  };

  // Handle single file selection
  const handleFileSelect = async (selectedFile: File) => {
    console.log('🔧 DocumentProcessor: handleFileSelect called with file:', selectedFile.name, 'Size:', selectedFile.size, 'Type:', selectedFile.type);
    
    // Revoke any previous object URL to avoid memory leaks
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    
    setFile(selectedFile);
    
    // Create preview URL for the file
    const url = URL.createObjectURL(selectedFile);
    setPreviewUrl(url);
    
    // For re-extract functionality, we'll use the preview URL directly
    // since OpenAI can access blob URLs when they're properly formatted
    setStorageUrl(url);
    
    // Enter document processing mode
    setIsDocumentMode(true);
    
    console.log('🔧 DocumentProcessor: File set and preview URL created:', url);
    
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
      title: "✅ Document Ready for Processing",
      description: `${selectedFile.name} is ready. Click 'Analyze Document' to extract data automatically.`,
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
      
      // For re-extract functionality, use the preview URL
      setStorageUrl(newPreviewUrl);
      
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
    console.log('targetFile details:', {
      name: targetFile?.name,
      type: targetFile?.type,
      size: targetFile?.size,
      lastModified: targetFile?.lastModified
    });
    
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
      // Check if the file is a PDF and handle appropriately
      if (targetFile.type === 'application/pdf') {
        toast({
          title: "❌ Unsupported File Format",
          description: "PDF analysis is not supported. Please convert your PDF to an image format (PNG, JPEG) first, or take a screenshot of the document.",
          variant: "destructive"
        });
        setIsAnalyzing(false);
        setAnalysisAbortController(null);
        return;
      }

      // Verify the file is a supported image format - with fallback for corrupted file types
      const supportedImageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      
      // Check if file type is corrupted (e.g., showing "click" instead of proper MIME type)
      const hasCorruptedType = targetFile.type && !targetFile.type.startsWith('image/') && !targetFile.type.startsWith('application/');
      
      if (hasCorruptedType) {
        console.warn('Detected corrupted file type:', targetFile.type, 'for file:', targetFile.name);
        // Try to determine type from filename extension
        const fileExtension = targetFile?.name?.toLowerCase().split('.').pop();
        const isLikelyImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(fileExtension || '');
        
        if (!isLikelyImage) {
          toast({
            title: "Unsupported File Format",
            description: `File appears to have a corrupted type "${targetFile.type}". Please re-upload the file as PNG, JPEG, GIF, or WebP.`,
            variant: "destructive"
          });
          setIsAnalyzing(false);
          setAnalysisAbortController(null);
          return;
        }
        // Continue processing if extension suggests it's an image
      } else if (!supportedImageTypes.includes(targetFile.type)) {
        // Handle octet-stream files that might actually be images
        if (targetFile.type === 'application/octet-stream') {
          // Check if filename suggests it's an image
          const isImageFile = /\.(jpg|jpeg|png|gif|webp)$/i.test(targetFile.name);
          if (!isImageFile) {
            toast({
              title: "Unsupported File Format",
              description: `File format ${targetFile.type} is not supported. Please use PNG, JPEG, GIF, or WebP images.`,
              variant: "destructive"
            });
            setIsAnalyzing(false);
            setAnalysisAbortController(null);
            return;
          }
          // Continue processing for octet-stream files with image extensions
        } else {
          toast({
            title: "Unsupported File Format",
            description: `File format ${targetFile.type} is not supported. Please use PNG, JPEG, GIF, or WebP images.`,
            variant: "destructive"
          });
          setIsAnalyzing(false);
          setAnalysisAbortController(null);
          return;
        }
      }

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

      // Determine correct MIME type for the image data
      let mimeType = targetFile.type;
      if (targetFile.type === 'application/octet-stream' && targetFile?.name) {
        // Infer MIME type from file extension for octet-stream files
        const fileName = targetFile.name.toLowerCase();
        if (fileName.endsWith('.jpg') || fileName.endsWith('.jpeg')) {
          mimeType = 'image/jpeg';
        } else if (fileName.endsWith('.png')) {
          mimeType = 'image/png';
        } else if (fileName.endsWith('.gif')) {
          mimeType = 'image/gif';
        } else if (fileName.endsWith('.webp')) {
          mimeType = 'image/webp';
        }
      }

      // Call company's OpenAI Edge Function for document analysis using Supabase client
      const { data: analysisResult, error: edgeFunctionError } = await supabase.functions.invoke('analyze-document', {
        body: {
          prompt: extractionPrompt,
          imageData: `data:${mimeType};base64,${fileBase64}`,
          systemMessage: systemMessage
        }
      });

      if (edgeFunctionError) {
        console.error('Edge function error:', edgeFunctionError);
        throw new Error(`OpenAI API error: ${edgeFunctionError.message || 'Unknown error'}`);
      }

      if (!analysisResult) {
        console.error('No result from edge function');
        throw new Error('OpenAI API error: No response from analysis service');
      }

      const extractedText = analysisResult.generatedText;

      if (!extractedText) {
        throw new Error('No response from OpenAI API');
      }

      // Parse the JSON response
      let extractedData: Record<string, string>;
      try {
        // Remove any markdown code blocks if present
        let cleanedText = extractedText.replace(/```json\n?|\n?```/g, '').trim();
        
        // Try to parse as JSON first
        try {
          extractedData = JSON.parse(cleanedText);
        } catch (jsonError) {
          // If direct JSON parsing fails, try to extract JSON from the text
          console.log('🔍 JSON parsing failed, trying to extract structured data from text...');
          
          // Look for a JSON object in the text
          const jsonMatch = cleanedText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            extractedData = JSON.parse(jsonMatch[0]);
          } else {
            // If no JSON found, parse the markdown-style response
            console.log('🔍 No JSON found, parsing markdown-style response...');
            extractedData = {};
            
            // Parse markdown-style response like "- **Field:** Value"
            const lines = cleanedText.split('\n');
            for (const line of lines) {
              const match = line.match(/[-*]\s*\*\*([^*]+)\*\*[:\s]*(.+)/);
              if (match) {
                const fieldName = match[1].trim();
                let value = match[2].trim();
                
                // Clean up the value
                value = value.replace(/^["']|["']$/g, ''); // Remove quotes
                if (value.toLowerCase() === 'n/a' || value.toLowerCase() === 'not found' || value.toLowerCase() === 'none') {
                  value = '';
                }
                
                extractedData[fieldName] = value;
              }
            }
            
            console.log('🔍 Parsed data from markdown format:', extractedData);
          }
        }
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
      
      // Check if we have new columns from the extracted data and automatically add them
      const newColumnsFromExtraction = Object.keys(extractedData).filter(key => 
        !columns.includes(key) && key !== 'Storage Path' && extractedData[key] && extractedData[key].trim() !== ''
      );
      
      // ALWAYS update form data first, regardless of new columns
      // Update form data when analyzing the main document (file) or when no specific file is provided
      if (!fileToAnalyze || fileToAnalyze === file) {
        console.log('🔧 ANALYSIS: Updating main formData with extracted data');
        console.log('🔧 ANALYSIS: extractedData:', extractedData);
        setFormData(prev => {
          console.log('🔧 ANALYSIS: Previous formData:', prev);
          console.log('🔧 ANALYSIS: New formData:', extractedData);
          return extractedData;
        });
        
        toast({
          title: "Document analyzed successfully",
          description: "Data has been extracted from the document using AI.",
        });
      }
      
      // If we have new columns from analyzed data, add them to our columns automatically
      if (newColumnsFromExtraction.length > 0) {
        console.log('🔧 AUTO-UPDATING: Adding new columns from analysis:', newColumnsFromExtraction);
        setColumns(prev => {
          const updatedColumns = [...prev, ...newColumnsFromExtraction];
          console.log('🔧 AUTO-UPDATING: Updated columns array:', updatedColumns);
          return updatedColumns;
        });
        
        // Also save these new columns to user preferences so they persist
        setTimeout(async () => {
          try {
            const updatedColumns = [...columns, ...newColumnsFromExtraction];
            const updatedInstructions = { ...columnInstructions };
            
            // Add default instructions for new columns
            newColumnsFromExtraction.forEach(col => {
              if (!updatedInstructions[col]) {
                updatedInstructions[col] = `Extract the ${col.toLowerCase()} information`;
              }
            });
            
            await ExtractionPreferencesService.saveDefaultPreferences(updatedColumns, updatedInstructions);
            console.log('🔧 AUTO-UPDATING: Saved updated preferences to database');
          } catch (error) {
            console.error('Error saving updated preferences:', error);
          }
        }, 500);
      }
      
      // Show success message with extracted fields
      const extractedFieldCount = Object.values(extractedData).filter(value => value.trim() !== '').length;
      toast({
        title: "✅ Data Extraction Complete",
        description: `Successfully extracted ${extractedFieldCount} fields. Please review and verify the data before adding to runsheet.`,
      });
      
      return extractedData;
      
    } catch (error: any) {
      // Handle cancellation gracefully
      if (error.name === 'AbortError') {
        console.log('Analysis was cancelled by user');
        toast({
          title: "Analysis Cancelled",
          description: "Document analysis was cancelled by user.",
        });
        return {};
      }
      
      console.error('Analysis error:', error);
      toast({
        title: "❌ Data Extraction Failed",
        description: error.message || "Failed to analyze document. Please try re-uploading the document or check if the file is clear and readable.",
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
    console.log('🔧 DocumentProcessor: addToSpreadsheet called');
    console.log('🔧 DocumentProcessor: dataToAdd:', dataToAdd);
    console.log('🔧 DocumentProcessor: formData:', formData);
    console.log('🔧 DocumentProcessor: activeRunsheet:', activeRunsheet);
    console.log('🔧 DocumentProcessor: location.state:', location.state);
    console.log('🔧 DocumentProcessor: spreadsheetData.length:', spreadsheetData.length);
    console.log('🔧 DocumentProcessor: documentMap.size:', documentMap.size);
    
    // Use formData as fallback when dataToAdd is not provided
    const targetData = dataToAdd || formData;
    
    // Check localStorage for active runsheet as fallback
    let runsheetId = activeRunsheet?.id || location.state?.runsheet?.id || searchParams.get('id') || searchParams.get('runsheet');
    
    if (!runsheetId) {
      try {
        const storedRunsheet = localStorage.getItem('activeRunsheet');
        if (storedRunsheet) {
          const parsed = JSON.parse(storedRunsheet);
          runsheetId = parsed.id;
          setActiveRunsheet(parsed);
          console.log('🔧 DocumentProcessor: Found runsheet in localStorage:', parsed);
        }
      } catch (error) {
        console.error('🔧 DocumentProcessor: Error parsing localStorage runsheet:', error);
      }
    }
    
    console.log('🔧 DocumentProcessor: Final runsheetId before processing:', runsheetId);
    
    if (!runsheetId || runsheetId.startsWith('temp-')) {
      // We need a proper saved runsheet to add documents
      console.log('🔧 ADD_TO_SPREADSHEET: Need to save runsheet first before adding documents');
      
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast({
            title: "Authentication required",
            description: "Please sign in to save documents.",
            variant: "destructive",
          });
          return;
        }

        // Check if we have an active runsheet with a name in memory (even if not saved)
        // This happens when user creates named runsheet but hasn't saved it yet
        let runsheetName;
        if (activeRunsheet?.name && activeRunsheet.name !== 'Untitled Runsheet') {
          runsheetName = activeRunsheet.name;
          console.log('🔧 ADD_TO_SPREADSHEET: Using existing runsheet name from memory:', runsheetName);
        } else {
          // Fallback to auto-generated name
          runsheetName = `Runsheet ${new Date().toLocaleDateString()}`;
          console.log('🔧 ADD_TO_SPREADSHEET: Using auto-generated name:', runsheetName);
        }
        const initialData = [targetData];

        const { data: newRunsheet, error } = await supabase
          .from('runsheets')
          .insert({
            name: runsheetName,
            user_id: user.id,
            columns: columns,
            data: initialData,
            column_instructions: columnInstructions
          })
          .select()
          .single();

        if (error) {
          console.error('Error creating runsheet:', error);
          toast({
            title: "Failed to create runsheet",
            description: error.message,
            variant: "destructive",
          });
          return;
        }

        runsheetId = newRunsheet.id;
        console.log('🔧 ADD_TO_SPREADSHEET: Created new runsheet with ID:', runsheetId);
        
        // Update the spreadsheet data and active runsheet
        setSpreadsheetData(initialData);
        
        // Use the setCurrentRunsheet hook to properly track the new runsheet
        setCurrentRunsheet(newRunsheet.id);
        
        setActiveRunsheet({
          id: newRunsheet.id,
          name: newRunsheet.name,
          data: initialData,
          columns: columns,
          columnInstructions: columnInstructions
        });

        toast({
          title: "Document added to new runsheet",
          description: `Created "${runsheetName}" and added your document.`,
        });
        
        // Navigate to the runsheet without the action parameter
        navigate(`/runsheet?id=${runsheetId}`, { replace: true });
        return; // Exit early since we've already added the data
        
      } catch (error) {
        console.error('Error creating runsheet:', error);
        toast({
          title: "Failed to create runsheet",
          description: "Please try again.",
          variant: "destructive",
        });
        return;
      }
    }
    
    
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

    // For batch processing, we need to ensure all analyzed data columns are included
    // Check if we have data for columns that aren't in our current column set
    const newColumnsFromData = Object.keys(targetData).filter(key => 
      !columns.includes(key) && 
      key !== 'Storage Path' && 
      !key.startsWith('__') && // Filter out debug fields like __operationId
      targetData[key] && 
      targetData[key].trim() !== ''
    );
    
    // If we have new columns from analyzed data, add them to our columns
    if (newColumnsFromData.length > 0) {
      console.log('🔧 Adding new columns from analyzed data:', newColumnsFromData);
      setColumns(prev => [...prev, ...newColumnsFromData]);
    }
    
    // Include all data from targetData, including new columns
    const filteredData: Record<string, string> = {};
    
    // Include existing columns
    columns.forEach(column => {
      filteredData[column] = targetData[column] || '';
    });
    
    // Include new columns from analyzed data
    newColumnsFromData.forEach(column => {
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
    console.log('🔧 DEBUG: Current spreadsheetData before update:', spreadsheetData);
    console.log('🔧 DEBUG: documentMap before update:', documentMap);
    
    console.log('Original analyzed data:', targetData);
    console.log('Filtered data to match current columns:', finalData);
    console.log('Current columns (unchanged):', columns);
    
    // Use the backend populate-runsheet-data function to find the next empty row
    console.log('🔧 DEBUG: Calling populate-runsheet-data function');
    
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: "Authentication required",
          description: "Please sign in to add data.",
          variant: "destructive",
        });
        return;
      }

      // Prepare document info if we have a file
      let documentInfo = null;
      if (file) {
        // If we don't have a storage path, upload file first
        if (!finalData['Storage Path']) {
          console.log('🔧 DEBUG: No storage path found, uploading file now');
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
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
              toast({
                title: "File upload failed",
                description: uploadError.message,
                variant: "destructive",
              });
              return;
            } else {
              const { data: urlData } = supabase.storage
                .from('documents')
                .getPublicUrl(uniqueFilename);
              
              finalData['Storage Path'] = urlData.publicUrl;
              console.log('🔧 DEBUG: File uploaded successfully, storage path:', finalData['Storage Path']);
            }
          }
        }

        documentInfo = {
          originalFilename: file.name,
          storedFilename: finalData['Storage Path']?.split('/').pop() || file.name,
          filePath: finalData['Storage Path'] || '',
          fileSize: file.size,
          contentType: file.type || 'application/octet-stream'
        };
      }

      // Call the populate-runsheet-data function
      const response = await fetch('/functions/v1/populate-runsheet-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          runsheetId: runsheetId,
          extractedData: finalData,
          documentInfo: documentInfo
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        console.error('Error from populate-runsheet-data:', result);
        toast({
          title: "Failed to add data",
          description: result.error || "An unexpected error occurred",
          variant: "destructive",
        });
        return;
      }

      const newRowIndex = result.rowIndex;
      console.log('🔧 DEBUG: Data added to row:', newRowIndex, 'Result:', result);

      // Refresh the spreadsheet data from the database to get the updated state
      const { data: updatedRunsheet, error: fetchError } = await supabase
        .from('runsheets')
        .select('data, columns')
        .eq('id', runsheetId)
        .single();

      if (fetchError) {
        console.error('Error fetching updated runsheet:', fetchError);
      } else {
        setSpreadsheetData(updatedRunsheet.data as Record<string, string>[]);
        console.log('🔧 DEBUG: Refreshed spreadsheet data from database');
      }

      // Update the active runsheet state
      if (updatedRunsheet && activeRunsheet) {
        setActiveRunsheet({
          ...activeRunsheet,
          data: updatedRunsheet.data as Record<string, string>[]
        });
      }

      toast({
        title: "Data added successfully",
        description: result.message,
      });

    } catch (error) {
      console.error('Error calling populate-runsheet-data:', error);
      toast({
        title: "Failed to add data",
        description: "An unexpected error occurred",
        variant: "destructive",
      });
      return;
    }
    
    // Clear the form data, document, and mark as added
    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
    setHasAddedToSpreadsheet(true);
    
    // Clear the document from the processor so it's ready for next document
    setFile(null);
    setPreviewUrl(null);
    setStorageUrl(null);
    console.log('🔧 DocumentProcessor: Cleared form data and document after adding to spreadsheet');
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
    // Check for new columns from analyzed data here too
    const newColumnsFromData = Object.keys(targetData).filter(key => 
      !columns.includes(key) && 
      key !== 'Storage Path' && 
      !key.startsWith('__') && // Filter out debug fields like __operationId
      targetData[key] && 
      targetData[key].trim() !== ''
    );
    
    // If we have new columns from analyzed data, add them to our columns
    if (newColumnsFromData.length > 0) {
      console.log('🔧 Adding new columns from analyzed data (continue):', newColumnsFromData);
      setColumns(prev => [...prev, ...newColumnsFromData]);
    }
    
    const filteredData: Record<string, string> = {};
    
    // Include existing columns
    columns.forEach(column => {
      filteredData[column] = targetData[column] || '';
    });
    
    // Include new columns from analyzed data
    newColumnsFromData.forEach(column => {
      filteredData[column] = targetData[column] || '';
    });
    
    if (targetData['Storage Path']) {
      filteredData['Storage Path'] = targetData['Storage Path'];
    }
    
    let actualTargetRowIndex = 0;
    
    setSpreadsheetData(prev => {
      console.log('🔧 ROW_FINDER: Starting row search, current data length:', prev.length);
      console.log('🔧 ROW_FINDER: DocumentMap size:', documentMap.size);
      console.log('🔧 ROW_FINDER: DocumentMap entries:', Array.from(documentMap.entries()));
      
      const firstEmptyRowIndex = prev.findIndex((row, index) => {
        const hasLinkedDocument = documentMap.has(index);
        const isEmpty = isRowEmpty(row, hasLinkedDocument);
        
        console.log(`🔧 ROW_FINDER: Row ${index} check:`, {
          rowData: row,
          hasLinkedDocument,
          isEmpty,
          shouldUse: isEmpty
        });
        
        return isEmpty;
      });
      
      console.log('🔧 ROW_FINDER: First empty row index found:', firstEmptyRowIndex);
      
      let newData;
      let targetRowIndex;
      if (firstEmptyRowIndex >= 0) {
        console.log('🔧 ROW_FINDER: Using existing empty row:', firstEmptyRowIndex);
        newData = [...prev];
        newData[firstEmptyRowIndex] = { ...filteredData };
        actualTargetRowIndex = firstEmptyRowIndex;
      } else {
        // If no empty row exists, we need to add a new row
        // But first ensure we have enough rows in the spreadsheet for display
        console.log('🔧 ROW_FINDER: No empty row found, adding new row at index:', prev.length);
        actualTargetRowIndex = prev.length;
        newData = [...prev, { ...filteredData }];
        
        // If we're adding beyond row 100, we need to tell the EditableSpreadsheet to add more rows
        if (actualTargetRowIndex >= 100) {
          // Dispatch event to add more rows to the spreadsheet display
          const addRowsEvent = new CustomEvent('addMoreRowsForDocument', {
            detail: { requiredRowIndex: actualTargetRowIndex }
          });
          window.dispatchEvent(addRowsEvent);
        }
      }
      
      // Create document record and update documentMap immediately
      if (filteredData['Storage Path']) {
        createDocumentRecord(filteredData, actualTargetRowIndex);
        
        // Update the documentMap immediately to track this document
        const newDocumentMap = new Map(documentMap);
        newDocumentMap.set(actualTargetRowIndex, {
          storagePath: filteredData['Storage Path'],
          fileName: filteredData['Document File Name'] || file?.name || 'Unknown Document',
          isPending: true,
          timestamp: Date.now()
        });
        setDocumentMap(newDocumentMap);
        console.log('🔧 DocumentProcessor: Updated documentMap for row', actualTargetRowIndex, 'new size:', newDocumentMap.size);
      }
      
      return newData;
    });
    
    console.log('🔧 DocumentProcessor: Document will be added to row:', actualTargetRowIndex + 1);
    
    // Immediately save the runsheet to ensure data persistence
    // Use setTimeout to ensure state has been updated before saving
    setTimeout(async () => {
      try {
        const saveEvent = new CustomEvent('forceSaveRunsheet');
        window.dispatchEvent(saveEvent);
        console.log('🔧 DocumentProcessor: Triggered immediate save after document addition');
        
        // Show success message with save confirmation
        toast({
          title: "✅ Document Added & Saved", 
          description: `Document has been added to row ${actualTargetRowIndex + 1} and automatically saved.`,
        });
      } catch (error) {
        console.error('🔧 DocumentProcessor: Error triggering immediate save:', error);
        toast({
          title: "⚠️ Document Added", 
          description: `Document added to row ${actualTargetRowIndex + 1}, but auto-save may have failed. Please save manually.`,
          variant: "destructive"
        });
      }
    }, 200); // Small delay to ensure state updates have completed

    // Clear both form data AND the uploaded document
    const emptyFormData: Record<string, string> = {};
    columns.forEach(column => {
      emptyFormData[column] = '';
    });
    setFormData(emptyFormData);
    
    // Clear the document from the processor so it's ready for next document
    setFile(null);
    setPreviewUrl(null);
    setStorageUrl(null);
    console.log('🔧 DocumentProcessor: Cleared form data and document after adding to spreadsheet (continue function)');
  };

  // Helper function to create or correct a document record in the database
  const createDocumentRecord = async (
    data: Record<string, string>,
    rowIndex: number,
    forcedRunsheetId?: string
  ) => {
    console.log('🔧 CREATE_DOC_RECORD: createDocumentRecord called');
    console.log('🔧 CREATE_DOC_RECORD: data:', data);
    console.log('🔧 CREATE_DOC_RECORD: rowIndex:', rowIndex);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        console.log('🔧 CREATE_DOC_RECORD: No user found, returning');
        return;
      }

      // Prefer the explicitly provided runsheet ID
      let runsheetId = forcedRunsheetId || activeRunsheet?.id || location.state?.runsheetId;
      
      // If no runsheet ID from context, try to get it from the current spreadsheet
      if (!runsheetId) {
        // Check if we have a saved runsheet that matches our data
        const currentData = spreadsheetData.filter(row => 
          Object.values(row).some(value => value.trim() !== '')
        );
        
        if (currentData.length > 0) {
          // Try to find existing runsheet with matching data
          try {
            const { data: existingRunsheets } = await supabase
              .from('runsheets')
              .select('id, data')
              .eq('user_id', user.id)
              .order('updated_at', { ascending: false })
              .limit(5);
              
            if (existingRunsheets?.length) {
              for (const sheet of existingRunsheets) {
                // Check if this runsheet has matching data
                const sheetData = sheet.data as Record<string, string>[];
                if (sheetData.length > rowIndex && 
                    Object.keys(sheetData[rowIndex]).some(key => 
                      sheetData[rowIndex][key] === currentData[rowIndex]?.[key] && 
                      sheetData[rowIndex][key].trim() !== ''
                    )) {
                  runsheetId = sheet.id;
                  console.log('🔧 CREATE_DOC_RECORD: Found matching runsheet:', runsheetId);
                  break;
                }
              }
            }
          } catch (error) {
            console.error('Error finding matching runsheet:', error);
          }
        }
      }
      
      console.log('🔧 CREATE_DOC_RECORD: activeRunsheet?.id:', activeRunsheet?.id);
      console.log('🔧 CREATE_DOC_RECORD: location.state?.runsheetId:', location.state?.runsheetId);
      console.log('🔧 CREATE_DOC_RECORD: Final runsheetId:', runsheetId);
      
      if (!runsheetId || runsheetId.startsWith('temp-')) {
        console.log('🔧 CREATE_DOC_RECORD: No valid runsheet ID available (is null or temp), storing document for later creation');
        console.log('🔧 CREATE_DOC_RECORD: Current runsheetId:', runsheetId);
        
        // Store the document info for later creation when the runsheet is saved
        const documentInfo = {
          rowIndex,
          storagePath: data['Storage Path'],
          fileName: data['Document File Name'] || file?.name || 'Unknown Document',
          timestamp: Date.now()
        };
        
        // Store in sessionStorage to be processed later
        const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
        pendingDocs.push(documentInfo);
        sessionStorage.setItem('pendingDocuments', JSON.stringify(pendingDocs));
        
        console.log('🔧 CREATE_DOC_RECORD: Stored document info for later creation:', documentInfo);
        console.log('🔧 CREATE_DOC_RECORD: Total pending documents:', pendingDocs.length);
        return;
      }

      const storagePath = data['Storage Path'];
      const fileName = data['Document File Name'] || file?.name || 'Unknown Document';
      
      // Even if we don't have a storage path, we should still create a document record
      // This helps track that a document exists for this row
      
      console.log('🔧 DocumentProcessor: Ensuring document record with runsheet ID:', runsheetId);

      // If we have a storage path, check for existing records by storage path
      if (storagePath) {
        // Idempotency: check if the record for this storagePath already exists for this runsheet
        const { data: existing, error: existingErr } = await supabase
          .from('documents')
          .select('id, row_index')
          .eq('runsheet_id', runsheetId)
          .eq('file_path', storagePath)
          .maybeSingle();

        if (existingErr) {
          console.error('Error checking for existing document record:', existingErr);
        }

        if (existing) {
          // Update row index if it changed
          if (existing.row_index !== rowIndex) {
            const { error: updateErr } = await supabase
              .from('documents')
              .update({ row_index: rowIndex, updated_at: new Date().toISOString() })
              .eq('id', existing.id);
            if (updateErr) {
              console.error('Error updating document row_index:', updateErr);
            } else {
              console.log('🔧 Updated document row_index to', rowIndex);
            }
          }

          // Notify listeners regardless
          window.dispatchEvent(new CustomEvent('documentRecordCreated', {
            detail: { 
              runsheetId, 
              rowIndex,
              allPossibleIds: {
                activeRunsheetId: activeRunsheet?.id,
                locationStateId: location.state?.runsheet?.id,
                finalRunsheetId: runsheetId
              }
            }
          }));
          return;
        }
      } else {
        // If no storage path, check if we already have a document record for this row
        const { data: existing, error: existingErr } = await supabase
          .from('documents')
          .select('id')
          .eq('runsheet_id', runsheetId)
          .eq('row_index', rowIndex)
          .maybeSingle();

        if (existingErr) {
          console.error('Error checking for existing document record by row:', existingErr);
        }

        if (existing) {
          console.log('🔧 Document record already exists for row', rowIndex);
          // Notify listeners
          window.dispatchEvent(new CustomEvent('documentRecordCreated', {
            detail: { 
              runsheetId, 
              rowIndex,
              allPossibleIds: {
                activeRunsheetId: activeRunsheet?.id,
                locationStateId: location.state?.runsheet?.id,
                finalRunsheetId: runsheetId
              }
            }
          }));
          return;
        }
      }
        
        // Insert new record - even without storage path, we track the document
        const { error } = await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            runsheet_id: runsheetId,
            row_index: rowIndex,
            file_path: storagePath || '', // Use empty string if no storage path
            stored_filename: fileName,
            original_filename: fileName,
            content_type: file?.type || 'application/pdf'
          });
        
        if (error) {
          console.error('Error creating document record:', error);
        } else {
          console.log('Document record created successfully for row', rowIndex);
          // Dispatch a custom event to notify the spreadsheet to refresh documents
          window.dispatchEvent(new CustomEvent('documentRecordCreated', {
            detail: { 
              runsheetId, 
              rowIndex,
              allPossibleIds: {
                activeRunsheetId: activeRunsheet?.id,
                locationStateId: location.state?.runsheet?.id,
                finalRunsheetId: runsheetId
              }
            }
          }));
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
      startNewRunsheetSimple();
    }
  };

  // NEW: Simplified new runsheet creation using the same pattern as Dashboard
  const startNewRunsheetSimple = async () => {
    console.log('🧹 DocumentProcessor: Starting new runsheet (simplified approach)');
    
    // Clear active runsheet state first
    clearActiveRunsheet();
    
    // Navigate to clean URL without runsheet ID
    navigate('/runsheet', { replace: true });
    
    // Load user preferences for new runsheet
    try {
      const { data: { user } } = await supabase.auth.getUser();
      let initialColumns = DEFAULT_COLUMNS;
      let initialInstructions = DEFAULT_EXTRACTION_INSTRUCTIONS;
      
      if (user) {
        const preferences = await ExtractionPreferencesService.getDefaultPreferences();
        if (preferences && preferences.columns && preferences.column_instructions) {
          initialColumns = preferences.columns;
          initialInstructions = preferences.column_instructions as Record<string, string>;
        }
      }
      
      // Use the same successful pattern as Dashboard
      setTimeout(() => {
        const event = new CustomEvent('createNewRunsheetFromDashboard', {
          detail: {
            name: 'Untitled Runsheet',
            columns: initialColumns,
            instructions: initialInstructions
          }
        });
        window.dispatchEvent(event);
        
        toast({
          title: "New runsheet started",
          description: "You're now working on a fresh runsheet.",
        });
      }, 100); // Small delay to ensure navigation completes
      
    } catch (error) {
      console.error('Error starting new runsheet:', error);
      toast({
        title: "Error",
        description: "Failed to start new runsheet. Please try again.",
        variant: "destructive"
      });
    }
  };

  // OLD: Keep the complex version as fallback (but don't use it)
  const startNewRunsheet = async () => {
    // Clear the loaded runsheet ref to allow fresh loading
    loadedRunsheetRef.current = null;
    
    // CRITICAL: Clear all persistent storage that might carry over documents
    try {
      // Clear pending documents from sessionStorage
      sessionStorage.removeItem('pendingDocuments');
      console.log('🧹 Cleared pending documents from sessionStorage');
      
      // Clear emergency draft from localStorage
      localStorage.removeItem('runsheet-emergency-draft');
      console.log('🧹 Cleared emergency draft from localStorage');
      
      // Clear active runsheet from localStorage and state
      localStorage.removeItem('activeRunsheet');
      console.log('🧹 Cleared active runsheet from localStorage');
      
      // CRITICAL: Clear ALL runsheet backups from localStorage to prevent data restoration
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('runsheet_backup_')) {
          localStorage.removeItem(key);
          console.log(`🧹 Cleared backup: ${key}`);
        }
      });
      
    } catch (error) {
      console.error('Error clearing storage during new runsheet:', error);
    }
    
    // Clear all component state
    setFile(null);
    setPreviewUrl(null);
    setStorageUrl(null);
    setPendingFiles([]);
    setSpreadsheetData([]);
    setFormData({});
    setDocumentMap(new Map()); // Clear document map
    
    // Clear active runsheet state using the hook BEFORE clearing other state
    clearActiveRunsheet();
    
    // Navigate to clean URL without runsheet ID to prevent reload issues
    navigate('/runsheet', { replace: true });
    
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
    const resetEvent = new CustomEvent('startNewRunsheet', {
      detail: { clearDocuments: true, clearStorage: true, isNewRunsheet: true }
    });
    window.dispatchEvent(resetEvent);
    
    toast({
      title: "New runsheet started",
      description: "You're now working on a fresh runsheet.",
    });
    
    console.log('🧹 DocumentProcessor: New runsheet creation completed successfully');
  };


  return (
    <div className="min-h-screen bg-background">
      {isDocumentMode ? (
        // Full-screen document processing mode
        <div 
          className="fixed inset-0 z-50 bg-background flex flex-col"
          onWheel={(e) => e.stopPropagation()}
          onScroll={(e) => e.stopPropagation()}
        >
          {/* Document Mode Header */}
          <header className="border-b w-full shrink-0 bg-background">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <LogoMark 
                    className="h-12 w-12 text-primary" 
                    title="RunsheetPro" 
                  />
                  <div className="flex flex-col">
                    <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                      Document Processor
                    </h1>
                    <p className="text-sm text-muted-foreground">
                      {file ? file.name : 'Processing Document'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={uploadNewDocument}
                    className="gap-2"
                  >
                    <Upload className="h-4 w-4" />
                    Upload New Document
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowStorageDebug(true)}
                    className="gap-2"
                    title="Debug Storage Issues"
                  >
                    <Bug className="h-4 w-4" />
                    Debug
                  </Button>
                  <AuthButton />
                </div>
              </div>
            </div>
          </header>
          
          {/* Document Processing Area */}
          <div className="flex-1 flex overflow-hidden">
            {/* Left Panel - Form */}
            <div className="w-1/3 min-w-[400px] max-w-[600px] border-r border-border bg-card flex flex-col">
              <div className="p-4 border-b bg-muted/30 shrink-0">
                <h4 className="text-md font-medium text-foreground">Document Data</h4>
              </div>
              <div 
                className="flex-1 overflow-y-auto p-0"
                style={{ 
                  maxHeight: 'calc(100vh - 200px)',
                  scrollBehavior: 'smooth'
                }}
              >
                <div className="p-4 space-y-4">
                  {/* Real-time Voice Input */}
                  <RealtimeVoiceInput
                    fields={columns}
                    columnInstructions={columnInstructions || {}}
                    onDataExtracted={(data) => {
                      // Update form data with voice input
                      setFormData(prev => ({ ...prev, ...data }));
                    }}
                  />
                  
                  {/* Data Form */}
                  <DataForm 
                    fields={columns}
                    formData={formData}
                    onChange={handleFieldChange}
                    onAnalyze={analyzeDocument}
                    onCancelAnalysis={cancelAnalysis}
                    onAddToSpreadsheet={addToSpreadsheet}
                    onResetDocument={uploadNewDocument}
                    onBackToRunsheet={goBackToRunsheet}
                    isAnalyzing={isAnalyzing}
                    isUploading={false}
                    hasAddedToSpreadsheet={hasAddedToSpreadsheet}
                    fileUrl={storageUrl}
                    fileName={file?.name}
                    columnInstructions={columnInstructions}
                  />
                </div>
              </div>
            </div>
            
            {/* Right Panel - Document Viewer */}
            <div className="flex-1 flex flex-col overflow-hidden">
              {file ? (
                <DocumentViewer file={file} previewUrl={previewUrl} />
              ) : (
                <div className="h-full flex items-center justify-center">
                  <p className="text-muted-foreground">No document loaded</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        // Normal runsheet view
        <div>
          {/* Header */}
          <header className="border-b w-full">
            <div className="container mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <Link to="/" className="flex items-center gap-4">
                  <LogoMark 
                    className="h-12 w-12 text-primary" 
                    title="RunsheetPro" 
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
                      console.log('🔍 Dashboard button clicked, hasUnsavedChanges:', hasUnsavedChanges);
                      console.log('🔍 Current spreadsheet data length:', spreadsheetData.length);
                      console.log('🔍 Current active runsheet:', activeRunsheet?.name);
                      
                      if (hasUnsavedChanges) {
                        console.log('🔍 Showing navigation dialog due to unsaved changes');
                        setPendingNavigation({ path: '/app' });
                        setShowNavigationDialog(true);
                      } else {
                        console.log('🔍 No unsaved changes, navigating directly to dashboard');
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
              onResetDocument={uploadNewDocument}
              isAnalyzing={isAnalyzing}
              isExpanded={isDocumentFrameExpanded}
              onExpandedChange={setIsDocumentFrameExpanded}
            />
            
            <BatchProcessing 
              fields={columns}
              onAddToSpreadsheet={addToSpreadsheet}
              onAnalyze={analyzeDocument}
              isAnalyzing={isAnalyzing}
              isExpanded={isBatchProcessingExpanded}
              onExpandedChange={setIsBatchProcessingExpanded}
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
              initialRunsheetId={location.state?.runsheetId || searchParams.get('id') || searchParams.get('runsheet')}
              onShowMultipleUpload={() => setShowMultipleFileUpload(true)}
              onDocumentMapChange={handleDocumentMapChange}
            />
            </div>
          </div>
        </div>
      )}
      
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
        <DialogContent className="sm:max-w-[600px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Configuration Required</DialogTitle>
            <DialogDescription>
              All column headers must have extraction instructions configured before analyzing documents.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Configure extraction instructions for each column below:
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={async () => {
                  try {
                    console.log('🔧 DEBUG: Auto-fill button clicked');
                    const prefs = await ExtractionPreferencesService.getDefaultPreferences();
                    console.log('🔧 DEBUG: Retrieved preferences:', prefs);
                    const defaults = (prefs?.column_instructions as Record<string, string>) || DEFAULT_EXTRACTION_INSTRUCTIONS;
                    console.log('🔧 DEBUG: Defaults to use:', defaults);
                    console.log('🔧 DEBUG: Missing columns:', missingColumns);
                    let applied = 0;
                    setColumnInstructions(prev => {
                      const next = { ...prev } as Record<string, string>;
                      missingColumns.forEach(col => {
                        console.log(`🔧 DEBUG: Processing column "${col}"`);
                        const suggestion = defaults[col] || DEFAULT_EXTRACTION_INSTRUCTIONS[col];
                        console.log(`🔧 DEBUG: Suggestion for "${col}":`, suggestion);
                        if (suggestion && (!next[col] || next[col].trim() === '')) {
                          next[col] = suggestion;
                          applied++;
                        }
                      });
                      console.log('🔧 DEBUG: Final instructions:', next);
                      return next;
                    });
                    if (applied > 0) {
                      toast({
                        title: "Suggestions applied",
                        description: `Added suggested instructions for ${applied} column${applied === 1 ? '' : 's'}.`,
                      });
                    } else {
                      toast({
                        title: "No suggestions available",
                        description: "Could not find suggestions for the missing columns.",
                      });
                    }
                  } catch (e) {
                    console.error('Auto-fill suggestions error', e);
                    toast({
                      title: "Auto-fill failed",
                      description: "We couldn't fetch suggestions. Please try again or enter instructions manually.",
                      variant: "destructive",
                    });
                  }
                }}
              >
                Auto-fill suggested
              </Button>
            </div>
            
            <div className="space-y-3">
              {missingColumns.map((column) => (
                <div key={column} className="space-y-2">
                  <label className="text-sm font-medium text-foreground">{column}</label>
                  <textarea
                    placeholder={`Enter extraction instructions for ${column}...`}
                    className="w-full min-h-[60px] p-2 text-sm border border-border rounded-md bg-background resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                    value={columnInstructions[column] || ''}
                    onChange={(e) => {
                      setColumnInstructions(prev => ({
                        ...prev,
                        [column]: e.target.value
                      }));
                    }}
                  />
                </div>
              ))}
            </div>
            
            <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
              <strong>Tip:</strong> Be specific about what information to extract. For example: "Extract the document type (e.g., Deed, Mortgage, Lien)" or "Extract the full legal property description including lot and block numbers."
            </div>
          </div>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={handleValidationDialogClose}>
              Skip for now
            </Button>
            <Button 
              onClick={async () => {
                // Save all the configured instructions
                const hasValidInstructions = missingColumns.every(col => 
                  columnInstructions[col]?.trim()
                );
                
                if (hasValidInstructions) {
                  // Save as default preferences
                  await ExtractionPreferencesService.saveDefaultPreferences(columns, columnInstructions);
                  
                  // Immediately reload the preferences to ensure they're available for next document
                  try {
                    const updatedPrefs = await ExtractionPreferencesService.getDefaultPreferences();
                    if (updatedPrefs?.column_instructions) {
                      setColumnInstructions(updatedPrefs.column_instructions as Record<string, string>);
                      console.log('✅ Reloaded column instructions after saving:', updatedPrefs.column_instructions);
                    }
                  } catch (error) {
                    console.warn('Failed to reload preferences after saving:', error);
                  }
                  
                  toast({
                    title: "Instructions saved",
                    description: "Extraction instructions configured and saved as default.",
                  });
                  setShowValidationDialog(false);
                } else {
                  toast({
                    title: "Missing instructions",
                    description: "Please provide extraction instructions for all columns.",
                    variant: "destructive"
                  });
                }
              }}
              disabled={!missingColumns.every(col => columnInstructions[col]?.trim())}
            >
              Save & Continue
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
                      startNewRunsheetSimple();
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
                try {
                  // Check if runsheet has a default name that needs to be changed
                  const forbiddenNames = ['Untitled Runsheet', 'untitled runsheet', 'Untitled', 'untitled'];
                  const currentName = activeRunsheet?.name || '';
                  
                  if (forbiddenNames.includes(currentName.trim())) {
                    // Prompt user to name the runsheet first
                    const newName = prompt('Please enter a name for your runsheet before saving:', currentName);
                    if (!newName || newName.trim() === '' || forbiddenNames.includes(newName.trim())) {
                      console.log('❌ Save cancelled - no valid name provided');
                      setShowNavigationDialog(false);
                      setPendingNavigation(null);
                      return;
                    }
                    
                    // Update the runsheet name first
                    window.dispatchEvent(new CustomEvent('updateRunsheetName', { 
                      detail: { name: newName.trim() } 
                    }));
                    
                    // Wait a moment for the name update to propagate
                    await new Promise(resolve => setTimeout(resolve, 100));
                  }
                  
                  // Show loading state
                  toast({
                    title: "Saving runsheet...",
                    description: "Please wait while we save your changes.",
                  });

                  // Set up a promise to wait for the save completion response
                  const savePromise = new Promise<void>((resolve, reject) => {
                    const handleSaveResponse = (event: CustomEvent) => {
                      window.removeEventListener('runsheetSaveComplete', handleSaveResponse as EventListener);
                      if (event.detail.success) {
                        resolve();
                      } else {
                        reject(new Error(event.detail.error || 'Save failed'));
                      }
                    };
                    
                    window.addEventListener('runsheetSaveComplete', handleSaveResponse as EventListener);
                    
                    // Set a timeout in case the response never comes
                    setTimeout(() => {
                      window.removeEventListener('runsheetSaveComplete', handleSaveResponse as EventListener);
                      reject(new Error('Save operation timed out'));
                    }, 10000); // 10 second timeout
                  });

                  // Dispatch the save event to EditableSpreadsheet
                  const saveEvent = new CustomEvent('forceSaveRunsheet');
                  window.dispatchEvent(saveEvent);
                  
                  // Wait for the save to complete
                  await savePromise;
                  
                  setShowNavigationDialog(false);
                  
                  toast({
                    title: "Runsheet saved",
                    description: "Your changes have been saved successfully.",
                  });

                  // Now navigate
                  if (pendingNavigation) {
                    if (pendingNavigation.path === 'new-runsheet') {
                      startNewRunsheetSimple();
                    } else if (pendingNavigation.state) {
                      navigate(pendingNavigation.path, { state: pendingNavigation.state });
                    } else {
                      navigate(pendingNavigation.path);
                    }
                    setPendingNavigation(null);
                  }
                } catch (error) {
                  console.error('Failed to save runsheet:', error);
                  toast({
                    title: "Save failed",
                    description: error instanceof Error ? error.message : "Failed to save your changes. Please try again.",
                    variant: "destructive"
                  });
                  // Keep dialog open so user can try again
                }
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
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Link File to Runsheet</DialogTitle>
            <DialogDescription>
              You can analyze the document to extract data, or link the file without any extracted data.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p><strong>Analyze Document:</strong> Extract data from the document automatically</p>
              <p><strong>Link File Only:</strong> Link the file with just the filename</p>
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
                continueAddToSpreadsheet();
              }}
            >
              Link File Only
            </Button>
            <Button 
              onClick={() => {
                setConfirmAddFileDialog(false);
                analyzeDocument();
              }}
            >
              Analyze Document
            </Button>
          </div>
        </DialogContent>
      </Dialog>


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
                                columnInstructions
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
                      columnInstructions
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

      {/* Data Recovery Dialog */}
      {recoveryData && (
        <DataRecoveryDialog
          isOpen={showDataRecovery}
          onClose={handleKeepCurrentData}
          onUseBackup={handleUseBackupData}
          onKeepCurrent={handleKeepCurrentData}
          backupData={{
            lastSaved: recoveryData.backup?.lastSaved || '',
            dataRows: recoveryData.backup?.data?.length || 0
          }}
          currentData={{
            dataRows: recoveryData.current?.dataRows || 0
          }}
        />
      )}

      {/* Runsheet File Upload Dialog */}
      <Dialog open={showRunsheetUploadDialog} onOpenChange={setShowRunsheetUploadDialog}>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Upload Runsheet Files</DialogTitle>
            <DialogDescription>
              Upload Excel, CSV, or other document files to create or update a runsheet.
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
                const timestamp = new Date().toLocaleString();
                const uniqueName = `${runsheetData.name} (Imported ${timestamp})`;
                
                navigate('/runsheet', { 
                  state: { 
                    runsheet: {
                      id: `uploaded-${Date.now()}`, // Temporary ID for uploaded data
                      name: uniqueName, // Use unique name to avoid conflicts
                      columns: runsheetData.columns,
                      data: runsheetData.rows,
                      column_instructions: {}
                    },
                    clearActiveRunsheet: true, // Signal to clear active runsheet
                    isFileUpload: true, // Additional flag to indicate this is from file upload
                    preventAutoSave: true // Prevent auto-save conflicts
                  } 
                });
                
                toast({
                  title: "Runsheet loaded successfully",
                  description: `Loaded "${uniqueName}" with ${runsheetData.rows.length} rows and ${runsheetData.columns.length} columns.`
                });
              }}
              onCancel={() => {
                setShowRunsheetUploadDialog(false);
                
                // When upload is canceled, go back to dashboard instead of leaving broken state
                console.log('Upload canceled, redirecting to dashboard');
                navigate('/app');
              }}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Storage Debug Dialog */}
      <StorageDebugDialog
        open={showStorageDebug}
        onOpenChange={setShowStorageDebug}
        runsheetId={activeRunsheet?.id || location.state?.runsheetId || searchParams.get('id') || undefined}
      />
    </div>
  );
};

export default DocumentProcessor;
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Check, X, ArrowUp, ArrowDown, Save, FolderOpen, Download, Upload, AlignLeft, AlignCenter, AlignRight, Cloud, ChevronDown, FileText, Archive, ExternalLink, AlertTriangle, FileStack, Settings, Eye, EyeOff } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { GoogleDrivePicker } from './GoogleDrivePicker';
import DocumentUpload from './DocumentUpload';
import DocumentLinker from './DocumentLinker';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import DocumentNamingSettings from './DocumentNamingSettings';
import InlineDocumentViewer from './InlineDocumentViewer';
import FullScreenDocumentWorkspace from './FullScreenDocumentWorkspace';
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
}

const EditableSpreadsheet: React.FC<SpreadsheetProps> = ({ 
  initialColumns, 
  initialData,
  onColumnChange,
  onDataChange,
  onColumnInstructionsChange,
  onUnsavedChanges,
  missingColumns = [],
  initialRunsheetName,
  initialRunsheetId,
  onShowMultipleUpload
}) => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { setActiveRunsheet, clearActiveRunsheet, currentRunsheet, updateRunsheet } = useActiveRunsheet();
  const [user, setUser] = useState<User | null>(null);
  
  // Track locally which columns need configuration
  const [localMissingColumns, setLocalMissingColumns] = useState<string[]>([]);
  const [isLoadingRunsheet, setIsLoadingRunsheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showUploadWarningDialog, setShowUploadWarningDialog] = useState(false);
  const [savedRunsheets, setSavedRunsheets] = useState<any[]>([]);
  const [runsheetName, setRunsheetName] = useState<string>(initialRunsheetName || 'Untitled Runsheet');
  const [editingRunsheetName, setEditingRunsheetName] = useState<boolean>(false);
  const [tempRunsheetName, setTempRunsheetName] = useState<string>('');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNameConflictDialog, setShowNameConflictDialog] = useState(false);
  const [nameConflictData, setNameConflictData] = useState<{ originalName: string; suggestedName: string } | null>(null);
  const [pendingSaveData, setPendingSaveData] = useState<{ isUpdate: boolean; runsheetId?: string; shouldClose?: boolean } | null>(null);
  const [showDocumentNamingDialog, setShowDocumentNamingDialog] = useState(false);
  
  // Helper function to ensure document columns exist
  const ensureDocumentColumns = (columnsList: string[]): string[] => {
    // Remove Document File Name from regular columns since we'll handle it separately
    return columnsList.filter(col => col !== 'Document File Name');
  };
  
  const [columns, setColumns] = useState<string[]>(() => ensureDocumentColumns(initialColumns));
  const [data, setData] = useState<Record<string, string>[]>(() => {
    // Ensure we always have at least 20 rows
    const minRows = 20;
    const existingRows = initialData.length;
    const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
    return [...initialData, ...emptyRows];
  });
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [lastSavedState, setLastSavedState] = useState<string>('');
  const [selectedRange, setSelectedRange] = useState<{start: {rowIndex: number, columnIndex: number}, end: {rowIndex: number, columnIndex: number}} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedData, setCopiedData] = useState<string[][] | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [resizing, setResizing] = useState<{column: string, startX: number, startWidth: number} | null>(null);
  const [resizingRow, setResizingRow] = useState<{rowIndex: number, startY: number, startHeight: number} | null>(null);
  const [showAddRowsDialog, setShowAddRowsDialog] = useState(false);
  const [rowsToAdd, setRowsToAdd] = useState<number>(1);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [editingColumnName, setEditingColumnName] = useState<string>('');
  const [editingColumnInstructions, setEditingColumnInstructions] = useState<string>('');
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [showNewRunsheetDialog, setShowNewRunsheetDialog] = useState(false);
  const [showNameNewRunsheetDialog, setShowNameNewRunsheetDialog] = useState(false);
  const [newRunsheetName, setNewRunsheetName] = useState('');
  const [showAnalyzeWarningDialog, setShowAnalyzeWarningDialog] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{file: File, filename: string, rowIndex: number} | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [columnAlignments, setColumnAlignments] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [editingColumnAlignment, setEditingColumnAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [showGoogleDrivePicker, setShowGoogleDrivePicker] = useState(false);
  const [isSavingAsDefault, setIsSavingAsDefault] = useState(false);
  const [hasManuallyResizedColumns, setHasManuallyResizedColumns] = useState(false);
  const [documentMap, setDocumentMap] = useState<Map<number, DocumentRecord>>(new Map());
  const [currentRunsheetId, setCurrentRunsheetId] = useState<string | null>(null);
  const [showNamingSettings, setShowNamingSettings] = useState(false);
  const [inlineViewerRow, setInlineViewerRow] = useState<number | null>(null);
  const [fullScreenWorkspace, setFullScreenWorkspace] = useState<{ runsheetId: string; rowIndex: number } | null>(null);
  const [showDocumentFileNameColumn, setShowDocumentFileNameColumn] = useState(false);
  
  // Listen for document upload save requests
  React.useEffect(() => {
    const handleSaveRequest = async (event: CustomEvent) => {
      try {
        console.log('🔧 EditableSpreadsheet: Received save request before upload');
        await saveRunsheet();
        
        // After save, the currentRunsheetId should be set
        if (currentRunsheetId) {
          // Send success response with the runsheet ID
          const responseEvent = new CustomEvent('runsheetSaveResponse', {
            detail: { success: true, runsheetId: currentRunsheetId }
          });
          window.dispatchEvent(responseEvent);
        } else {
          // Send error response
          const responseEvent = new CustomEvent('runsheetSaveResponse', {
            detail: { success: false, error: 'Failed to save runsheet - no ID available' }
          });
          window.dispatchEvent(responseEvent);
        }
      } catch (error) {
        console.error('Error saving runsheet before upload:', error);
        const responseEvent = new CustomEvent('runsheetSaveResponse', {
          detail: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
        });
        window.dispatchEvent(responseEvent);
      }
    };

    window.addEventListener('saveRunsheetBeforeUpload', handleSaveRequest as EventListener);
    
    return () => {
      window.removeEventListener('saveRunsheetBeforeUpload', handleSaveRequest as EventListener);
    };
  }, [currentRunsheetId, runsheetName, data, columns, columnInstructions]);
  
  // Ref for container width measurement
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  
  // Calculate and distribute column widths when columns change
  useEffect(() => {
    if (containerRef.current && columns.length > 0) {
      // Get the container width (accounting for borders and padding)
      const containerWidth = containerRef.current.clientWidth - 2; // -2 for borders
      const availableWidth = Math.max(containerWidth, 800); // Minimum width of 800px
      const columnWidth = Math.floor(availableWidth / columns.length);
      
      // Only set widths if no columns have been manually resized
      if (!hasManuallyResizedColumns) {
        const newWidths: Record<string, number> = {};
        columns.forEach(column => {
          newWidths[column] = columnWidth;
        });
        setColumnWidths(newWidths);
      }
    }
  }, [columns, hasManuallyResizedColumns]);

  // Sync data with initialData prop changes
  useEffect(() => {
    const minRows = 20;
    const existingRows = initialData.length;
    const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
    const newData = [...initialData, ...emptyRows];
    
    // Only update if the data actually changed
    setData(prevData => {
      if (JSON.stringify(prevData) !== JSON.stringify(newData)) {
        return newData;
      }
      return prevData;
    });
  }, [initialData, initialColumns]);

  // Update local missing columns based on current column instructions
  useEffect(() => {
    // Don't check for missing columns while loading a runsheet
    if (isLoadingRunsheet) {
      console.log('Skipping missing column check - runsheet is loading');
      return;
    }
    
    // If we have columns but no column instructions at all, wait for them to load
    if (columns.length > 0 && Object.keys(columnInstructions).length === 0) {
      console.log('Skipping missing column check - column instructions not loaded yet');
      return;
    }
    
    // Smart check: if we have column instructions but they don't match current columns,
    // it likely means we're in the middle of loading a different runsheet
    const instructionColumns = Object.keys(columnInstructions);
    if (instructionColumns.length > 0) {
      const hasMatchingInstructions = columns.some(col => 
        col !== 'Document File Name' && columnInstructions[col]
      );
      const hasNonMatchingInstructions = instructionColumns.some(col => !columns.includes(col));
      
      if (!hasMatchingInstructions || hasNonMatchingInstructions) {
        console.log('Skipping missing column check - column instructions being updated');
        return;
      }
    }
    
    const missing = columns.filter(column => 
      column !== 'Document File Name' && // Skip Document File Name - it's user-specified, not extracted
      (!columnInstructions[column] || columnInstructions[column].trim() === '')
    );
    console.log('Missing columns check:', { columns, columnInstructions, missing, isLoadingRunsheet });
    setLocalMissingColumns(missing);
  }, [columns, columnInstructions, isLoadingRunsheet]);

  // Check user authentication status
  useEffect(() => {
    const initAuth = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);

        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null);
        });

        return () => subscription.unsubscribe();
      } catch (error) {
        console.warn('Auth initialization failed in spreadsheet:', error);
      }
    };

    initAuth();
  }, []);

  // Update runsheet name when initialRunsheetName prop changes
  useEffect(() => {
    if (initialRunsheetName && initialRunsheetName !== runsheetName) {
      setRunsheetName(initialRunsheetName);
    }
  }, [initialRunsheetName]);

  // Set initial runsheet ID if provided
  useEffect(() => {
    if (initialRunsheetId) {
      setCurrentRunsheetId(initialRunsheetId);
    }
  }, [initialRunsheetId]);

  // Load documents when runsheet changes
  useEffect(() => {
    const loadDocuments = async () => {
      if (!user || !currentRunsheetId) return;
      
      // Don't reload documents immediately during save process
      if (isSaving) {
        console.log('Skipping document load during save process');
        return;
      }
      
      try {
        console.log('Loading documents for runsheet:', currentRunsheetId);
        const documents = await DocumentService.getDocumentMapForRunsheet(currentRunsheetId);
        console.log('Loaded documents:', documents);
        setDocumentMap(documents);
      } catch (error) {
        console.error('Error loading documents:', error);
      }
    };

    loadDocuments();
  }, [user, currentRunsheetId, isSaving]);

  // Listen for document record creation events to refresh the document map
  useEffect(() => {
    const handleDocumentRecordCreated = async (event: CustomEvent) => {
      console.log('🔧 EditableSpreadsheet: Document record created event received:', event.detail);
      const { runsheetId, rowIndex } = event.detail;
      
      if (runsheetId === currentRunsheetId) {
        console.log('🔧 EditableSpreadsheet: Runsheet ID matches, refreshing document map');
        
        // Refresh the entire document map
        if (user && currentRunsheetId) {
          try {
            console.log('🔧 EditableSpreadsheet: Fetching updated document map');
            const documents = await DocumentService.getDocumentMapForRunsheet(currentRunsheetId);
            console.log('🔧 EditableSpreadsheet: New document map:', documents);
            setDocumentMap(documents);
          } catch (error) {
            console.error('Error refreshing documents:', error);
          }
        }
      } else {
        console.log('🔧 EditableSpreadsheet: Runsheet ID mismatch, not refreshing');
      }
    };

    console.log('🔧 EditableSpreadsheet: Setting up document record created event listener');
    window.addEventListener('documentRecordCreated', handleDocumentRecordCreated as EventListener);
    
    return () => {
      console.log('🔧 EditableSpreadsheet: Removing document record created event listener');
      window.removeEventListener('documentRecordCreated', handleDocumentRecordCreated as EventListener);
    };
  }, [user, currentRunsheetId]);

  // Process pending document records when runsheet is saved
  useEffect(() => {
    const processPendingDocuments = async () => {
      if (!user || !currentRunsheetId) return;
      
      const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
      if (pendingDocs.length === 0) return;
      
      console.log('🔧 EditableSpreadsheet: Processing pending documents:', pendingDocs);
      
      try {
        for (const doc of pendingDocs) {
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
            console.error('Error creating pending document record:', error);
          } else {
            console.log('Created pending document record for row', doc.rowIndex);
          }
        }
        
        // Clear pending documents after processing
        sessionStorage.removeItem('pendingDocuments');
        
        // Refresh document map
        const documents = await DocumentService.getDocumentMapForRunsheet(currentRunsheetId);
        setDocumentMap(documents);
        
        console.log('🔧 EditableSpreadsheet: Processed all pending documents and refreshed map');
        
      } catch (error) {
        console.error('Error processing pending documents:', error);
      }
    };
    
    // Only process if we have a runsheet ID and user
    if (currentRunsheetId && user) {
      processPendingDocuments();
    }
  }, [currentRunsheetId, user]);

  // Update active runsheet when name changes
  useEffect(() => {
    if (runsheetName && runsheetName !== 'Untitled Runsheet' && currentRunsheet) {
      setActiveRunsheet({ 
        ...currentRunsheet,
        name: runsheetName 
      });
    }
  }, [runsheetName, currentRunsheet]);

  // Listen for external trigger events from DocumentProcessor
  useEffect(() => {
    const handleUploadTrigger = () => {
      handleUploadClick();
    };

    const handleOpenTrigger = () => {
      setShowOpenDialog(true);
    };

    const handleLoadSpecificRunsheet = (event: CustomEvent) => {
      const { runsheetId } = event.detail;
      console.log('Loading specific runsheet:', runsheetId);
      loadSpecificRunsheet(runsheetId);
    };

    const handleAutoRestoreLastRunsheet = async () => {
      console.log('Auto-restoring last runsheet');
      await autoRestoreLastRunsheet();
    };

    const handleImportRunsheetFile = (event: CustomEvent) => {
      const { file } = event.detail;
      console.log('🔧 EditableSpreadsheet: Import runsheet file event received:', file.name);
      console.log('🔧 EditableSpreadsheet: Calling handleFileUpload with file:', file);
      handleFileUpload(file, file.name);
    };

    const handleOpenGoogleDrivePicker = () => {
      console.log('🔧 EditableSpreadsheet: Open Google Drive picker event received');
      setShowGoogleDrivePicker(true);
    };

    const handleRefreshRunsheetData = async (event: CustomEvent) => {
      const { runsheetId } = event.detail;
      console.log('🔧 EditableSpreadsheet: Refresh runsheet data event received for:', runsheetId);
      
      if (runsheetId === currentRunsheetId && user) {
        console.log('🔧 EditableSpreadsheet: Runsheet ID matches, refreshing data from database');
        try {
          // Reload the runsheet data from the database
          const { data: runsheet, error } = await supabase
            .from('runsheets')
            .select('*')
            .eq('id', runsheetId)
            .single();

          if (error) {
            console.error('Error refreshing runsheet data:', error);
            return;
          }

          if (runsheet) {
            console.log('🔧 EditableSpreadsheet: Successfully refreshed runsheet data');
            // Properly type-cast the data from JSON to the expected format
            setData((runsheet.data as Record<string, string>[]) || []);
            setColumns((runsheet.columns as string[]) || []);
            setRunsheetName(runsheet.name || 'Untitled Runsheet');
            setCurrentRunsheetId(runsheet.id);
            
            // Also refresh the document links
            console.log('🔧 EditableSpreadsheet: Refreshing document links');
            const documents = await DocumentService.getDocumentMapForRunsheet(runsheetId);
            console.log('🔧 EditableSpreadsheet: Refreshed documents:', documents);
            setDocumentMap(documents);
          }
        } catch (error) {
          console.error('Error refreshing runsheet data:', error);
        }
      }
    };

    const handleUpdateDocumentFilename = async (event: CustomEvent) => {
      const { runsheetId, rowIndex, filename } = event.detail;
      
      if (runsheetId === currentRunsheetId) {
        // Update the specific row with the filename (stored in background)
        setData(prev => {
          const newData = [...prev];
          
          // Ensure the row exists
          while (newData.length <= rowIndex) {
            const newRow: Record<string, string> = {};
            columns.forEach(col => newRow[col] = '');
            newRow['Document File Name'] = ''; // Always maintain document filename data in background
            newData.push(newRow);
          }
          
          // Update the Document File Name field
          newData[rowIndex] = {
            ...newData[rowIndex],
            'Document File Name': filename
          };
          
          return newData;
        });
        
        // Mark as having unsaved changes to trigger auto-save
        setHasUnsavedChanges(true);
      }
    };

    window.addEventListener('triggerSpreadsheetUpload', handleUploadTrigger);
    window.addEventListener('triggerSpreadsheetOpen', handleOpenTrigger);
    window.addEventListener('loadSpecificRunsheet', handleLoadSpecificRunsheet as EventListener);
    window.addEventListener('autoRestoreLastRunsheet', handleAutoRestoreLastRunsheet);
    window.addEventListener('importRunsheetFile', handleImportRunsheetFile as EventListener);
    window.addEventListener('openGoogleDrivePicker', handleOpenGoogleDrivePicker);
    window.addEventListener('refreshRunsheetData', handleRefreshRunsheetData as EventListener);
    window.addEventListener('updateDocumentFilename', handleUpdateDocumentFilename as EventListener);

    return () => {
      window.removeEventListener('triggerSpreadsheetUpload', handleUploadTrigger);
      window.removeEventListener('triggerSpreadsheetOpen', handleOpenTrigger);
      window.removeEventListener('loadSpecificRunsheet', handleLoadSpecificRunsheet as EventListener);
      window.removeEventListener('autoRestoreLastRunsheet', handleAutoRestoreLastRunsheet);
      window.removeEventListener('importRunsheetFile', handleImportRunsheetFile as EventListener);
      window.removeEventListener('openGoogleDrivePicker', handleOpenGoogleDrivePicker);
      window.removeEventListener('refreshRunsheetData', handleRefreshRunsheetData as EventListener);
      window.removeEventListener('updateDocumentFilename', handleUpdateDocumentFilename as EventListener);
    };
  }, [columns, currentRunsheetId]);


  // Enhanced auto-save functionality with immediate saving
  const autoSaveRunsheet = useCallback(async () => {
    if (!user || !hasUnsavedChanges) return;
    
    try {
      const { error } = await supabase
        .from('runsheets')
        .upsert({
          name: runsheetName,
          columns: columns,
          data: data,
          column_instructions: columnInstructions,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,name'
        });

      if (!error) {
        const savedState = JSON.stringify({ data, columns, runsheetName, columnInstructions });
        setLastSavedState(savedState);
        setHasUnsavedChanges(false);
        setLastSaveTime(new Date());
        onUnsavedChanges?.(false);
        console.log('Auto-saved runsheet successfully');
      }
    } catch (error) {
      console.error('Autosave failed:', error);
    }
  }, [user, hasUnsavedChanges, runsheetName, columns, data, columnInstructions, onUnsavedChanges]);

  // Force save function for critical moments (navigation, etc.)
  const forceSave = useCallback(async () => {
    if (!user || !runsheetName || columns.length === 0) return;
    
    try {
      await supabase
        .from('runsheets')
        .upsert({
          name: runsheetName,
          columns: columns,
          data: data,
          column_instructions: columnInstructions,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,name'
        });
      
      const savedState = JSON.stringify({ data, columns, runsheetName, columnInstructions });
      setLastSavedState(savedState);
      setHasUnsavedChanges(false);
      onUnsavedChanges?.(false);
      console.log('Force save completed');
    } catch (error) {
      console.error('Force save failed:', error);
    }
  }, [user, runsheetName, columns, data, columnInstructions, onUnsavedChanges]);

  // Track changes and trigger auto-save with proper change detection
  useEffect(() => {
    if (!user) return;
    
    // Create a state snapshot for comparison
    const currentState = JSON.stringify({ data, columns, runsheetName, columnInstructions });
    
    // Initialize lastSavedState if it's empty
    if (!lastSavedState) {
      setLastSavedState(currentState);
      return;
    }
    
    // Only mark as unsaved if the state actually changed from the last saved state
    if (currentState !== lastSavedState) {
      console.log('Change detected, marking as unsaved');
      setHasUnsavedChanges(true);
      onUnsavedChanges?.(true);
      
      // Delayed auto-save: save 30 seconds after the last change to give user time for navigation prompts
      const timeoutId = setTimeout(() => {
        autoSaveRunsheet();
      }, 30000); // Increased from 3 seconds to 30 seconds
      
      return () => clearTimeout(timeoutId);
    }
  }, [data, columns, runsheetName, columnInstructions, user, lastSavedState, autoSaveRunsheet, onUnsavedChanges]);

  // Aggressive fallback auto-save every 30 seconds
  useEffect(() => {
    if (!user) return;
    
    const interval = setInterval(() => {
      if (hasUnsavedChanges) {
        autoSaveRunsheet();
      }
    }, 30000); // Auto-save every 30 seconds if there are changes

    return () => clearInterval(interval);
  }, [user, hasUnsavedChanges, autoSaveRunsheet]);

  // Enhanced page navigation and visibility handling
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && user) {
        // Force immediate save using sendBeacon for reliability
        const payload = JSON.stringify({
          name: runsheetName,
          columns: columns,
          data: data,
          column_instructions: columnInstructions,
          user_id: user.id,
          updated_at: new Date().toISOString(),
        });
        
        // Use sendBeacon for reliable saving during page unload
        const saveUrl = 'https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/save-runsheet';
        navigator.sendBeacon(saveUrl, payload);
        
        // Also try regular save
        forceSave();
      }
    };

    // Save when page becomes hidden (user switches tabs or navigates)
    const handleVisibilityChange = () => {
      if (document.hidden && hasUnsavedChanges && user) {
        forceSave();
      }
    };

    // Save on blur (when user clicks away from the page)
    const handleBlur = () => {
      if (hasUnsavedChanges && user) {
        forceSave();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleBlur);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleBlur);
    };
  }, [hasUnsavedChanges, user, runsheetName, columns, data, columnInstructions, forceSave]);

  // Check if runsheet name exists and handle conflicts
  const checkRunsheetNameConflict = async (baseName: string, userId: string): Promise<{ hasConflict: boolean; suggestedName?: string }> => {
    // Check if runsheet with this name already exists
    const { data: existingRunsheet, error } = await supabase
      .from('runsheets')
      .select('id')
      .eq('user_id', userId)
      .eq('name', baseName)
      .single();
    
    if (error && error.code === 'PGRST116') {
      // No existing runsheet found - this name is available
      return { hasConflict: false };
    } else if (existingRunsheet) {
      // Name exists, generate suggested alternative
      let suggestedName = baseName;
      let counter = 1;
      
      while (true) {
        suggestedName = `${baseName} (${counter})`;
        const { data: conflictCheck, error: conflictError } = await supabase
          .from('runsheets')
          .select('id')
          .eq('user_id', userId)
          .eq('name', suggestedName)
          .single();
        
        if (conflictError && conflictError.code === 'PGRST116') {
          // This suggested name is available
          break;
        }
        counter++;
      }
      
      return { hasConflict: true, suggestedName };
    } else {
      // Some other error occurred
      console.error('Error checking for existing runsheet:', error);
      return { hasConflict: false };
    }
  };

  // Save runsheet to Supabase
  const saveRunsheet = async () => {
    console.log('Save button clicked!');
    console.log('User state:', user);
    console.log('Runsheet name:', runsheetName);
    console.log('Columns:', columns);
    console.log('Data before save:', JSON.stringify(data, null, 2));
    console.log('Document map before save:', documentMap);
    console.log('Column instructions before save:', columnInstructions);

    if (!user) {
      console.log('No user - showing auth required toast');
      toast({
        title: "Authentication required",
        description: "Please sign in to save your runsheet.",
        variant: "destructive",
      });
      return;
    }

    console.log('Starting save process...');
    setIsSaving(true);
    
    try {
      console.log('Attempting to save to database...');
      
      let savedRunsheet;
      let finalName = runsheetName; // Default to current name
      
      if (currentRunsheetId) {
        // Update existing runsheet
        console.log('Updating existing runsheet with ID:', currentRunsheetId);
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update({
            name: runsheetName,
            columns: columns,
            data: data,
            column_instructions: columnInstructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentRunsheetId)
          .eq('user_id', user.id)
          .select('id')
          .single();
        
        if (error) throw error;
        savedRunsheet = updateResult;
        
        // Set the current runsheet ID for document linking
        setCurrentRunsheetId(updateResult.id);
        
        // Update the runsheet in the global state - need to add a new entry with the database ID
        if (currentRunsheet) {
          const updatedRunsheet = {
            id: updateResult.id, // Use the database ID
            name: finalName,
            data,
            columns,
            columnInstructions,
            hasUnsavedChanges: false,
            lastSaveTime: new Date()
          };
          
          // Update the active runsheet with the database ID
          setActiveRunsheet({
            id: updateResult.id,
            name: finalName,
            data,
            columns,
            columnInstructions,
            hasUnsavedChanges: false,
            lastSaveTime: new Date()
          });
        }
      } else {
        // Create new runsheet - check for name conflicts
        const conflictCheck = await checkRunsheetNameConflict(runsheetName, user.id);
        
        if (conflictCheck.hasConflict) {
          // Show conflict dialog and return early
          setNameConflictData({ originalName: runsheetName, suggestedName: conflictCheck.suggestedName! });
          setPendingSaveData({ isUpdate: false, shouldClose: false });
          setShowNameConflictDialog(true);
          setIsSaving(false);
          return;
        }
        
        finalName = runsheetName;
        
        const { data: insertResult, error } = await supabase
          .from('runsheets')
          .insert({
            name: finalName,
            columns: columns,
            data: data,
            column_instructions: columnInstructions,
            user_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;
        savedRunsheet = insertResult;
        
        // Set the current runsheet ID for document linking
        setCurrentRunsheetId(savedRunsheet.id);
        
        // Update the runsheet in the global state with the new ID
        if (currentRunsheet) {
          const updatedRunsheet = {
            id: savedRunsheet.id, // Use the database ID
            name: finalName,
            data,
            columns,
            columnInstructions,
            hasUnsavedChanges: false,
            lastSaveTime: new Date()
          };
          
          // Update the active runsheet with the database ID
          setActiveRunsheet({
            id: savedRunsheet.id,
            name: finalName,
            data,
            columns,
            columnInstructions,
            hasUnsavedChanges: false,
            lastSaveTime: new Date()
          });
        }
      }

      console.log('Save successful!');
      
      const savedState = JSON.stringify({ data, columns, runsheetName: finalName, columnInstructions });
      setLastSavedState(savedState);
      setHasUnsavedChanges(false);
      setLastSaveTime(new Date());
      onUnsavedChanges?.(false);
      toast({
        title: "Runsheet saved",
        description: `"${finalName}" has been saved successfully.`,
      });
    } catch (error: any) {
      console.error('Save failed:', error);
      toast({
        title: "Failed to save runsheet",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      console.log('Save process completed');
    }
  };


  // Save and close runsheet - saves the data, clears active status, and navigates back to dashboard
  const saveAndCloseRunsheet = async () => {
    console.log('Save and Close button clicked!');
    
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to save your runsheet.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    
    try {
      // First save the runsheet
      let savedRunsheet;
      let finalName = runsheetName;
      
      if (currentRunsheetId) {
        // Update existing runsheet
        console.log('Updating existing runsheet with ID:', currentRunsheetId);
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update({
            name: runsheetName,
            columns: columns,
            data: data,
            column_instructions: columnInstructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', currentRunsheetId)
          .eq('user_id', user.id)
          .select('id')
          .single();
        
        if (error) throw error;
        savedRunsheet = updateResult;
      } else {
        // Check for name conflicts when creating new runsheet
        const conflictCheck = await checkRunsheetNameConflict(runsheetName, user.id);
        
        if (conflictCheck.hasConflict) {
          // Show conflict dialog and return early
          setNameConflictData({ originalName: runsheetName, suggestedName: conflictCheck.suggestedName! });
          setPendingSaveData({ isUpdate: false, shouldClose: true });
          setShowNameConflictDialog(true);
          setIsSaving(false);
          return;
        }
        
        // Create new runsheet
        const { data: insertResult, error } = await supabase
          .from('runsheets')
          .insert({
            name: finalName,
            columns: columns,
            data: data,
            column_instructions: columnInstructions,
            user_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;
        savedRunsheet = insertResult;
      }

      // Process pending documents if any exist
      const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
      if (pendingDocs.length > 0) {
        console.log('Processing pending documents:', pendingDocs.length);
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session) {
            const response = await fetch(
              `https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/upload-pending-documents`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.access_token}`,
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  runsheetId: savedRunsheet.id,
                  pendingDocuments: pendingDocs,
                  userId: user.id
                }),
              }
            );

            if (response.ok) {
              const result = await response.json();
              console.log('Pending documents processed:', result);
              
              // Clear pending documents from session storage
              sessionStorage.removeItem('pendingDocuments');
            } else {
              console.error('Failed to process pending documents:', await response.text());
            }
          }
        } catch (error) {
          console.error('Error processing pending documents:', error);
        }
      }

      // Update local state
      const savedState = JSON.stringify({ data, columns, runsheetName: finalName, columnInstructions });
      setLastSavedState(savedState);
      setHasUnsavedChanges(false);
      setLastSaveTime(new Date());
      onUnsavedChanges?.(false);

      // Clear the active runsheet and navigate
      clearActiveRunsheet();
      clearActiveRunsheet();

      toast({
        title: "Runsheet saved and closed",
        description: `"${finalName}" has been saved successfully.`,
      });

      // Navigate back to dashboard
      navigate('/app');

    } catch (error: any) {
      console.error('Save and close failed:', error);
      toast({
        title: "Failed to save runsheet",
        description: error.message || "An error occurred while saving. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle name conflict resolution
  const handleOverwriteRunsheet = async () => {
    if (!nameConflictData || !pendingSaveData || !user) return;
    
    setShowNameConflictDialog(false);
    setIsSaving(true);
    
    try {
      let finalName = nameConflictData.originalName;
      let savedRunsheet;
      
      if (pendingSaveData.isUpdate && pendingSaveData.runsheetId) {
        // Update existing runsheet
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update({
            name: finalName,
            columns: columns,
            data: data,
            column_instructions: columnInstructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', pendingSaveData.runsheetId)
          .eq('user_id', user.id)
          .select('id')
          .single();
        
        if (error) throw error;
        savedRunsheet = updateResult;
      } else {
        // Overwrite/create new runsheet - delete existing one first
        const { error: deleteError } = await supabase
          .from('runsheets')
          .delete()
          .eq('user_id', user.id)
          .eq('name', finalName);
        
        if (deleteError) {
          console.warn('Delete operation failed, but continuing with insert:', deleteError);
        }
        
        // Create new runsheet
        const { data: insertResult, error } = await supabase
          .from('runsheets')
          .insert({
            name: finalName,
            columns: columns,
            data: data,
            column_instructions: columnInstructions,
            user_id: user.id,
            updated_at: new Date().toISOString(),
          })
          .select('id')
          .single();

        if (error) throw error;
        savedRunsheet = insertResult;
        setCurrentRunsheetId(savedRunsheet.id);
      }
      
      // Update global state
      if (currentRunsheet) {
        const updatedRunsheet = {
          id: savedRunsheet.id,
          name: finalName,
          data,
          columns,
          columnInstructions,
          hasUnsavedChanges: false,
          lastSaveTime: new Date()
        };
        // Update the active runsheet with the database ID
        setActiveRunsheet({
          id: savedRunsheet.id,
          name: finalName,
          data,
          columns,
          columnInstructions,
          hasUnsavedChanges: false,
          lastSaveTime: new Date()
        });
      }
      
      const savedState = JSON.stringify({ data, columns, runsheetName: finalName, columnInstructions });
      setLastSavedState(savedState);
      setHasUnsavedChanges(false);
      setLastSaveTime(new Date());
      onUnsavedChanges?.(false);
      
      const isCloseOperation = pendingSaveData.shouldClose;
      
      if (isCloseOperation) {
        // Clear the active runsheet and navigate to dashboard
        clearActiveRunsheet();
        
        toast({
          title: "Runsheet saved and closed",
          description: `"${finalName}" has been overwritten successfully.`,
        });
        
        // Navigate back to dashboard
        navigate('/app');
      } else {
        toast({
          title: "Runsheet saved",
          description: `"${finalName}" has been overwritten successfully.`,
        });
      }
    } catch (error: any) {
      console.error('Save failed:', error);
      toast({
        title: "Failed to save runsheet",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
      setNameConflictData(null);
      setPendingSaveData(null);
    }
  };

  const handleUseSuggestedName = async () => {
    if (!nameConflictData || !pendingSaveData || !user) return;
    
    setShowNameConflictDialog(false);
    setRunsheetName(nameConflictData.suggestedName);
    
    // Trigger save with the suggested name
    setTimeout(() => {
      if (pendingSaveData.isUpdate) {
        saveAndCloseRunsheet();
      } else {
        saveRunsheet();
      }
    }, 100);
  };

  const handleCancelSave = () => {
    setShowNameConflictDialog(false);
    setNameConflictData(null);
    setPendingSaveData(null);
    setIsSaving(false);
  };

  // Save current configuration as default
  const saveAsDefault = async () => {
    if (!user) {
      toast({
        title: "Authentication required",
        description: "Please sign in to save default extraction preferences.",
        variant: "destructive",
      });
      return;
    }

    setIsSavingAsDefault(true);
    
    try {
      const success = await ExtractionPreferencesService.saveDefaultPreferences(columns, columnInstructions);
      
      if (success) {
        toast({
          title: "Default saved",
          description: "Current extraction configuration saved as default for future use.",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save default configuration. Please try again.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error saving as default:', error);
      toast({
        title: "Error", 
        description: "An unexpected error occurred while saving default configuration.",
        variant: "destructive",
      });
    } finally {
      setIsSavingAsDefault(false);
    }
  };

  // Fetch saved runsheets from Supabase
  const fetchSavedRunsheets = async () => {
    console.log('🚀 BUTTON CLICKED - fetchSavedRunsheets function called!');
    console.log('fetchSavedRunsheets called, user:', user);
    
    if (!user) {
      console.log('No user found, showing auth toast');
      toast({
        title: "Authentication required",
        description: "Please sign in to view saved runsheets.",
        variant: "destructive",
      });
      return;
    }

    console.log('Setting loading to true');
    setIsLoading(true);
    try {
      console.log('Fetching runsheets from database...');
      const { data: runsheets, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) {
        console.error('Database error:', error);
        throw error;
      }

      console.log('Runsheets fetched successfully:', runsheets?.length || 0);
      setSavedRunsheets(runsheets || []);
      setShowOpenDialog(true);
    } catch (error: any) {
      console.error('Error in fetchSavedRunsheets:', error);
      toast({
        title: "Failed to load runsheets",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      console.log('Setting loading to false');
      setIsLoading(false);
    }
  };

  // Auto-restore the most recently updated runsheet
  const autoRestoreLastRunsheet = async () => {
    if (!user) return;

    try {
      const { data: runsheets, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error fetching last runsheet:', error);
        return;
      }

      if (runsheets && runsheets.length > 0) {
        const lastRunsheet = runsheets[0];
        console.log('Auto-restoring runsheet:', lastRunsheet.name);
        setIsLoadingRunsheet(true);
        await loadRunsheet(lastRunsheet);
        
        toast({
          title: "Runsheet restored",
          description: `Automatically loaded your last working runsheet: "${lastRunsheet.name}"`,
        });
      }
    } catch (error) {
      console.error('Error auto-restoring runsheet:', error);
    }
  };

  // Load a saved runsheet
  const loadRunsheet = async (runsheet: any) => {
    console.log('Loading selected runsheet:', runsheet);
    console.log('Runsheet data being loaded:', JSON.stringify(runsheet.data, null, 2));
    setIsLoadingRunsheet(true);
    
    // Load column instructions first before setting columns to avoid false "missing" highlights
    let finalColumnInstructions = {};
    
    try {
      const userPreferences = await ExtractionPreferencesService.getDefaultPreferences();
      
      if (userPreferences && userPreferences.column_instructions) {
        // Use user's saved extraction preferences
        finalColumnInstructions = userPreferences.column_instructions as Record<string, string>;
        console.log('Applied user extraction preferences to runsheet');
      } else if (runsheet.column_instructions) {
        // Fall back to runsheet's embedded column instructions
        finalColumnInstructions = runsheet.column_instructions;
        console.log('Applied runsheet embedded column instructions');
      }
    } catch (error) {
      console.error('Error loading extraction preferences:', error);
      // Fall back to runsheet data on error
      if (runsheet.column_instructions) {
        finalColumnInstructions = runsheet.column_instructions;
      }
    }
    
    // Now set everything together to avoid triggering missing column checks prematurely
    setRunsheetName(runsheet.name);
    console.log('🔧 Debug: Setting runsheet data:', runsheet.data);
    console.log('🔧 Debug: Data length:', runsheet.data?.length);
    console.log('🔧 Debug: First row sample:', runsheet.data?.[0]);
    setData(runsheet.data);
    setColumnInstructions(finalColumnInstructions);
    onColumnInstructionsChange?.(finalColumnInstructions);
    
    // Set columns last, after column instructions are ready
    console.log('🔧 Debug: Setting runsheet columns:', runsheet.columns);
    setColumns(runsheet.columns);
    onColumnChange(runsheet.columns);
    
    setShowOpenDialog(false);
    // Reset column width state for new runsheet
    setColumnWidths({});
    setHasManuallyResizedColumns(false);
    
    // Wait a bit to ensure state updates are complete, then re-enable missing column checks
    setTimeout(() => {
      setIsLoadingRunsheet(false);
    }, 100);
    
    toast({
      title: "Runsheet loaded",
      description: `"${runsheet.name}" has been loaded successfully.`,
    });
  };

  // Load a specific runsheet by ID (for URL parameter functionality)
  const loadSpecificRunsheet = async (runsheetId: string) => {
    // Wait for user authentication to be loaded
    let currentUser = user;
    if (!currentUser) {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        currentUser = session?.user ?? null;
        if (session?.user) {
          setUser(session.user);
        }
      } catch (error) {
        console.error('Error getting session:', error);
      }
    }

    if (!currentUser) {
      toast({
        title: "Authentication required",
        description: "Please sign in to load runsheets.",
        variant: "destructive",
      });
      return;
    }

    try {
      console.log('Loading runsheet with ID:', runsheetId);
      const { data: runsheet, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheetId)
        .eq('user_id', currentUser.id)
        .maybeSingle();
      
      console.log('Supabase query result:', { runsheet, error });

      if (error) {
        console.error('Error loading runsheet:', error);
        toast({
          title: "Error loading runsheet",
          description: "The runsheet could not be found or you don't have access to it.",
          variant: "destructive",
        });
        return;
      }
      
      if (!runsheet) {
        console.error('No runsheet found with ID:', runsheetId);
        toast({
          title: "Runsheet not found",
          description: "The runsheet could not be found or you don't have access to it.",
          variant: "destructive",
        });
        return;
      }

      if (runsheet) {
        console.log('🔧 Debug: Loading runsheet from URL:', runsheet);
        console.log('🔧 Debug: Runsheet ID:', runsheet.id);
        console.log('🔧 Debug: Runsheet name:', runsheet.name);
        console.log('🔧 Debug: Runsheet data length:', Array.isArray(runsheet.data) ? runsheet.data.length : 0);
        console.log('🔧 Debug: Runsheet columns:', runsheet.columns);
        console.log('🔧 Debug: About to call setIsLoadingRunsheet(true)');
        setIsLoadingRunsheet(true);
        console.log('🔧 Debug: About to call loadRunsheet()');
        await loadRunsheet(runsheet);
        console.log('🔧 Debug: loadRunsheet() completed');
      }
    } catch (error: any) {
      console.error('Error loading runsheet:', error);
      toast({
        title: "Error loading runsheet",
        description: "Failed to load the runsheet. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Download spreadsheet only as Excel
  const downloadSpreadsheetOnly = () => {
    // Use all data as displayed (including empty rows) and add document URLs
    const displayData = data.map((row, index) => {
      const orderedRow: Record<string, string> = {};
      // Ensure columns are in the same order as displayed
      columns.forEach(column => {
        orderedRow[column] = row[column] || '';
      });
      
      // Add document URL column if document exists for this row
      const document = documentMap.get(index);
      if (document) {
        const publicUrl = DocumentService.getDocumentUrl(document.file_path);
        orderedRow['Document Link'] = publicUrl;
      } else {
        orderedRow['Document Link'] = '';
      }
      
      return orderedRow;
    });

    // Create columns array with Document Link added after Document File Name
    const downloadColumns = [...columns];
    const docFileNameIndex = downloadColumns.indexOf('Document File Name');
    if (docFileNameIndex !== -1) {
      downloadColumns.splice(docFileNameIndex + 1, 0, 'Document Link');
    } else {
      downloadColumns.push('Document Link');
    }

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(displayData, { header: downloadColumns });
    XLSX.utils.book_append_sheet(wb, ws, 'Runsheet');
    
    XLSX.writeFile(wb, `${runsheetName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.xlsx`);
    
    toast({
      title: "Spreadsheet downloaded",
      description: `"${runsheetName}" has been downloaded as an Excel file with document links.`,
    });
  };

  // Download spreadsheet with attached files as ZIP
  const downloadSpreadsheet = async () => {
    if (!currentRunsheetId || !user) {
      toast({
        title: "Error",
        description: "Please save the runsheet first",
        variant: "destructive",
      });
      return;
    }

    try {
      const zip = new JSZip();
      
      // Create CSV content with exact display format and document links
      const displayData = data.map((row, index) => {
        const orderedRow: Record<string, string> = {};
        // Ensure columns are in the same order as displayed
        columns.forEach(column => {
          orderedRow[column] = row[column] || '';
        });
        
        // Add document URL column if document exists for this row
        const document = documentMap.get(index);
        if (document) {
          const publicUrl = DocumentService.getDocumentUrl(document.file_path);
          orderedRow['Document Link'] = publicUrl;
        } else {
          orderedRow['Document Link'] = '';
        }
        
        return orderedRow;
      });

      // Create columns array with Document Link added after Document File Name
      const downloadColumns = [...columns];
      const docFileNameIndex = downloadColumns.indexOf('Document File Name');
      if (docFileNameIndex !== -1) {
        downloadColumns.splice(docFileNameIndex + 1, 0, 'Document Link');
      } else {
        downloadColumns.push('Document Link');
      }

      const csvHeaders = downloadColumns.join(',');
      const csvRows = displayData.map(row => 
        downloadColumns.map(column => {
          const value = row[column] || '';
          const escapedValue = value.includes(',') || value.includes('"') || value.includes('\n')
            ? `"${value.replace(/"/g, '""')}"`
            : value;
          return escapedValue;
        }).join(',')
      );
      
      const csvContent = [csvHeaders, ...csvRows].join('\n');
      zip.file(`${runsheetName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`, csvContent);

      // Add documents from storage to ZIP
      const documentsFolder = zip.folder("documents");
      
      for (const [rowIndex, document] of documentMap) {
        try {
          const { data: fileData } = await supabase.storage
            .from('documents')
            .download(document.file_path);
          
          if (fileData) {
            const filename = `Row_${rowIndex + 1}_${document.original_filename}`;
            documentsFolder?.file(filename, fileData);
          }
        } catch (error) {
          console.error(`Error downloading document for row ${rowIndex}:`, error);
        }
      }

      // Generate and download ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(zipBlob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', `${runsheetName.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_with_documents.zip`);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download complete",
        description: `Runsheet and ${documentMap.size} documents downloaded as ZIP.`,
      });
      
    } catch (error) {
      console.error('Error creating download package:', error);
      toast({
        title: "Download failed",
        description: "Failed to create download package",
        variant: "destructive",
      });
    }
  };

  // Show upload warning dialog
  const handleUploadClick = () => {
    setShowUploadWarningDialog(true);
  };

  // Proceed with actual upload after confirmation
  const proceedWithUpload = () => {
    setShowUploadWarningDialog(false);
    performUpload();
  };

  // Handle file upload logic
  const handleFileUpload = (file: File, fileName: string) => {
    console.log('Processing file:', { name: file.name, type: file.type, fileName });
    
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const mimeType = file.type;
    
    // Determine file type based on both extension and MIME type
    const isCSV = fileExtension === 'csv' || mimeType === 'text/csv';
    const isExcel = fileExtension === 'xlsx' || fileExtension === 'xls' || 
                    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
                    mimeType === 'application/vnd.ms-excel' ||
                    mimeType === 'application/vnd.google-apps.spreadsheet';
    
    if (isCSV) {
      console.log('Processing as CSV file');
      handleCSVUpload(file, fileName);
    } else if (isExcel) {
      console.log('Processing as Excel file');
      handleExcelUpload(file, fileName);
    } else {
      console.log('Unsupported file type:', { fileExtension, mimeType });
      toast({
        title: "Unsupported file type",
        description: "Please upload a CSV (.csv) or Excel (.xlsx, .xls) file.",
        variant: "destructive",
      });
    }
  };

  // Handle CSV file upload
  const handleCSVUpload = (file: File, fileName: string) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const rows = content.split('\n');
        const headers = rows[0].split(',').map(h => h.trim().replace(/"/g, ''));
        
        const parsedData = rows.slice(1)
          .filter(row => row.trim())
          .map(row => {
            const values = row.split(',').map(v => v.trim().replace(/"/g, ''));
            const rowData: Record<string, string> = {};
            headers.forEach((header, index) => {
              rowData[header] = values[index] || '';
            });
            return rowData;
          });

        updateSpreadsheetData(headers, parsedData, fileName);
      } catch (error) {
        console.error('Error parsing CSV:', error);
        toast({
          title: "Error parsing CSV",
          description: "The CSV file could not be parsed. Please check the file format.",
          variant: "destructive",
        });
      }
    };
    reader.readAsText(file);
  };

  // Handle Excel file upload
  const handleExcelUpload = (file: File, fileName: string) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) {
          toast({
            title: "Empty spreadsheet",
            description: "The Excel file appears to be empty.",
            variant: "destructive",
          });
          return;
        }

        const headers = (jsonData[0] as string[]).map(h => h?.toString() || '');
        const parsedData = jsonData.slice(1).map((row: any) => {
          const rowData: Record<string, string> = {};
          headers.forEach((header, index) => {
            rowData[header] = (row[index] || '').toString();
          });
          return rowData;
        });

        updateSpreadsheetData(headers, parsedData, fileName);
      } catch (error) {
        console.error('Error parsing Excel file:', error);
        toast({
          title: "Error parsing Excel file",
          description: "The Excel file could not be parsed. Please check the file format.",
          variant: "destructive",
        });
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // Actual upload function - can accept File object directly or trigger file picker
  const performUpload = (file?: File, fileName?: string) => {
    if (file && fileName) {
      // Direct file upload (from Google Drive or other sources)
      handleFileUpload(file, fileName);
      return;
    }

    // Traditional file picker
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.csv,.xlsx,.xls';
    input.style.visibility = 'hidden';
    
    input.onchange = (event) => {
      const file = (event.target as HTMLInputElement).files?.[0];
      if (!file) return;
      
      const fileExtension = file.name.split('.').pop()?.toLowerCase();
      
      if (fileExtension === 'csv') {
        // Handle CSV files
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const csvContent = e.target?.result as string;
            if (!csvContent) {
              toast({
                title: "Error reading file",
                description: "The file appears to be empty or corrupted.",
                variant: "destructive",
              });
              return;
            }

            // Parse CSV content
            const lines = csvContent.split('\n').filter(line => line.trim() !== '');
            if (lines.length === 0) {
              toast({
                title: "Empty file",
                description: "The CSV file is empty.",
                variant: "destructive",
              });
              return;
            }

            // Parse headers
            const headers = lines[0].split(',').map(header => 
              header.trim().replace(/^["']|["']$/g, '') // Remove surrounding quotes
            );

            // Parse data rows
            const csvData = lines.slice(1).map(line => {
              const values = [];
              let current = '';
              let inQuotes = false;
              
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                
                if (char === '"' && (i === 0 || line[i-1] === ',')) {
                  inQuotes = true;
                } else if (char === '"' && inQuotes && (i === line.length - 1 || line[i+1] === ',')) {
                  inQuotes = false;
                } else if (char === ',' && !inQuotes) {
                  values.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              values.push(current.trim()); // Add the last value

              // Create row object
              const row: Record<string, string> = {};
              headers.forEach((header, index) => {
                row[header] = values[index] || '';
              });
              return row;
            });

            updateSpreadsheetData(headers, csvData, file.name);

          } catch (error) {
            console.error('Error parsing CSV:', error);
            toast({
              title: "Error parsing file",
              description: "There was an error parsing the CSV file. Please check the format.",
              variant: "destructive",
            });
          }
        };
        
        reader.readAsText(file);
        
      } else if (fileExtension === 'xlsx' || fileExtension === 'xls') {
        // Handle Excel files
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            
            // Get the first worksheet
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];
            
            // Convert to JSON
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            
            if (jsonData.length === 0) {
              toast({
                title: "Empty file",
                description: "The Excel file is empty.",
                variant: "destructive",
              });
              return;
            }
            
            // Get headers from first row
            const headers = jsonData[0].map((header: any) => String(header || '').trim()).filter(h => h);
            
            if (headers.length === 0) {
              toast({
                title: "No headers found",
                description: "The Excel file doesn't contain valid column headers.",
                variant: "destructive",
              });
              return;
            }
            
            // Parse data rows
            const excelData = jsonData.slice(1)
              .filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''))
              .map(row => {
                const rowData: Record<string, string> = {};
                headers.forEach((header, index) => {
                  const cellValue = row[index];
                  rowData[header] = cellValue !== null && cellValue !== undefined ? String(cellValue) : '';
                });
                return rowData;
              });

            updateSpreadsheetData(headers, excelData, file.name);

          } catch (error) {
            console.error('Error parsing Excel:', error);
            toast({
              title: "Error parsing file",
              description: "There was an error parsing the Excel file. Please check the format.",
              variant: "destructive",
            });
          }
        };
        
        reader.readAsArrayBuffer(file);
      } else {
        toast({
          title: "Unsupported file type",
          description: "Please upload a CSV (.csv) or Excel (.xlsx, .xls) file.",
          variant: "destructive",
        });
      }
    };
    
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  };

  // Helper function to update spreadsheet data
  const updateSpreadsheetData = (headers: string[], parsedData: Record<string, string>[], fileName: string) => {
    // Document File Name column is no longer automatically added - users can toggle it if needed
    let finalHeaders = [...headers];
    
    // Update parsed data - ensure all data has Document File Name field for background storage
    const updatedParsedData = parsedData.map(row => {
      const newRow = { ...row };
      if (!newRow['Document File Name']) {
        newRow['Document File Name'] = ''; // Initialize with empty string for background storage
      }
      return newRow;
    });
    
    // Add empty rows to reach minimum of 20 rows
    const minRows = 20;
    const emptyRows = Array.from({ length: Math.max(0, minRows - updatedParsedData.length) }, () => {
      const row: Record<string, string> = {};
      finalHeaders.forEach(col => row[col] = '');
      row['Document File Name'] = ''; // Always include for background storage
      return row;
    });

    const newData = [...updatedParsedData, ...emptyRows];

    // Update spreadsheet
    setColumns(finalHeaders);
    onColumnChange(finalHeaders);
    setData(newData);
    
    // Update parent component's data
    if (onDataChange) {
      onDataChange(updatedParsedData); // Only pass the actual data, not the empty rows
    }
    
    // Update runsheet name based on filename
    const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    setRunsheetName(fileNameWithoutExt || 'Imported Runsheet');

    // Auto-save the runsheet with imported data
    setTimeout(() => {
      autoSaveRunsheet(); // Auto-save with the imported data
    }, 100); // Small delay to ensure state updates are complete

    toast({
      title: "Spreadsheet uploaded",
      description: `Successfully imported ${updatedParsedData.length} rows with ${finalHeaders.length} columns from ${fileName}.`,
    });
  };

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editingCell && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.select();
    }
  }, [editingCell]);

  // Column dialog functions
  const generateExtractionSuggestion = (columnName: string): string => {
    const name = columnName.toLowerCase();
    
    const suggestions: Record<string, string> = {
      'grantor': "Extract the Grantor's name as it appears on the document and include the address if there is one",
      'grantee': "Extract the Grantee's name as it appears on the document and include the address if there is one",
      'inst number': "Extract the instrument number exactly as it appears on the document",
      'instrument number': "Extract the instrument number exactly as it appears on the document",
      'book': "Extract the book number from the book/page reference",
      'page': "Extract the page number from the book/page reference",
      'book/page': "Extract the complete book and page reference (e.g., Book 123, Page 456)",
      'inst type': "Extract the type of instrument (e.g., Deed, Mortgage, Lien, etc.)",
      'instrument type': "Extract the type of instrument (e.g., Deed, Mortgage, Lien, etc.)",
      'recording date': "Extract the date when the document was recorded at the courthouse",
      'record date': "Extract the date when the document was recorded at the courthouse",
      'document date': "Extract the date the document was signed or executed",
      'execution date': "Extract the date the document was signed or executed",
      'legal description': "Extract the complete legal description of the property including lot, block, subdivision, and metes and bounds if present",
      'property description': "Extract the complete legal description of the property including lot, block, subdivision, and metes and bounds if present",
      'notes': "Extract any additional relevant information, special conditions, or remarks",
      'comments': "Extract any additional relevant information, special conditions, or remarks",
      'consideration': "Extract the purchase price or consideration amount",
      'amount': "Extract any monetary amount mentioned in the document",
      'price': "Extract the purchase price or sale amount",
      'acres': "Extract the acreage or land area measurements",
      'lot': "Extract the lot number from the legal description",
      'block': "Extract the block number from the legal description",
      'subdivision': "Extract the subdivision name from the legal description",
      'county': "Extract the county where the property is located",
      'state': "Extract the state where the property is located",
      'address': "Extract the street address or property address",
      'notary': "Extract the notary public information including name and commission details",
      'witness': "Extract witness names and signatures",
      'mortgage company': "Extract the mortgage lender or financial institution name",
      'lender': "Extract the lending institution or mortgage company name",
      'borrower': "Extract the borrower's name and details",
      'loan amount': "Extract the loan or mortgage amount",
      'interest rate': "Extract the interest rate percentage",
      'term': "Extract the loan term or duration",
      'maturity date': "Extract the loan maturity or due date"
    };
    
    // Find exact match first
    if (suggestions[name]) {
      return suggestions[name];
    }
    
    // Find partial matches
    for (const [key, suggestion] of Object.entries(suggestions)) {
      if (name.includes(key) || key.includes(name)) {
        return suggestion;
      }
    }
    
    // Default suggestion
    return `Extract the ${columnName} information exactly as it appears on the document`;
  };

  const openColumnDialog = (column: string) => {
    console.log('🔧 EditableSpreadsheet: openColumnDialog called for column:', column);
    
    // If this is the "Document File Name" column, show naming settings instead
    if (column === 'Document File Name') {
      console.log('🔧 EditableSpreadsheet: Opening naming settings dialog');
      setShowNamingSettings(true);
      return;
    }
    
    setSelectedColumn(column);
    setEditingColumnName(column);
    
    // Generate suggestion if no existing instructions
    const existingInstructions = columnInstructions[column] || '';
    const suggestion = existingInstructions || generateExtractionSuggestion(column);
    setEditingColumnInstructions(suggestion);
    
    // Set current alignment or default to left
    setEditingColumnAlignment(columnAlignments[column] || 'left');
    
    setShowColumnDialog(true);
  };

  const saveColumnChanges = () => {
    const trimmedName = editingColumnName.trim();
    if (!trimmedName) return;

    // Update column name if changed
    if (trimmedName !== selectedColumn) {
      const newColumns = columns.map(col => col === selectedColumn ? trimmedName : col);
      setColumns(newColumns);
      onColumnChange(newColumns);
      
      // Update data keys to match new column name
      const newData = data.map(row => {
        const newRow = { ...row };
        if (selectedColumn in newRow) {
          newRow[trimmedName] = newRow[selectedColumn];
          delete newRow[selectedColumn];
        }
        return newRow;
      });
      setData(newData);

      // Update column instructions with new name
      const newInstructions = { ...columnInstructions };
      if (selectedColumn in newInstructions) {
        newInstructions[trimmedName] = newInstructions[selectedColumn];
        delete newInstructions[selectedColumn];
      }
      newInstructions[trimmedName] = editingColumnInstructions;
      setColumnInstructions(newInstructions);
      onColumnInstructionsChange?.(newInstructions);

      // Update column alignments with new name
      const newAlignments = { ...columnAlignments };
      if (selectedColumn in newAlignments) {
        newAlignments[trimmedName] = newAlignments[selectedColumn];
        delete newAlignments[selectedColumn];
      }
      newAlignments[trimmedName] = editingColumnAlignment;
      setColumnAlignments(newAlignments);
    } else {
      // Just update instructions and alignment
      const newInstructions = {
        ...columnInstructions,
        [selectedColumn]: editingColumnInstructions
      };
      setColumnInstructions(newInstructions);
      onColumnInstructionsChange?.(newInstructions);

      const newAlignments = {
        ...columnAlignments,
        [selectedColumn]: editingColumnAlignment
      };
      setColumnAlignments(newAlignments);
    }

    setShowColumnDialog(false);
  };

  // Auto-start editing when a cell is selected and user types
  useEffect(() => {
    if (selectedCell && !editingCell) {
      const handleGlobalKeyDown = (e: KeyboardEvent) => {
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          startEditing(selectedCell.rowIndex, selectedCell.column, e.key);
          e.preventDefault();
        }
      };
      
      document.addEventListener('keydown', handleGlobalKeyDown);
      return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [selectedCell, editingCell]);

  // Column resizing functions
  const getColumnWidth = (column: string) => {
    return columnWidths[column] || 120; // default width
  };

  // Row resizing functions
  const getRowHeight = (rowIndex: number) => {
    return rowHeights[rowIndex] || 60; // default height
  };

  // Calculate total table width
  const getTotalTableWidth = () => {
    const dataColumnsWidth = columns.reduce((total, column) => total + getColumnWidth(column), 0);
    const documentFileNameWidth = showDocumentFileNameColumn ? 200 : 0;
    const actionsColumnWidth = 200; // Fixed width for actions column
    return dataColumnsWidth + documentFileNameWidth + actionsColumnWidth;
  };

  // Column resize handlers
  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = getColumnWidth(column);
    setResizing({ column, startX, startWidth });
  };

  // Row resize handlers
  const handleRowMouseDown = (e: React.MouseEvent, rowIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startHeight = getRowHeight(rowIndex);
    setResizingRow({ rowIndex, startY, startHeight });
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizing) {
        const deltaX = e.clientX - resizing.startX;
        const newWidth = Math.max(80, resizing.startWidth + deltaX);
        setColumnWidths(prev => ({
          ...prev,
          [resizing.column]: newWidth
        }));
        setHasManuallyResizedColumns(true);
      }
      
      if (resizingRow) {
        const deltaY = e.clientY - resizingRow.startY;
        const newHeight = Math.max(40, resizingRow.startHeight + deltaY);
        setRowHeights(prev => ({
          ...prev,
          [resizingRow.rowIndex]: newHeight
        }));
      }
    };

    const handleMouseUp = () => {
      setResizing(null);
      setResizingRow(null);
    };

    if (resizing || resizingRow) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizing, resizingRow]);


  // Runsheet name editing functions
  const startEditingRunsheetName = () => {
    setEditingRunsheetName(true);
    setTempRunsheetName(runsheetName);
  };

  const saveRunsheetNameEdit = () => {
    if (tempRunsheetName.trim()) {
      setRunsheetName(tempRunsheetName.trim());
    }
    setEditingRunsheetName(false);
    setTempRunsheetName('');
  };

  const cancelRunsheetNameEdit = () => {
    setEditingRunsheetName(false);
    setTempRunsheetName('');
  };

  // Column management
  const insertColumnBefore = (columnName: string) => {
    const newColumnName = prompt("Enter new column name");
    if (newColumnName && !columns.includes(newColumnName)) {
      const columnIndex = columns.indexOf(columnName);
      const updatedColumns = [
        ...columns.slice(0, columnIndex),
        newColumnName,
        ...columns.slice(columnIndex)
      ];
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Add the new column to all data rows
      const updatedData = data.map(row => {
        const newRow = { ...row };
        // Reorder the object to maintain column order
        return updatedColumns.reduce((acc, col) => {
          acc[col] = newRow[col] || '';
          return acc;
        }, {} as Record<string, string>);
      });
      setData(updatedData);
    }
  };

  const insertColumnAfter = (columnName: string) => {
    const newColumnName = prompt("Enter new column name");
    if (newColumnName && !columns.includes(newColumnName)) {
      const columnIndex = columns.indexOf(columnName);
      const updatedColumns = [
        ...columns.slice(0, columnIndex + 1),
        newColumnName,
        ...columns.slice(columnIndex + 1)
      ];
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Add the new column to all data rows
      const updatedData = data.map(row => {
        const newRow = { ...row };
        // Reorder the object to maintain column order
        return updatedColumns.reduce((acc, col) => {
          acc[col] = newRow[col] || '';
          return acc;
        }, {} as Record<string, string>);
      });
      setData(updatedData);
    }
  };

  const removeColumn = (columnToRemove: string) => {
    if (columns.length > 1) {
      const updatedColumns = columns.filter(col => col !== columnToRemove);
      setColumns(updatedColumns);
      onColumnChange(updatedColumns);
      
      // Remove data for this column
      const updatedData = data.map(row => {
        const newRow = {...row};
        delete newRow[columnToRemove];
        return newRow;
      });
      setData(updatedData);
    }
  };

  // Column drag and drop functions
  const handleDragStart = (e: React.DragEvent, column: string) => {
    setDraggedColumn(column);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', column);
  };

  const handleDragOver = (e: React.DragEvent, column: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverColumn(column);
  };

  const handleDragLeave = () => {
    setDragOverColumn(null);
  };

  const handleDrop = (e: React.DragEvent, targetColumn: string) => {
    e.preventDefault();
    
    if (draggedColumn && draggedColumn !== targetColumn) {
      const draggedIndex = columns.indexOf(draggedColumn);
      const targetIndex = columns.indexOf(targetColumn);
      
      // Create new column order
      const newColumns = [...columns];
      newColumns.splice(draggedIndex, 1);
      newColumns.splice(targetIndex, 0, draggedColumn);
      
      setColumns(newColumns);
      onColumnChange(newColumns);
      
      // Reorder data to match new column order
      const updatedData = data.map(row => {
        return newColumns.reduce((acc, col) => {
          acc[col] = row[col] || '';
          return acc;
        }, {} as Record<string, string>);
      });
      setData(updatedData);
    }
    
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  const handleDragEnd = () => {
    setDraggedColumn(null);
    setDragOverColumn(null);
  };

  // Cell editing functions
  const selectCell = (rowIndex: number, column: string, shouldStartEditing: boolean = true) => {
    // Save any current editing before switching cells
    if (editingCell) {
      const newData = [...data];
      newData[editingCell.rowIndex] = {
        ...newData[editingCell.rowIndex],
        [editingCell.column]: cellValue
      };
      setData(newData);
      onDataChange?.(newData);
    }
    
    setSelectedCell({ rowIndex, column });
    // Clear range selection when selecting a single cell
    setSelectedRange(null);
    
    // Scroll the selected cell into view after layout updates
    setTimeout(() => {
      const cellElement = document.querySelector(`[data-cell="${rowIndex}-${column}"]`);
      if (cellElement) {
        // Force layout recalculation before scrolling
        cellElement.getBoundingClientRect();
        cellElement.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest'
        });
      }
    }, 100); // Increased delay to allow for layout updates
    
    // Start editing immediately like Excel
    if (shouldStartEditing) {
      startEditing(rowIndex, column, data[rowIndex]?.[column] || '');
    }
  };

  const handleCellDoubleClick = (rowIndex: number, column: string) => {
    // Double click should select all text in the cell
    startEditing(rowIndex, column, data[rowIndex]?.[column] || '');
    // Focus and select all text after the textarea is rendered
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        textareaRef.current.select();
      }
    }, 10);
  };

  const startEditing = useCallback((rowIndex: number, column: string, value: string) => {
    setEditingCell({ rowIndex, column });
    setCellValue(value);
    setSelectedCell({ rowIndex, column });
    
    // Focus the textarea after it's rendered
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        // Position cursor at the end of the text
        const length = textareaRef.current.value.length;
        textareaRef.current.setSelectionRange(length, length);
      }
    }, 10);
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingCell) {
      const newData = [...data];
      newData[editingCell.rowIndex] = {
        ...newData[editingCell.rowIndex],
        [editingCell.column]: cellValue
      };
      setData(newData);
      onDataChange?.(newData);
      
      // Trigger document filename updates if data changed and we have a runsheet ID
      if (currentRunsheetId && user) {
        // Debounced document update - wait a moment to avoid too many calls
        setTimeout(() => {
          DocumentService.updateDocumentFilenames(currentRunsheetId, newData);
        }, 2000);
      }
      
      setEditingCell(null);
    }
  }, [editingCell, cellValue, data, onDataChange, currentRunsheetId, user]);

  const cancelEdit = useCallback(() => {
    setEditingCell(null);
    setCellValue('');
  }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, column: string) => {
    const columnIndex = columns.indexOf(column);
    
    switch (e.key) {
      case 'Enter':
        if (editingCell) {
          // Capture the current editing cell info before saving (since saveEdit will clear editingCell)
          const currentRowIndex = editingCell.rowIndex;
          const currentColumn = editingCell.column;
          
          saveEdit();
          
          // Move to the next row in the same column (Excel-like behavior)
          const nextRowIndex = currentRowIndex + 1;
          if (nextRowIndex < data.length) {
            setTimeout(() => {
              selectCell(nextRowIndex, currentColumn);
            }, 0);
          }
        } else {
          startEditing(rowIndex, column, data[rowIndex]?.[column] || '');
        }
        e.preventDefault();
        break;
        
      case 'Escape':
        if (editingCell) {
          cancelEdit();
        }
        e.preventDefault();
        break;
        
      case 'Tab':
        e.preventDefault();
        if (editingCell) {
          saveEdit();
        }
        
        let nextColumnIndex = e.shiftKey ? columnIndex - 1 : columnIndex + 1;
        let nextRowIndex = rowIndex;
        
        // Handle wrapping to next/previous row
        if (nextColumnIndex >= columns.length) {
          nextColumnIndex = 0;
          nextRowIndex = Math.min(rowIndex + 1, data.length - 1);
        } else if (nextColumnIndex < 0) {
          nextColumnIndex = columns.length - 1;
          nextRowIndex = Math.max(rowIndex - 1, 0);
        }
        
        // Skip Document File Name column
        while (nextColumnIndex >= 0 && nextColumnIndex < columns.length && columns[nextColumnIndex] === 'Document File Name') {
          if (e.shiftKey) {
            nextColumnIndex--;
            if (nextColumnIndex < 0) {
              nextColumnIndex = columns.length - 1;
              nextRowIndex = Math.max(nextRowIndex - 1, 0);
            }
          } else {
            nextColumnIndex++;
            if (nextColumnIndex >= columns.length) {
              nextColumnIndex = 0;
              nextRowIndex = Math.min(nextRowIndex + 1, data.length - 1);
            }
          }
        }
        
        const nextColumn = columns[nextColumnIndex];
        
        if (nextColumn && nextRowIndex >= 0 && nextRowIndex < data.length) {
          selectCell(nextRowIndex, nextColumn);
          // Auto-start editing the next cell
          setTimeout(() => {
            startEditing(nextRowIndex, nextColumn, data[nextRowIndex]?.[nextColumn] || '');
          }, 0);
        }
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        if (editingCell) return;
        if (rowIndex > 0) {
          selectCell(rowIndex - 1, column);
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (editingCell) return;
        if (rowIndex < data.length - 1) {
          selectCell(rowIndex + 1, column);
        }
        break;
        
      case 'ArrowLeft':
        e.preventDefault();
        if (editingCell) return;
        if (columnIndex > 0) {
          let newColumnIndex = columnIndex - 1;
          // Skip Document File Name column
          while (newColumnIndex >= 0 && columns[newColumnIndex] === 'Document File Name') {
            newColumnIndex--;
          }
          if (newColumnIndex >= 0) {
            selectCell(rowIndex, columns[newColumnIndex]);
          }
        }
        break;
        
      case 'ArrowRight':
        e.preventDefault();
        if (editingCell) return;
        if (columnIndex < columns.length - 1) {
          let newColumnIndex = columnIndex + 1;
          // Skip Document File Name column
          while (newColumnIndex < columns.length && columns[newColumnIndex] === 'Document File Name') {
            newColumnIndex++;
          }
          if (newColumnIndex < columns.length) {
            selectCell(rowIndex, columns[newColumnIndex]);
          }
        }
        break;
        
      case 'Delete':
      case 'Backspace':
        if (!editingCell && selectedCell?.rowIndex === rowIndex && selectedCell?.column === column) {
          const newData = [...data];
          newData[rowIndex] = {
            ...newData[rowIndex],
            [column]: ''
          };
          setData(newData);
          e.preventDefault();
        }
        break;
        
      default:
        if (!editingCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          startEditing(rowIndex, column, e.key);
          e.preventDefault();
        }
        break;
    }
  }, [columns, data, editingCell, selectedCell, saveEdit, cancelEdit, startEditing]);

  // Handle input key events during editing
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
      // Capture the current editing cell info before saving (since saveEdit will clear editingCell)
      if (editingCell) {
        const currentRowIndex = editingCell.rowIndex;
        const currentColumn = editingCell.column;
        
        saveEdit();
        
        // Move to the next row in the same column (Excel-like behavior)
        const nextRowIndex = currentRowIndex + 1;
        if (nextRowIndex < data.length) {
          setTimeout(() => {
            selectCell(nextRowIndex, currentColumn);
          }, 0);
        }
      }
      e.preventDefault();
    } else if (e.key === 'Enter' && e.altKey) {
      // Alt+Enter creates line break - allow default behavior
      return;
    } else if (e.key === 'Escape') {
      cancelEdit();
      e.preventDefault();
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
      // Handle arrow keys while editing (Excel-like behavior)
      if (editingCell) {
        const currentRowIndex = editingCell.rowIndex;
        const currentColumn = editingCell.column;
        const columnIndex = columns.indexOf(currentColumn);
        
        saveEdit();
        
        let nextRowIndex = currentRowIndex;
        let nextColumn = currentColumn;
        
        switch (e.key) {
          case 'ArrowUp':
            nextRowIndex = Math.max(0, currentRowIndex - 1);
            break;
          case 'ArrowDown':
            nextRowIndex = Math.min(data.length - 1, currentRowIndex + 1);
            break;
          case 'ArrowLeft':
            if (columnIndex > 0) {
              nextColumn = columns[columnIndex - 1];
            }
            break;
          case 'ArrowRight':
            if (columnIndex < columns.length - 1) {
              nextColumn = columns[columnIndex + 1];
            }
            break;
        }
        
        setTimeout(() => {
          selectCell(nextRowIndex, nextColumn);
        }, 0);
      }
      e.preventDefault();
    } else if (e.key === 'Tab') {
      e.preventDefault();
      saveEdit();
      
      if (editingCell) {
        const columnIndex = columns.indexOf(editingCell.column);
        const nextColumnIndex = e.shiftKey ? columnIndex - 1 : columnIndex + 1;
        let nextRowIndex = editingCell.rowIndex;
        let nextColumn = columns[nextColumnIndex];
        
        if (nextColumnIndex >= columns.length) {
          nextColumn = columns[0];
          nextRowIndex = Math.min(editingCell.rowIndex + 1, data.length - 1);
        } else if (nextColumnIndex < 0) {
          nextColumn = columns[columns.length - 1];
          nextRowIndex = Math.max(editingCell.rowIndex - 1, 0);
        }
        
        if (nextColumn && nextRowIndex >= 0 && nextRowIndex < data.length) {
          setTimeout(() => {
            selectCell(nextRowIndex, nextColumn);
            startEditing(nextRowIndex, nextColumn, data[nextRowIndex]?.[nextColumn] || '');
          }, 0);
        }
      }
    }
  }, [saveEdit, cancelEdit, editingCell, columns, data, selectCell, startEditing]);

  // Mouse drag selection handlers
  const handleCellMouseDown = useCallback((e: React.MouseEvent, rowIndex: number, column: string) => {
    if (e.button !== 0) return; // Only handle left click
    
    const columnIndex = columns.indexOf(column);
    setIsDragging(true);
    setSelectedRange({
      start: { rowIndex, columnIndex },
      end: { rowIndex, columnIndex }
    });
    setSelectedCell({ rowIndex, column });
    e.preventDefault();
  }, [columns]);

  const handleMouseEnter = useCallback((rowIndex: number, column: string) => {
    if (!isDragging || !selectedRange) return;
    
    const columnIndex = columns.indexOf(column);
    setSelectedRange(prev => prev ? {
      ...prev,
      end: { rowIndex, columnIndex }
    } : null);
  }, [isDragging, selectedRange, columns]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Copy/Paste functionality
  const copySelection = useCallback(() => {
    if (!selectedRange) return;
    
    const { start, end } = selectedRange;
    const minRow = Math.min(start.rowIndex, end.rowIndex);
    const maxRow = Math.max(start.rowIndex, end.rowIndex);
    const minCol = Math.min(start.columnIndex, end.columnIndex);
    const maxCol = Math.max(start.columnIndex, end.columnIndex);
    
    const copiedData: string[][] = [];
    for (let row = minRow; row <= maxRow; row++) {
      const rowData: string[] = [];
      for (let col = minCol; col <= maxCol; col++) {
        const column = columns[col];
        rowData.push(data[row]?.[column] || '');
      }
      copiedData.push(rowData);
    }
    
    setCopiedData(copiedData);
    
    // Also copy to clipboard as tab-separated values
    const clipboardText = copiedData.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(clipboardText);
    
    toast({
      title: "Copied",
      description: `${copiedData.length} rows × ${copiedData[0]?.length || 0} columns copied to clipboard`,
    });
  }, [selectedRange, columns, data, toast]);

  const pasteSelection = useCallback(async () => {
    if (!selectedCell) return;
    
    let dataToPaste: string[][] = [];
    
    // Try to get data from internal copy first, then from clipboard
    if (copiedData) {
      dataToPaste = copiedData;
    } else {
      try {
        const clipboardText = await navigator.clipboard.readText();
        if (clipboardText) {
          dataToPaste = clipboardText.split('\n').map(row => row.split('\t'));
        }
      } catch (error) {
        console.warn('Failed to read clipboard:', error);
        return;
      }
    }
    
    if (dataToPaste.length === 0) return;
    
    const { rowIndex: startRow, column: startColumn } = selectedCell;
    const startColIndex = columns.indexOf(startColumn);
    
    const newData = [...data];
    
    for (let row = 0; row < dataToPaste.length; row++) {
      const targetRowIndex = startRow + row;
      if (targetRowIndex >= newData.length) break;
      
      for (let col = 0; col < dataToPaste[row].length; col++) {
        const targetColIndex = startColIndex + col;
        if (targetColIndex >= columns.length) break;
        
        const targetColumn = columns[targetColIndex];
        newData[targetRowIndex] = {
          ...newData[targetRowIndex],
          [targetColumn]: dataToPaste[row][col]
        };
      }
    }
    
    setData(newData);
    onDataChange?.(newData);
    
    toast({
      title: "Pasted",
      description: `${dataToPaste.length} rows × ${dataToPaste[0]?.length || 0} columns pasted`,
    });
  }, [copiedData, selectedCell, columns, data, onDataChange, toast]);

  // Check if a cell is in the selected range
  const isCellInRange = useCallback((rowIndex: number, columnIndex: number) => {
    if (!selectedRange) return false;
    
    const { start, end } = selectedRange;
    const minRow = Math.min(start.rowIndex, end.rowIndex);
    const maxRow = Math.max(start.rowIndex, end.rowIndex);
    const minCol = Math.min(start.columnIndex, end.columnIndex);
    const maxCol = Math.max(start.columnIndex, end.columnIndex);
    
    return rowIndex >= minRow && rowIndex <= maxRow && columnIndex >= minCol && columnIndex <= maxCol;
  }, [selectedRange]);

  // Global mouse up event listener
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    document.addEventListener('mouseup', handleGlobalMouseUp);
    return () => document.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  // Keyboard shortcuts for copy/paste
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
        copySelection();
        e.preventDefault();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
        pasteSelection();
        e.preventDefault();
      }
    };
    
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [copySelection, pasteSelection]);

  const deleteRow = (index: number) => {
    const newData = [...data];
    newData.splice(index, 1);
    setData(newData);
  };

  // Add rows function
  const addRows = () => {
    const newRows = Array.from({ length: rowsToAdd }, () => {
      const row: Record<string, string> = {};
      columns.forEach(col => row[col] = '');
      return row;
    });
    setData(prev => [...prev, ...newRows]);
    setShowAddRowsDialog(false);
    setRowsToAdd(1);
  };

  const analyzeDocumentAndPopulateRow = async (file: File, targetRowIndex: number) => {
    try {
      console.log('🔍 Starting document analysis for:', file.name, 'type:', file.type, 'size:', file.size);
      
      // Get extraction preferences
      const extractionPrefs = await ExtractionPreferencesService.getDefaultPreferences();
      const extractionFields = extractionPrefs?.columns?.map(col => `${col}: ${extractionPrefs.column_instructions?.[col] || 'Extract this field'}`).join('\n') || 
        columns.filter(col => col !== 'Document File Name').map(col => `${col}: Extract this field`).join('\n');

      let imageData: string;

      // If file has no type or is generic, try to determine from file extension
      if (!file.type || file.type === 'application/octet-stream') {
        console.log('🔧 File has no/generic MIME type, checking if it exists in storage...');
        
        // Try to get the document from storage first
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not authenticated');

        const { data: document } = await supabase
          .from('documents')
          .select('file_path')
          .eq('runsheet_id', currentRunsheetId)
          .eq('row_index', targetRowIndex)
          .eq('user_id', user.id)
          .single();

        if (document?.file_path) {
          console.log('🔧 Document found in storage, downloading...');
          // Download the file from storage
          const { data: fileData, error } = await supabase.storage
            .from('documents')
            .download(document.file_path);

          if (error) {
            console.error('Error downloading file from storage:', error);
            throw new Error('Failed to download file from storage');
          }

          // Determine MIME type from file extension
          const extension = file.name.split('.').pop()?.toLowerCase();
          let mimeType = 'image/png'; // default
          
          switch (extension) {
            case 'jpg':
            case 'jpeg':
              mimeType = 'image/jpeg';
              break;
            case 'png':
              mimeType = 'image/png';
              break;
            case 'gif':
              mimeType = 'image/gif';
              break;
            case 'webp':
              mimeType = 'image/webp';
              break;
          }

          console.log('🔧 Using MIME type:', mimeType, 'for extension:', extension);

          // Create a new File object with the correct MIME type and actual data
          const correctedFile = new File([fileData], file.name, { type: mimeType });
          
          // Convert to base64 data URL
          const reader = new FileReader();
          const dataUrlPromise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              console.log('🔧 Generated data URL prefix:', result.substring(0, 50) + '...');
              resolve(result);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(correctedFile);
          imageData = await dataUrlPromise;
        } else {
          // Document not in storage yet, treat as a new file upload
          console.log('🔧 Document not in storage, treating as new file upload');
          
          // Determine MIME type from file extension for new files
          const extension = file.name.split('.').pop()?.toLowerCase();
          let mimeType = 'image/png'; // default
          
          switch (extension) {
            case 'jpg':
            case 'jpeg':
              mimeType = 'image/jpeg';
              break;
            case 'png':
              mimeType = 'image/png';
              break;
            case 'gif':
              mimeType = 'image/gif';
              break;
            case 'webp':
              mimeType = 'image/webp';
              break;
          }

          console.log('🔧 Using MIME type:', mimeType, 'for new file extension:', extension);

          // Create a new File object with the correct MIME type
          const correctedFile = new File([file], file.name, { type: mimeType });
          
          // Convert to base64 data URL
          const reader = new FileReader();
          const dataUrlPromise = new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = reader.result as string;
              console.log('🔧 Generated data URL prefix for new file:', result.substring(0, 50) + '...');
              resolve(result);
            };
            reader.onerror = reject;
          });
          reader.readAsDataURL(correctedFile);
          imageData = await dataUrlPromise;
        }
      } else {
        console.log('🔧 File has valid MIME type:', file.type);
        // Convert file to base64 data URL normally
        const reader = new FileReader();
        const dataUrlPromise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            console.log('🔧 Generated data URL prefix:', result.substring(0, 50) + '...');
            resolve(result);
          };
          reader.onerror = reject;
        });
        reader.readAsDataURL(file);
        imageData = await dataUrlPromise;
      }

      // Call analyze-document edge function
      const response = await fetch('https://xnpmrafjjqsissbtempj.supabase.co/functions/v1/analyze-document', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imageData,
          prompt: `Analyze this document and extract the following information. 

IMPORTANT INSTRUCTIONS:
- "Instrument Number" should be the actual document number (like "2022-817"), NOT a date or time
- "Book and Page" should be the book/page reference number
- "Recording Date" should be the date when the document was recorded (may include time)
- "Document Date" should be the date when the document was created/signed
- Be very careful to distinguish between dates and document numbers

Return the data as a JSON object with the exact field names specified:

${extractionFields}`
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to analyze document');
      }

      const analysisResult = await response.json();
      const generatedText = analysisResult.generatedText || '';
      
      console.log('🔍 Raw AI response:', generatedText);
      
      // Parse the JSON response from AI
      let extractedData = {};
      try {
        extractedData = JSON.parse(generatedText);
        console.log('🔍 Parsed extracted data:', extractedData);
      } catch (e) {
        console.log('🔍 JSON parsing failed, trying to extract JSON from text...');
        // If JSON parsing fails, try to extract JSON from the text
        const jsonMatch = generatedText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          extractedData = JSON.parse(jsonMatch[0]);
          console.log('🔍 Extracted data from regex match:', extractedData);
        } else {
          console.error('🔍 Could not find JSON in response:', generatedText);
          throw new Error('Could not parse analysis results');
        }
      }

      console.log('🔍 Target row index:', targetRowIndex);
      console.log('🔍 Current data before update:', data);
      console.log('🔍 Available columns:', columns);

      // Create mapping from extracted keys to column names
      // Since the AI returns keys that match the column names exactly, we mostly use direct mapping
      const keyMapping: Record<string, string> = {
        // Direct mappings for exact matches
        "Book and Page": "Book and Page",
        "Instrument Number": "Instrument Number", 
        "Instrument Type": "Instrument Type",
        "Recorded": "Recorded",
        "Dated": "Dated",
        "Grantor(s)": "Grantor(s)",
        "Grantee(s)": "Grantee(s)", 
        "Description": "Description",
        "Comments": "Comments",
        "Document File Name": "Document File Name"
      };

      // Map the extracted data to use column names as keys
      const mappedData: Record<string, string> = {};
      
      Object.entries(extractedData).forEach(([key, value]) => {
        const mappedKey = keyMapping[key] || key;
        
        // Only include data for columns that actually exist
        if (columns.includes(mappedKey)) {
          // Handle object values (like complex Grantor/Grantee data)
          let stringValue: string;
          if (typeof value === 'object' && value !== null) {
            // If it's an object with Name and Address properties (capitalized)
            if (typeof value === 'object' && 'Name' in value && 'Address' in value) {
              stringValue = `${value.Name}; ${value.Address}`;
            } else if (typeof value === 'object' && 'name' in value && 'address' in value) {
              stringValue = `${value.name}; ${value.address}`;
            } else {
              // For other objects, create a readable string without brackets
              const objStr = JSON.stringify(value);
              stringValue = objStr.replace(/[{}]/g, '').replace(/"/g, '').replace(/:/g, ': ').replace(/,/g, ', ');
            }
          } else {
            stringValue = String(value);
          }
          
          mappedData[mappedKey] = stringValue;
        }
      });

      console.log('🔍 Final mapped data:', mappedData);

      // Update the row with mapped data
      const newData = [...data];
      console.log('🔍 Row data before update:', newData[targetRowIndex]);
      
      newData[targetRowIndex] = {
        ...newData[targetRowIndex],
        ...mappedData
      };
      
      console.log('🔍 Row data after update:', newData[targetRowIndex]);
      
      setData(newData);
      onDataChange?.(newData);

      toast({
        title: "Document analyzed",
        description: "Data has been extracted and populated in the row.",
      });

    } catch (error) {
      console.error('Document analysis error:', error);
      toast({
        title: "Analysis failed",
        description: "Failed to analyze document. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="mt-6" data-spreadsheet-container>
      <div className="flex flex-col space-y-4 px-6">
        <div className="flex justify-between items-center mb-2">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">Runsheet</h3>
            <span className="text-muted-foreground">•</span>
            {editingRunsheetName ? (
              <Input
                value={tempRunsheetName}
                onChange={(e) => setTempRunsheetName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveRunsheetNameEdit();
                    e.preventDefault();
                  } else if (e.key === 'Escape') {
                    cancelRunsheetNameEdit();
                    e.preventDefault();
                  }
                }}
                onBlur={saveRunsheetNameEdit}
                className="h-7 text-sm font-medium min-w-[200px] max-w-[300px]"
                autoFocus
              />
            ) : (
              <button
                onClick={startEditingRunsheetName}
                className="text-sm font-medium text-foreground hover:text-primary transition-colors cursor-pointer underline-offset-4 hover:underline"
              >
                {runsheetName}
              </button>
            )}
            
            {/* Autosave Status */}
            {user && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {hasUnsavedChanges ? (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-yellow-500 rounded-full animate-pulse" />
                    <span>Unsaved changes</span>
                  </div>
                ) : lastSaveTime ? (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-green-500 rounded-full" />
                    <span>
                      Auto-saved at {new Date(lastSaveTime).toLocaleTimeString([], { 
                        hour: '2-digit', 
                        minute: '2-digit',
                        second: '2-digit'
                      })}
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <div className="w-2 h-2 bg-gray-400 rounded-full" />
                    <span>Not saved yet</span>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Save Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={saveRunsheet}
              disabled={isSaving || !user}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save'}
            </Button>
            
            {/* Save and Close Button */}
            <Button
              variant="default"
              size="sm"
              onClick={saveAndCloseRunsheet}
              disabled={isSaving || !user}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isSaving ? 'Saving...' : 'Save & Close'}
            </Button>

            {/* Download Button */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Download
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={downloadSpreadsheetOnly}>
                  <FileText className="h-4 w-4 mr-2" />
                  Spreadsheet Only
                </DropdownMenuItem>
                <DropdownMenuItem onClick={downloadSpreadsheet}>
                  <Archive className="h-4 w-4 mr-2" />
                  Spreadsheet & Documents
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
            {/* Upload Multiple Files Button */}
            {onShowMultipleUpload && (
              <Button
                variant="outline"
                size="sm"
                onClick={onShowMultipleUpload}
                className="gap-2"
              >
                <FileStack className="h-4 w-4" />
                Multiple Files
              </Button>
            )}
            
              {/* New Runsheet Button */}
              <Dialog open={showNewRunsheetDialog} onOpenChange={setShowNewRunsheetDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={(e) => {
                      if (hasUnsavedChanges) {
                        e.preventDefault();
                        setShowUnsavedChangesDialog(true);
                      }
                    }}
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </Button>
                </DialogTrigger>
               <DialogContent className="sm:max-w-[500px]">
                 <DialogHeader>
                   <DialogTitle className="text-2xl font-bold text-center">Start New Runsheet</DialogTitle>
                   <DialogDescription className="text-center pt-2">
                     How would you like to get started?
                   </DialogDescription>
                 </DialogHeader>
                 
                 <div className="grid gap-4 py-6">
                   <Button
                      onClick={() => {
                        // Trigger runsheet file upload using the same mechanism as dashboard
                        const fileInput = document.createElement('input');
                        fileInput.type = 'file';
                        fileInput.accept = '.xlsx,.xls,.csv';
                        fileInput.multiple = false;
                        fileInput.style.display = 'none';
                        
                         fileInput.onchange = (e) => {
                           const files = (e.target as HTMLInputElement).files;
                           if (files && files.length > 0) {
                             const importEvent = new CustomEvent('importRunsheetFile', {
                               detail: { file: files[0] }
                             });
                             window.dispatchEvent(importEvent);
                             setShowNewRunsheetDialog(false);
                           }
                         };
                        
                        document.body.appendChild(fileInput);
                        fileInput.click();
                        
                        setTimeout(() => {
                          if (document.body.contains(fileInput)) {
                            document.body.removeChild(fileInput);
                          }
                        }, 1000);
                      }}
                     className="h-16 flex flex-col gap-2 text-left"
                     variant="outline"
                   >
                     <div className="flex items-center gap-3 w-full">
                       <Upload className="h-6 w-6" />
                       <div className="flex flex-col text-left">
                          <span className="font-semibold">Upload Runsheet</span>
                          <span className="text-sm text-muted-foreground">Upload Excel (.xlsx, .xls) or CSV files from your device</span>
                       </div>
                     </div>
                   </Button>
                   
                    <Button
                      onClick={() => {
                        fetchSavedRunsheets();
                        setShowNewRunsheetDialog(false);
                      }}
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
                      onClick={() => {
                        setShowGoogleDrivePicker(true);
                        setShowNewRunsheetDialog(false);
                      }}
                      className="h-16 flex flex-col gap-2 text-left"
                      variant="outline"
                    >
                     <div className="flex items-center gap-3 w-full">
                       <Cloud className="h-6 w-6" />
                       <div className="flex flex-col text-left">
                         <span className="font-semibold">Google Drive Import</span>
                         <span className="text-sm text-muted-foreground">Import documents from Google Drive</span>
                       </div>
                     </div>
                   </Button>
                    
                     <Button
                       onClick={() => {
                         setShowNewRunsheetDialog(false);
                         setNewRunsheetName('');
                         setShowNameNewRunsheetDialog(true);
                       }}
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

              {/* Name New Runsheet Dialog */}
              <Dialog open={showNameNewRunsheetDialog} onOpenChange={setShowNameNewRunsheetDialog}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Name Your Runsheet</DialogTitle>
                    <DialogDescription>
                      Choose a descriptive name for your new runsheet. This will help you identify it later.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="runsheet-name">Runsheet Name</Label>
                      <Input
                        id="runsheet-name"
                        placeholder="e.g., Property Deeds Q1 2024"
                        value={newRunsheetName}
                        onChange={(e) => setNewRunsheetName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && newRunsheetName.trim()) {
                            // Create the new runsheet
                            const finalName = newRunsheetName.trim();
                            setRunsheetName(finalName);
                            setData(Array.from({ length: 20 }, () => {
                              const row: Record<string, string> = {};
                              initialColumns.forEach(col => row[col] = '');
                              return row;
                            }));
                            setColumns(initialColumns);
                            setSelectedCell(null);
                            setEditingCell(null);
                            setCellValue('');
                            setSelectedRange(null);
                            setHasUnsavedChanges(false);
                            setLastSavedState('');
                            onDataChange?.(Array.from({ length: 20 }, () => {
                              const row: Record<string, string> = {};
                              initialColumns.forEach(col => row[col] = '');
                              return row;
                            }));
                            onColumnChange(initialColumns);
                            
                            setShowNameNewRunsheetDialog(false);
                            setNewRunsheetName('');
                            
                            toast({
                              title: "New runsheet created",
                              description: `"${finalName}" is ready for your data.`,
                            });
                          }
                        }}
                        autoFocus
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button
                      variant="outline"
                      onClick={() => {
                        setShowNameNewRunsheetDialog(false);
                        setNewRunsheetName('');
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        if (!newRunsheetName.trim()) {
                          toast({
                            title: "Name required",
                            description: "Please enter a name for your runsheet.",
                            variant: "destructive",
                          });
                          return;
                        }
                        
                        // Create the new runsheet
                        const finalName = newRunsheetName.trim();
                        setRunsheetName(finalName);
                        setData(Array.from({ length: 20 }, () => {
                          const row: Record<string, string> = {};
                          initialColumns.forEach(col => row[col] = '');
                          return row;
                        }));
                        setColumns(initialColumns);
                        setSelectedCell(null);
                        setEditingCell(null);
                        setCellValue('');
                        setSelectedRange(null);
                        setHasUnsavedChanges(false);
                        setLastSavedState('');
                        onDataChange?.(Array.from({ length: 20 }, () => {
                          const row: Record<string, string> = {};
                          initialColumns.forEach(col => row[col] = '');
                          return row;
                        }));
                        onColumnChange(initialColumns);
                        
                        setShowNameNewRunsheetDialog(false);
                        setNewRunsheetName('');
                        
                        toast({
                          title: "New runsheet created",
                          description: `"${finalName}" is ready for your data.`,
                        });
                      }}
                      disabled={!newRunsheetName.trim()}
                    >
                      Create Runsheet
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
          </div>
        </div>

        {/* Column Instructions Info */}
        <div className="flex justify-between items-center mb-4">
          <p className="text-sm text-muted-foreground">
            Click on column headers to configure extraction instructions for each field
          </p>
          <p className="text-sm text-muted-foreground">
            Right-click column headers to insert or remove columns
          </p>
        </div>

        {/* Single scrollable table container */}
        <div 
          ref={containerRef}
          className="border rounded-md bg-background relative overflow-auto h-[750px] mx-6"
        >
          <div className="min-w-fit">
            <Table className="border-collapse w-full" style={{ minWidth: `${getTotalTableWidth()}px` }}>
            {/* Sticky Header */}
            <TableHeader className="sticky top-0 z-30 bg-muted/95 backdrop-blur-sm">
              <TableRow className="hover:bg-muted/50 transition-colors">
                {columns.map((column) => (
                   <TableHead 
                       key={column}
                       className={`font-bold text-center border-r border-border relative p-0 last:border-r-0 cursor-move
                         ${draggedColumn === column ? 'opacity-50' : ''} 
                         ${dragOverColumn === column ? 'bg-primary/20' : ''}
                         ${localMissingColumns.includes(column) ? 'bg-yellow-100 border-2 border-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-500 animate-pulse' : ''}`}
                       style={{ width: `${getColumnWidth(column)}px`, minWidth: `${getColumnWidth(column)}px` }}
                       draggable
                      onDragStart={(e) => handleDragStart(e, column)}
                      onDragOver={(e) => handleDragOver(e, column)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, column)}
                      onDragEnd={handleDragEnd}
                    >
                       <ContextMenu>
                         <ContextMenuTrigger className="w-full h-full p-0 select-none">
                            <div 
                              className={`w-full h-full px-4 py-2 cursor-pointer hover:bg-primary/10 transition-colors relative
                                ${localMissingColumns.includes(column) ? 'hover:bg-yellow-200 dark:hover:bg-yellow-800/30' : ''}`}
                              onClick={() => openColumnDialog(column)}
                           >
                              <div className="flex flex-col items-center">
                                <span className="font-bold">{column}</span>
                                {localMissingColumns.includes(column) && (
                                  <span className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 font-medium animate-pulse">
                                    Click to save
                                  </span>
                                )}
                              </div>
                             {/* Resize handle */}
                             <div
                               className="absolute right-0 top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/30 bg-border/50"
                               onMouseDown={(e) => handleMouseDown(e, column)}
                               onClick={(e) => e.stopPropagation()}
                             />
                           </div>
                         </ContextMenuTrigger>
                       <ContextMenuContent>
                         <ContextMenuItem onClick={() => insertColumnBefore(column)}>
                           <Plus className="h-4 w-4 mr-2" />
                           Insert Column Before
                         </ContextMenuItem>
                         <ContextMenuItem onClick={() => insertColumnAfter(column)}>
                           <Plus className="h-4 w-4 mr-2" />
                           Insert Column After
                         </ContextMenuItem>
                         <ContextMenuSeparator />
                         <ContextMenuItem 
                           onClick={() => removeColumn(column)}
                           className="text-destructive focus:text-destructive"
                         >
                           <Trash2 className="h-4 w-4 mr-2" />
                           Remove Column
                         </ContextMenuItem>
                       </ContextMenuContent>
                     </ContextMenu>
                   </TableHead>
                 ))}
                
                 {/* Document File Name column header - conditionally visible */}
                 {showDocumentFileNameColumn && (
                   <TableHead 
                     className="font-bold text-center border-r border-border relative p-0 bg-muted/50"
                     style={{ width: "200px", minWidth: "200px" }}
                   >
                     <div className="w-full h-full px-4 py-2 flex flex-col items-center justify-center">
                       <span className="font-bold">Document File Name</span>
                     </div>
                   </TableHead>
                 )}
                 
                 {/* Actions column header - not draggable */}
                 <TableHead 
                   className="font-bold text-center border-r border-border relative p-0 last:border-r-0 bg-muted/50"
                   style={{ width: "200px", minWidth: "200px" }}
                 >
                   <div className="w-full h-full px-4 py-2 flex flex-col gap-1">
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => setShowDocumentFileNameColumn(!showDocumentFileNameColumn)}
                       className="text-xs"
                     >
                       {showDocumentFileNameColumn ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                       {showDocumentFileNameColumn ? 'Hide' : 'Show'} File Name Column
                     </Button>
                     <Button
                       variant="outline"
                       size="sm"
                       onClick={() => setShowDocumentNamingDialog(true)}
                       className="text-xs"
                     >
                       <Settings className="h-3 w-3 mr-1" />
                        Smart File Name Settings
                     </Button>
                   </div>
                 </TableHead>
               </TableRow>
             </TableHeader>

              {/* Table Body */}
              <TableBody>
                 {data.map((row, rowIndex) => (
                  <React.Fragment key={rowIndex}>
                     {/* Show inline document viewer above this row if it's selected */}
                    {inlineViewerRow === rowIndex && (
                      <TableRow>
                        <TableCell colSpan={columns.length + (showDocumentFileNameColumn ? 1 : 0) + 1} className="p-0 border-0">
                          <InlineDocumentViewer
                            runsheetId={currentRunsheetId || ''}
                            rowIndex={rowIndex}
                            onClose={() => setInlineViewerRow(null)}
                          />
                        </TableCell>
                      </TableRow>
                    )}
                   
                    <TableRow 
                      className="hover:bg-muted/30 relative"
                      style={{ 
                        height: `${getRowHeight(rowIndex)}px`,
                        minHeight: `${getRowHeight(rowIndex)}px`
                      }}
                    >
                    {columns.map((column) => {
                     const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.column === column;
                     const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
                     const columnIndex = columns.indexOf(column);
                     const isInRange = isCellInRange(rowIndex, columnIndex);
                     
                     return (
                       <TableCell 
                         key={`${rowIndex}-${column}`}
                         className={`border-r border-border last:border-r-0 relative ${isEditing ? 'p-0' : 'p-0'} cursor-text`}
                          style={{ 
                            width: `${getColumnWidth(column)}px`, 
                            minWidth: `${getColumnWidth(column)}px`,
                            height: isEditing ? 'fit-content' : `${getRowHeight(rowIndex)}px`,
                            minHeight: isEditing ? '60px' : `${getRowHeight(rowIndex)}px`
                          }}
                         onClick={() => selectCell(rowIndex, column)}
                         onDoubleClick={() => handleCellDoubleClick(rowIndex, column)}
                         tabIndex={0}
                       >
                         {isEditing ? (
                           <Textarea
                             ref={textareaRef}
                             value={cellValue}
                             onChange={(e) => setCellValue(e.target.value)}
                             onKeyDown={(e) => {
                               // Allow Shift+Enter for line breaks, but handle Tab/Enter/Escape/Arrow keys
                               if ((e.key === 'Enter' && !e.shiftKey) || e.key === 'Tab' || e.key === 'Escape' || 
                                   ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
                                 handleInputKeyDown(e);
                               }
                             }}
                             className={`w-full border-2 border-primary rounded-none bg-background focus:ring-0 focus:outline-none resize-none p-2 ${
                               columnAlignments[column] === 'center' ? 'text-center' : 
                               columnAlignments[column] === 'right' ? 'text-right' : 'text-left'
                             }`}
                             style={{ 
                               minHeight: '60px',
                               width: '100%',
                               height: 'auto'
                             }}
                             rows={Math.max(3, Math.ceil(cellValue.length / 50))}
                           />
                         ) : (
                           <div
                             data-cell={`${rowIndex}-${column}`}
                              className={`w-full h-full min-h-[2rem] py-2 px-3 flex items-start transition-colors whitespace-pre-wrap select-none
                                ${isSelected 
                                  ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20' 
                                  : isInRange
                                  ? 'bg-primary/10 border-2 border-primary/50'
                                  : 'hover:bg-muted/50 border-2 border-transparent'
                                }
                                ${columnAlignments[column] === 'center' ? 'text-center justify-center' : 
                                  columnAlignments[column] === 'right' ? 'text-right justify-end' : 'text-left justify-start'}`}
                               onMouseDown={(e) => handleCellMouseDown(e, rowIndex, column)}
                               onMouseEnter={() => handleMouseEnter(rowIndex, column)}
                               onMouseUp={handleMouseUp}
                               onKeyDown={(e) => handleKeyDown(e, rowIndex, column)}
                             >
                               {row[column] || ''}
                             </div>
                         )}
                       </TableCell>
                     );
                    })}
                    
                     {/* Document File Name column - conditionally visible */}
                     {showDocumentFileNameColumn && (() => {
                       const column = 'Document File Name';
                       const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.column === column;
                       const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
                       const columnIndex = columns.length; // This column comes after all regular columns
                       const isInRange = isCellInRange(rowIndex, columnIndex);
                       
                       return (
                         <TableCell 
                           key={`${rowIndex}-${column}`}
                           className={`border-r border-border p-0 cursor-text`}
                           style={{ 
                             width: "200px", 
                             minWidth: "200px",
                             height: isEditing ? 'fit-content' : `${getRowHeight(rowIndex)}px`,
                             minHeight: isEditing ? '60px' : `${getRowHeight(rowIndex)}px`
                           }}
                           onClick={() => selectCell(rowIndex, column)}
                           onDoubleClick={() => handleCellDoubleClick(rowIndex, column)}
                           tabIndex={0}
                         >
                           {isEditing ? (
                             <Textarea
                               ref={textareaRef}
                               value={cellValue}
                               onChange={(e) => setCellValue(e.target.value)}
                               onKeyDown={(e) => {
                                 if (e.key === 'Enter' && !e.shiftKey) {
                                   e.preventDefault();
                                   saveEdit();
                                 } else if (e.key === 'Escape') {
                                   e.preventDefault();
                                   cancelEdit();
                                 } else if (e.key === 'Tab') {
                                   e.preventDefault();
                                   saveEdit();
                                   // Move to actions column (no next cell for Document File Name)
                                 }
                               }}
                               onBlur={saveEdit}
                               className="w-full h-full resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent p-2"
                               autoFocus
                             />
                           ) : (
                             <div
                               data-cell={`${rowIndex}-${column}`}
                               className={`w-full h-full min-h-[2rem] py-2 px-3 flex items-start transition-colors whitespace-pre-wrap select-none
                                 ${isSelected 
                                   ? 'bg-primary/20 border-2 border-primary ring-2 ring-primary/20' 
                                   : isInRange
                                   ? 'bg-primary/10 border-2 border-primary/50'
                                   : 'hover:bg-muted/50 border-2 border-transparent'
                                 } text-left justify-start`}
                               onMouseDown={(e) => handleCellMouseDown(e, rowIndex, column)}
                               onMouseEnter={() => handleMouseEnter(rowIndex, column)}
                               onMouseUp={handleMouseUp}
                               onKeyDown={(e) => handleKeyDown(e, rowIndex, column)}
                             >
                               {row[column] || ''}
                             </div>
                           )}
                         </TableCell>
                       );
                     })()}
                    
                    {/* Actions column - Document management */}
                   <TableCell 
                     className="border-r border-border last:border-r-0 p-2"
                     style={{ width: "200px", minWidth: "200px" }}
                   >
                     <DocumentLinker
                       key={`${rowIndex}-${row['Document File Name']}`}
                       runsheetId={currentRunsheetId || ''}
                       rowIndex={rowIndex}
                       currentFilename={row['Document File Name']}
                       documentPath={(() => {
                         const dbPath = documentMap.get(rowIndex)?.file_path;
                         const storagePath = row['Storage Path'];
                         return dbPath || storagePath;
                       })()}
                       existingDocumentUrl={row['Document File Name'] && row['Document File Name'].trim() !== '' ? 'exists' : undefined}
                        onDocumentLinked={(filename) => {
                           console.log('🔧 EditableSpreadsheet: onDocumentLinked called with filename:', filename);
                           console.log('🔧 EditableSpreadsheet: Current row data before update:', data[rowIndex]);
                           const newData = [...data];
                           newData[rowIndex] = {
                             ...newData[rowIndex],
                             'Document File Name': filename
                           };
                           console.log('🔧 EditableSpreadsheet: New row data after update:', newData[rowIndex]);
                           setData(newData);
                           onDataChange?.(newData);
                          
                           // Refresh document map after a short delay to ensure DB is updated
                           if (currentRunsheetId) {
                             setTimeout(() => {
                               console.log('🔧 EditableSpreadsheet: Refreshing document map');
                               DocumentService.getDocumentMapForRunsheet(currentRunsheetId).then(setDocumentMap);
                             }, 500);
                           }
                        }}
                        onDocumentRemoved={() => {
                          const newData = [...data];
                          newData[rowIndex] = {
                            ...newData[rowIndex],
                            'Document File Name': ''
                          };
                          setData(newData);
                          onDataChange?.(newData);
                         setDocumentMap(prev => {
                           const newMap = new Map(prev);
                           newMap.delete(rowIndex);
                           return newMap;
                         });
                        }}
                        onAnalyzeDocument={async (file, filename) => {
                          console.log('🔧 EditableSpreadsheet: onAnalyzeDocument called for row:', rowIndex);
                          
                          // Check if row has existing data (excluding Document File Name column)
                          const rowData = data[rowIndex];
                          const hasExistingData = columns.some(col => 
                            rowData[col] && 
                            rowData[col].trim() !== ''
                          );

                           if (hasExistingData) {
                             // Show warning dialog
                             setPendingAnalysis({ file, filename, rowIndex });
                             setShowAnalyzeWarningDialog(true);
                           } else {
                             // Proceed with analysis
                             await analyzeDocumentAndPopulateRow(file, rowIndex);
                           }
                         }}
                         onOpenWorkspace={() => {
                           setFullScreenWorkspace({ runsheetId: currentRunsheetId || '', rowIndex });
                         }}
                         isSpreadsheetUpload={true}
                         autoAnalyze={false}
                       />
                      </TableCell>
                      
                      {/* Row resize handle */}
                      <div
                        className="absolute bottom-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/30 bg-border/50 opacity-0 hover:opacity-100 transition-opacity"
                        onMouseDown={(e) => handleRowMouseDown(e, rowIndex)}
                        title="Drag to resize row height"
                      />
                     </TableRow>
                   </React.Fragment>
                  ))}
              </TableBody>
           </Table>
           </div>

        </div>

        <div className="flex justify-between items-center text-sm text-muted-foreground pt-2">
          <Dialog open={showAddRowsDialog} onOpenChange={setShowAddRowsDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Plus className="h-4 w-4" />
                Add Rows
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add Rows</DialogTitle>
                <DialogDescription>
                  Choose how many rows to add to the spreadsheet.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="rows" className="text-right">
                    Rows
                  </Label>
                  <Input
                    id="rows"
                    type="number"
                    min="1"
                    max="100"
                    value={rowsToAdd}
                    onChange={(e) => setRowsToAdd(Math.max(1, parseInt(e.target.value) || 1))}
                    className="col-span-3"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddRowsDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={addRows}>Add Rows</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* Open Runsheet Dialog */}
        <Dialog open={showOpenDialog} onOpenChange={setShowOpenDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Open Saved Runsheet</DialogTitle>
              <DialogDescription>
                Select a runsheet to open. This will replace your current runsheet.
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-[400px] overflow-y-auto">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <div className="animate-spin h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
                  <p>Loading runsheets...</p>
                </div>
              ) : savedRunsheets.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <FolderOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No saved runsheets found.</p>
                  <p className="text-sm">Save your current runsheet to see it here.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {savedRunsheets.map((runsheet) => (
                    <div
                      key={runsheet.id}
                      className="border rounded-lg p-4 hover:bg-muted/50 cursor-pointer transition-colors"
                      onClick={async () => {
                        setIsLoadingRunsheet(true);
                        await loadRunsheet(runsheet);
                      }}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-medium text-foreground">{runsheet.name}</h3>
                          <p className="text-sm text-muted-foreground">
                            {runsheet.columns.length} columns • {runsheet.data.length} rows
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Last updated: {new Date(runsheet.updated_at).toLocaleDateString()} {new Date(runsheet.updated_at).toLocaleTimeString()}
                          </p>
                        </div>
                        <Button variant="ghost" size="sm" className="ml-2">
                          Open
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowOpenDialog(false)}>
                Cancel
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Warning Dialog */}
        <Dialog open={showUploadWarningDialog} onOpenChange={setShowUploadWarningDialog}>
          <DialogContent className="sm:max-w-[425px]">
            <DialogHeader>
              <DialogTitle>Replace Current Runsheet?</DialogTitle>
              <DialogDescription>
                Uploading a file will replace all data in the current runsheet. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground">
                Are you sure you want to continue? All existing data in "{runsheetName}" will be lost.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowUploadWarningDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={proceedWithUpload}>
                Replace Data
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Document Naming Settings Dialog */}
        <Dialog open={showNamingSettings} onOpenChange={(open) => {
          console.log('🔧 EditableSpreadsheet: Dialog onOpenChange called with:', open);
          setShowNamingSettings(open);
        }}>
          <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Document Naming Settings</DialogTitle>
              <DialogDescription>
                Configure how documents are automatically named when linked to this runsheet.
              </DialogDescription>
            </DialogHeader>
            <DocumentNamingSettings availableColumns={columns} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNamingSettings(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Column Configuration Dialog */}
        <Dialog open={showColumnDialog} onOpenChange={setShowColumnDialog}>
          <DialogContent className="sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Configure Column</DialogTitle>
              <DialogDescription>
                Set the column name and specify what type of information should be extracted for this field.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div>
                <Label htmlFor="column-name" className="text-sm font-medium">
                  Column Name
                </Label>
                <Input
                  id="column-name"
                  value={editingColumnName}
                  onChange={(e) => setEditingColumnName(e.target.value)}
                  className="mt-2"
                  placeholder="Enter column name..."
                />
              </div>
              <div>
                <Label htmlFor="column-instructions" className="text-sm font-medium">
                  Extraction Instructions
                </Label>
                <Textarea
                  id="column-instructions"
                  placeholder="Example: Extract the Grantor's name as it appears on the document and include the address..."
                  value={editingColumnInstructions}
                  onChange={(e) => setEditingColumnInstructions(e.target.value)}
                  className="mt-2 min-h-[120px]"
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Provide specific instructions for what information should be extracted for this column. Be as detailed as possible for better AI accuracy.
                </p>
              </div>
              <div>
                <Label htmlFor="column-alignment" className="text-sm font-medium">
                  Text Alignment
                </Label>
                <Select value={editingColumnAlignment} onValueChange={(value: 'left' | 'center' | 'right') => setEditingColumnAlignment(value)}>
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select alignment" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="left">
                      <div className="flex items-center gap-2">
                        <AlignLeft className="h-4 w-4" />
                        Left
                      </div>
                    </SelectItem>
                    <SelectItem value="center">
                      <div className="flex items-center gap-2">
                        <AlignCenter className="h-4 w-4" />
                        Center
                      </div>
                    </SelectItem>
                    <SelectItem value="right">
                      <div className="flex items-center gap-2">
                        <AlignRight className="h-4 w-4" />
                        Right
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowColumnDialog(false)}>
                Cancel
              </Button>
              <Button 
                variant="secondary" 
                onClick={saveAsDefault}
                disabled={isSavingAsDefault || !user}
                className="gap-2"
              >
                <Save className="h-4 w-4" />
                {isSavingAsDefault ? "Saving..." : "Save as Default"}
              </Button>
              <Button onClick={saveColumnChanges}>
                Save Column
              </Button>
            </DialogFooter>
          </DialogContent>
         </Dialog>

        {/* Unsaved Changes Dialog for New Runsheet */}
        <Dialog open={showUnsavedChangesDialog} onOpenChange={setShowUnsavedChangesDialog}>
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle>Unsaved Changes</DialogTitle>
              <DialogDescription>
                You have unsaved changes in your current runsheet. What would you like to do?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="flex flex-col sm:flex-row gap-2 sm:gap-3">
              <Button variant="outline" onClick={() => setShowUnsavedChangesDialog(false)} className="w-full sm:w-auto">
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => {
                  setShowUnsavedChangesDialog(false);
                  setShowNewRunsheetDialog(true);
                }}
                className="w-full sm:w-auto"
              >
                Continue Without Saving
              </Button>
              <Button 
                onClick={async () => {
                  setShowUnsavedChangesDialog(false);
                  await autoSaveRunsheet();
                  setShowNewRunsheetDialog(true);
                }}
                className="w-full sm:w-auto"
              >
                Save & Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Analyze Document Warning Dialog */}
        <AlertDialog open={showAnalyzeWarningDialog} onOpenChange={setShowAnalyzeWarningDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-warning" />
                Replace Existing Data?
              </AlertDialogTitle>
              <AlertDialogDescription>
                This row already contains data. Analyzing the document will replace all existing data in this row with the extracted information from the document.
                <br /><br />
                Are you sure you want to continue?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => {
                setShowAnalyzeWarningDialog(false);
                setPendingAnalysis(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction onClick={async () => {
                if (pendingAnalysis) {
                  setShowAnalyzeWarningDialog(false);
                  await analyzeDocumentAndPopulateRow(pendingAnalysis.file, pendingAnalysis.rowIndex);
                  setPendingAnalysis(null);
                }
              }}>
                Replace Data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Google Drive Picker */}
        <GoogleDrivePicker
          isOpen={showGoogleDrivePicker}
          onClose={() => setShowGoogleDrivePicker(false)}
          onFileSelect={performUpload}
        />

        {/* Name Conflict Dialog */}
        <AlertDialog open={showNameConflictDialog} onOpenChange={setShowNameConflictDialog}>
          <AlertDialogContent className="max-w-4xl w-[90vw] max-h-[90vh] overflow-auto">
            <AlertDialogHeader>
              <AlertDialogTitle>Saving Runsheet but File Name Already Exists</AlertDialogTitle>
              <AlertDialogDescription>
                A runsheet with the name "{nameConflictData?.originalName}" already exists. 
                What would you like to do?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="py-4">
              <p className="text-sm text-muted-foreground mb-2">
                <strong>Option 1:</strong> Overwrite the existing runsheet (this will permanently replace its data)
              </p>
              <p className="text-sm text-muted-foreground">
                <strong>Option 2:</strong> Save with the suggested name: "{nameConflictData?.suggestedName}"
              </p>
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={handleCancelSave}>
                Cancel
              </AlertDialogCancel>
              <Button variant="outline" onClick={handleUseSuggestedName}>
                Use "{nameConflictData?.suggestedName}"
              </Button>
              <AlertDialogAction onClick={handleOverwriteRunsheet} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Overwrite Existing
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        </div>
        
        {fullScreenWorkspace && (
          <FullScreenDocumentWorkspace
            runsheetId={fullScreenWorkspace.runsheetId}
            rowIndex={fullScreenWorkspace.rowIndex}
            rowData={data[fullScreenWorkspace.rowIndex] || {}}
            fields={columns}
            onClose={() => setFullScreenWorkspace(null)}
            onUpdateRow={(rowIndex, rowData) => {
              const newData = [...data];
              newData[rowIndex] = rowData;
              setData(newData);
              onDataChange?.(newData);
            }}
            columnWidths={columnWidths}
            columnAlignments={columnAlignments}
            onColumnWidthChange={(column, width) => {
              setColumnWidths(prev => ({
                ...prev,
                [column]: width
              }));
              setHasManuallyResizedColumns(true);
            }}
          />
        )}

        {/* Document Naming Settings Dialog */}
        <Dialog open={showDocumentNamingDialog} onOpenChange={setShowDocumentNamingDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Document File Naming Preferences</DialogTitle>
            </DialogHeader>
            <DocumentNamingSettings 
              availableColumns={columns}
            />
          </DialogContent>
        </Dialog>
      </div>
    );
};

export default EditableSpreadsheet;
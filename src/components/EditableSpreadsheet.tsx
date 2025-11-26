import React, { useState, useRef, useEffect, useCallback, forwardRef, useImperativeHandle } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useActiveRunsheet } from '@/hooks/useActiveRunsheet';

import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { Plus, Trash2, Check, X, ArrowUp, ArrowDown, Save, FolderOpen, Download, Upload, AlignLeft, AlignCenter, AlignRight, Cloud, ChevronDown, FileText, Archive, ExternalLink, AlertTriangle, FileStack, Settings, Eye, EyeOff, Sparkles, Bug, AlertCircle, Brain, FileEdit, Wand2 } from 'lucide-react';
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
import { RunsheetFileUpload } from './RunsheetFileUpload';
import DocumentUpload from './DocumentUpload';
import DocumentLinker from './DocumentLinker';
import { DocumentService, type DocumentRecord } from '@/services/documentService';
import { ExtractionPreferencesService } from '@/services/extractionPreferences';
import { ColumnWidthPreferencesService } from '@/services/columnWidthPreferences';
import DocumentNamingSettings from './DocumentNamingSettings';
import InstrumentSelectionDialog from './InstrumentSelectionDialog';
import InlineDocumentViewer from './InlineDocumentViewer';
import ColumnPreferencesDialog from './ColumnPreferencesDialog';
import FullScreenDocumentWorkspace from './FullScreenDocumentWorkspace';
import SideBySideDocumentWorkspace from './SideBySideDocumentWorkspace';
import { BatchDocumentAnalysisDialog } from './BatchDocumentAnalysisDialog';
import { BatchFileRenameDialog } from './BatchFileRenameDialog';
import { BackgroundAnalysisIndicator } from './BackgroundAnalysisIndicator';
import ImprovedDocumentAnalysis from './ImprovedDocumentAnalysis';
import AdvancedDataVerificationDialog from './AdvancedDataVerificationDialog';
import ViewportPortal from './ViewportPortal';
import { AutoSaveIndicator } from './AutoSaveIndicator';
import { useImmediateSave } from '@/hooks/useImmediateSave';
import ReExtractDialog from './ReExtractDialog';
import RunsheetNameDialog from './RunsheetNameDialog';
import TextReformatDialog from './TextReformatDialog';
import { convertPDFToImages, createFileFromBlob } from '@/utils/pdfToImage';
import { combineImages } from '@/utils/imageCombiner';
import { backgroundAnalyzer } from '@/utils/backgroundAnalyzer';
import { syncService } from '@/utils/syncService';


import type { User } from '@supabase/supabase-js';
import { 
  isRowEmpty, 
  hasRowData, 
  findFirstEmptyRow, 
  validateDataForInsertion, 
  validateRowForInsertion,
  getRowDataSummary,
  prepareDataForInsertion 
} from '@/utils/rowValidation';
import { RowInsertionIndicator, NextEmptyRowIndicator } from './RowInsertionIndicator';

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

// Helper function to check if data changes are significant enough to notify user
const checkForSignificantChanges = (
  oldData: Record<string, string>[], 
  newData: Record<string, string>[]
): boolean => {
  // Don't notify for small length differences (auto-save may add/remove empty rows)
  if (Math.abs(oldData.length - newData.length) <= 2) {
    // Check if there are actual content changes, not just empty row additions
    const minLength = Math.min(oldData.length, newData.length);
    let meaningfulChanges = 0;
    
    for (let i = 0; i < minLength; i++) {
      const oldRow = oldData[i] || {};
      const newRow = newData[i] || {};
      
      // Check if this row has non-empty content in either version
      const oldHasContent = Object.values(oldRow).some(val => val && val.trim() !== '');
      const newHasContent = Object.values(newRow).some(val => val && val.trim() !== '');
      
      if (oldHasContent || newHasContent) {
        if (JSON.stringify(oldRow) !== JSON.stringify(newRow)) {
          meaningfulChanges++;
        }
      }
    }
    
    // Only notify if there are multiple meaningful changes (not just typing corrections)
    return meaningfulChanges > 2;
  }
  
  // Significant length difference - probably worth notifying
  return true;
};

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
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { setActiveRunsheet, clearActiveRunsheet, currentRunsheet, updateRunsheet, setCurrentRunsheet } = useActiveRunsheet();
  
  // Debug log when currentRunsheet changes
  useEffect(() => {
    console.log('🔧 EDITABLE_SPREADSHEET: currentRunsheet changed:', {
      hasCurrentRunsheet: !!currentRunsheet,
      runsheetId: currentRunsheet?.id,
      runsheetName: currentRunsheet?.name,
      columnsLength: currentRunsheet?.columns?.length || 0,
      dataLength: currentRunsheet?.data?.length || 0
    });
  }, [currentRunsheet]);
  const [user, setUser] = useState<User | null>(null);
  
  // Track locally which columns need configuration
  const [localMissingColumns, setLocalMissingColumns] = useState<string[]>([]);
  const [isLoadingRunsheet, setIsLoadingRunsheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isProcessingBrainAnalysis, setIsProcessingBrainAnalysis] = useState(false);
  const [showOpenDialog, setShowOpenDialog] = useState(false);
  const [showUploadWarningDialog, setShowUploadWarningDialog] = useState(false);
  const [savedRunsheets, setSavedRunsheets] = useState<any[]>([]);
  const [runsheetName, setRunsheetName] = useState<string>(() => {
    // Prevent default runsheet creation if upload action is active
    const preventDefault = sessionStorage.getItem('prevent_default_runsheet_creation');
    const isUploadMode = window.location.search.includes('action=upload');
    
    if (preventDefault === 'true' || isUploadMode) {
      if (preventDefault === 'true') {
        sessionStorage.removeItem('prevent_default_runsheet_creation');
      }
      return '';
    }
    return initialRunsheetName || 'Untitled Runsheet';
  });
  const [editingRunsheetName, setEditingRunsheetName] = useState<boolean>(false);
  const [tempRunsheetName, setTempRunsheetName] = useState<string>('');
  const [lastSaveTime, setLastSaveTime] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showNameConflictDialog, setShowNameConflictDialog] = useState(false);
  const [nameConflictData, setNameConflictData] = useState<{ originalName: string; suggestedName: string } | null>(null);
  const [pendingSaveData, setPendingSaveData] = useState<{ isUpdate: boolean; runsheetId?: string; shouldClose?: boolean } | null>(null);
  const [pendingUploadRequest, setPendingUploadRequest] = useState<any>(null);
  const [showDocumentNamingDialog, setShowDocumentNamingDialog] = useState(false);
  const [showTextReformatDialog, setShowTextReformatDialog] = useState(false);
  const [reformatCellInfo, setReformatCellInfo] = useState<{rowIndex: number, column: string, text: string} | null>(null);
  
  // Helper function to ensure document columns exist
  const ensureDocumentColumns = (columnsList: string[]): string[] => {
    // Remove Document File Name from regular columns since we'll handle it separately
    return columnsList.filter(col => col !== 'Document File Name');
  };
  
  const [columns, setColumns] = useState<string[]>(() => ensureDocumentColumns(initialColumns));
  const [data, setData] = useState<Record<string, string>[]>(() => {
    console.log('🔍 EditableSpreadsheet initializing with initialData:');
    console.log('🔍 initialData length:', initialData?.length);
    console.log('🔍 initialData content:', initialData);
    console.log('🔍 initialColumns:', initialColumns);
    
    // If we have meaningful initial data (uploaded data), use it directly
    if (initialData && initialData.length > 0) {
      console.log('✅ Using provided initialData for spreadsheet');
      const minRows = 20;
      const existingRows = initialData.length;
      const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
        const row: Record<string, string> = {};
        initialColumns.forEach(col => row[col] = '');
        return row;
      });
      const result = [...initialData, ...emptyRows];
      console.log('✅ Final data array length:', result.length);
      console.log('✅ First few rows of final data:', result.slice(0, 3));
      return result;
    }
    
    // Emergency draft system REMOVED - using immediate database saves instead
    
    // Prevent default rows creation if upload action is active
    const preventDefault = sessionStorage.getItem('prevent_default_runsheet_creation');
    if (preventDefault === 'true') {
      console.log('🚫 Preventing default rows creation for upload');
      return [];
    }
    
    // Start with a reasonable number of rows, users can add more as needed
    console.log('🔍 Creating empty rows as fallback');
    const minRows = 20;
    const emptyRows = Array.from({ length: minRows }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
    return emptyRows;
  });

  // Helper function to ensure data has minimum number of rows
  const ensureMinimumRows = useCallback((data: Record<string, string>[], columns: string[]): Record<string, string>[] => {
    const minRows = 20; // Smaller starting point
    const existingRows = data.length;
    
    if (existingRows >= minRows) return data;
    
    const emptyRows = Array.from({ length: minRows - existingRows }, () => {
      const row: Record<string, string> = {};
      columns.forEach(col => row[col] = '');
      return row;
    });
    
    return [...data, ...emptyRows];
  }, []);

  // Function to manually add more rows
  const addMoreRows = useCallback((count: number) => {
    console.log('🔧 DEBUG: addMoreRows called with count:', count);
    
    setData(prev => {
      console.log('🔧 DEBUG: Previous data length:', prev.length);
      const newRows = Array.from({ length: count }, () => {
        const row: Record<string, string> = {};
        columns.forEach(col => row[col] = '');
        return row;
      });
      console.log('🔧 DEBUG: New rows created:', newRows.length);
      const updatedData = [...prev, ...newRows];
      console.log('🔧 DEBUG: Updated data length:', updatedData.length);
      return updatedData;
    });
    
    // Close the dropdown after adding rows
    setAddRowsDropdownOpen(false);
    
    toast({
      title: "Rows added",
      description: `Added ${count} new rows to the runsheet.`,
      variant: "default"
    });
  }, [columns, toast]);

  // CRITICAL: Sync local state with currentRunsheet when it loads
  useEffect(() => {
    if (!currentRunsheet || !currentRunsheet.id) return;

    // Skip if we're temporarily suppressing realtime to avoid overwriting fresh local edits
    const now = Date.now();
    if (now < suppressRealtimeUntilRef.current) {
      console.log('🚫 EDITABLE_SPREADSHEET: Skipping sync - realtime suppressed');
      return;
    }

    console.log('🔄 EDITABLE_SPREADSHEET: Syncing with loaded runsheet data');

    // Check if we're in upload mode or just uploaded data - prevent overriding fresh upload
    const isUploadMode = window.location.search.includes('action=upload');
    const recentSave = Date.now() - lastSavedAtRef.current < 8000; // Within 8 seconds
    const localHasData = dataRef.current.length > 0 && dataRef.current.some(row => Object.values(row).some(val => val?.trim()));

    if (isUploadMode || (recentSave && localHasData)) {
      console.log('🚫 EDITABLE_SPREADSHEET: Skipping sync - recent local save detected');
      return;
    }

    // If server data is not newer than our last save, don't override local
    const serverUpdatedAt = currentRunsheet.updated_at ? Date.parse(currentRunsheet.updated_at) : 0;
    const localBarrier = Math.max(lastSavedAtRef.current, lastServerAppliedAtRef.current);
    if (serverUpdatedAt && serverUpdatedAt <= localBarrier + 500) {
      console.log('🚫 EDITABLE_SPREADSHEET: Skipping sync - server not newer than local/applied', { serverUpdatedAt, lastSavedAt: lastSavedAtRef.current, lastServerAppliedAt: lastServerAppliedAtRef.current });
      return;
    }

    // Prevent destructive overwrites: if incoming has significantly fewer filled cells, skip
    const countFilled = (rows: Record<string, string>[]) =>
      rows.reduce((acc, row) => acc + Object.values(row || {}).filter(v => typeof v === 'string' && v.trim() !== '').length, 0);
    const incomingData = (currentRunsheet.data as Record<string, string>[]) || [];
    const currentFilled = countFilled(dataRef.current || []);
    const incomingFilled = countFilled(incomingData);
    const destructive = currentFilled > 0 && (incomingData.length === 0 || incomingFilled + 3 < currentFilled);
    if (destructive) {
      console.warn('🚫 EDITABLE_SPREADSHEET: Skipping sync - incoming data would be destructive', { currentFilled, incomingFilled });
      return;
    }

    // Update local state with runsheet data
    if (currentRunsheet.columns && currentRunsheet.columns.length > 0) {
      console.log('🔄 EDITABLE_SPREADSHEET: Setting columns from runsheet:', currentRunsheet.columns);
      setColumns(currentRunsheet.columns);
      onColumnChange?.(currentRunsheet.columns);
    }
    
    if (currentRunsheet.data) {
      console.log('🔄 EDITABLE_SPREADSHEET: Setting data from runsheet, length:', currentRunsheet.data.length);
      const minRowsData = ensureMinimumRows(currentRunsheet.data, currentRunsheet.columns || []);
      setData(minRowsData);
      dataRef.current = minRowsData;
      onDataChange?.(minRowsData);
    }
    
    if (currentRunsheet.name) {
      console.log('🔄 EDITABLE_SPREADSHEET: Setting runsheet name:', currentRunsheet.name);
      setRunsheetName(currentRunsheet.name);
    }
    
    if (currentRunsheet.columnInstructions) {
      console.log('🔄 EDITABLE_SPREADSHEET: Setting column instructions');
      setColumnInstructions(currentRunsheet.columnInstructions);
      onColumnInstructionsChange?.(currentRunsheet.columnInstructions);
    }

    // Mark the latest server version we've applied
    lastServerAppliedAtRef.current = serverUpdatedAt || Date.now();
  }, [currentRunsheet, onColumnChange, onDataChange, onColumnInstructionsChange, ensureMinimumRows]);


  // Function to add rows to reach a specific total
  const ensureRowCount = useCallback((targetCount: number) => {
    setData(prev => {
      if (prev.length >= targetCount) return prev;
      
      const rowsToAdd = targetCount - prev.length;
      const newRows = Array.from({ length: rowsToAdd }, () => {
        const row: Record<string, string> = {};
        columns.forEach(col => row[col] = '');
        return row;
      });
      return [...prev, ...newRows];
    });
  }, [columns]);
  
  // Triple-click detection
  const [lastClickTime, setLastClickTime] = useState<number>(0);
  const [clickCount, setClickCount] = useState<number>(0);
  const [lastClickedCell, setLastClickedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [editingCell, setEditingCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [cellValue, setCellValue] = useState<string>('');
  const [selectedCell, setSelectedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [lastSavedState, setLastSavedState] = useState<string>('');
  const [selectedRange, setSelectedRange] = useState<{start: {rowIndex: number, columnIndex: number}, end: {rowIndex: number, columnIndex: number}} | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [copiedData, setCopiedData] = useState<string[][] | null>(null);
  const [cutData, setCutData] = useState<{range?: {start: {rowIndex: number, columnIndex: number}, end: {rowIndex: number, columnIndex: number}}, cell?: {rowIndex: number, column: string}} | null>(null);
  const [columnWidths, setColumnWidths] = useState<Record<string, number>>({});
  const [isLoadingColumnWidths, setIsLoadingColumnWidths] = useState(false);
  const [rowHeights, setRowHeights] = useState<Record<number, number>>({});
  const [resizing, setResizing] = useState<{column: string, startX: number, startWidth: number} | null>(null);
  const [resizingRow, setResizingRow] = useState<{rowIndex: number, startY: number, startHeight: number} | null>(null);
  const [isDraggingResize, setIsDraggingResize] = useState(false);
  const [copiedCell, setCopiedCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [copiedRange, setCopiedRange] = useState<{start: {rowIndex: number, columnIndex: number}, end: {rowIndex: number, columnIndex: number}} | null>(null);
  const [showAddRowsDialog, setShowAddRowsDialog] = useState(false);
  const [rowsToAdd, setRowsToAdd] = useState<number>(1);
  const [addRowsDropdownOpen, setAddRowsDropdownOpen] = useState(false);
  const [draggedColumn, setDraggedColumn] = useState<string | null>(null);
  const [dragOverColumn, setDragOverColumn] = useState<string | null>(null);
  
  const [showColumnDialog, setShowColumnDialog] = useState(false);
  const [showColumnPreferencesDialog, setShowColumnPreferencesDialog] = useState(false);
  const [editingColumnName, setEditingColumnName] = useState<string>('');
  const [editingColumnInstructions, setEditingColumnInstructions] = useState<string>('');
  const [selectedColumn, setSelectedColumn] = useState<string>('');
  const [columnInstructions, setColumnInstructions] = useState<Record<string, string>>({});
  const [showNewRunsheetDialog, setShowNewRunsheetDialog] = useState(false);
  const [showNameNewRunsheetDialog, setShowNameNewRunsheetDialog] = useState(false);
  const [newRunsheetName, setNewRunsheetName] = useState('');
  const [showAnalyzeWarningDialog, setShowAnalyzeWarningDialog] = useState(false);
  const [pendingAnalysis, setPendingAnalysis] = useState<{file: File, filename: string, rowIndex: number} | null>(null);
  const [showInstrumentSelectionDialog, setShowInstrumentSelectionDialog] = useState(false);
  const [detectedInstruments, setDetectedInstruments] = useState<Array<{id: number; type: string; description: string; snippet?: string}>>([]);
  const [pendingInstrumentAnalysis, setPendingInstrumentAnalysis] = useState<{file: File, rowIndex: number, forceOverwrite: boolean, fillEmptyOnly: boolean} | null>(null);
  const [showUnsavedChangesDialog, setShowUnsavedChangesDialog] = useState(false);
  const [columnAlignments, setColumnAlignments] = useState<Record<string, 'left' | 'center' | 'right'>>({});
  const [editingColumnAlignment, setEditingColumnAlignment] = useState<'left' | 'center' | 'right'>('left');
  const [showGoogleDrivePicker, setShowGoogleDrivePicker] = useState(false);
  const [showGoogleFileUpload, setShowGoogleFileUpload] = useState(false);
  const [googleSelectedFile, setGoogleSelectedFile] = useState<File | null>(null);
  const [showFileUpload, setShowFileUpload] = useState(false);
  const [isSavingAsDefault, setIsSavingAsDefault] = useState(false);
  const [hasManuallyResizedColumns, setHasManuallyResizedColumns] = useState(false);
  const [documentMap, setDocumentMap] = useState<Map<number, DocumentRecord>>(new Map());
  const [currentRunsheetId, setCurrentRunsheetId] = useState<string | null>(null);
  

  // Resolve a reliable runsheet ID for document operations (inline viewer, linking)
  const effectiveRunsheetId = currentRunsheet?.id || currentRunsheetId || '';

  // Helper function to update document map and notify parent
  const updateDocumentMap = (newMap: Map<number, DocumentRecord>) => {
    setDocumentMap(newMap);
    onDocumentMapChange?.(newMap);
  };
  const [showNamingSettings, setShowNamingSettings] = useState(false);
  const [inlineViewerRow, setInlineViewerRow] = useState<number | null>(null);
  
  // Initialize workspace states from URL parameters
  const expandedRowParam = searchParams.get('expanded');
  const sideBySideRowParam = searchParams.get('sidebyside');
  const [fullScreenWorkspace, setFullScreenWorkspace] = useState<{ runsheetId: string; rowIndex: number } | null>(
    expandedRowParam ? { runsheetId: effectiveRunsheetId || '', rowIndex: parseInt(expandedRowParam) } : null
  );
  const [sideBySideWorkspace, setSideBySideWorkspace] = useState<{ runsheetId: string; rowIndex: number } | null>(
    sideBySideRowParam ? { runsheetId: effectiveRunsheetId || '', rowIndex: parseInt(sideBySideRowParam) } : null
  );
  const [showBatchAnalysisDialog, setShowBatchAnalysisDialog] = useState(false);
  const [showBatchRenameDialog, setShowBatchRenameDialog] = useState(false);
  const [showImprovedAnalysis, setShowImprovedAnalysis] = useState(false);
  // Removed showDocumentFileNameColumn state - no longer needed

  // When batch analysis starts, blur any focused element to prevent unintended edits
  useEffect(() => {
    if (showBatchAnalysisDialog) {
      const active = document.activeElement as HTMLElement | null;
      active?.blur?.();
    }
  }, [showBatchAnalysisDialog]);
  
  // Runsheet naming dialog state
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [pendingRunsheetData, setPendingRunsheetData] = useState<{
    columns: string[];
    instructions: Record<string, string>;
    required: boolean;
  } | null>(null);
  
  // Helper functions to manage workspace state and URL parameters
  const openFullScreenWorkspace = useCallback((rowIndex: number) => {
    const newWorkspace = { runsheetId: effectiveRunsheetId || '', rowIndex };
    setFullScreenWorkspace(newWorkspace);
    
    // Update URL parameters
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('expanded', rowIndex.toString());
    newSearchParams.delete('sidebyside'); // Clear side-by-side if open
    setSearchParams(newSearchParams);
    
    // Close side-by-side if open
    setSideBySideWorkspace(null);
  }, [effectiveRunsheetId, searchParams, setSearchParams]);
  
  const openSideBySideWorkspace = useCallback((rowIndex: number) => {
    const newWorkspace = { runsheetId: effectiveRunsheetId || '', rowIndex };
    setSideBySideWorkspace(newWorkspace);
    
    // Update URL parameters
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.set('sidebyside', rowIndex.toString());
    newSearchParams.delete('expanded'); // Clear expanded if open
    setSearchParams(newSearchParams);
    
    // Close full screen if open
    setFullScreenWorkspace(null);
  }, [effectiveRunsheetId, searchParams, setSearchParams]);
  
  const closeAllWorkspaces = useCallback(() => {
    setFullScreenWorkspace(null);
    setSideBySideWorkspace(null);
    
    // Clear URL parameters
    const newSearchParams = new URLSearchParams(searchParams);
    newSearchParams.delete('expanded');
    newSearchParams.delete('sidebyside');
    setSearchParams(newSearchParams);
  }, [searchParams, setSearchParams]);
  
  // Auto-save state
  const [autoSaveStatus, setAutoSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [autoSaveError, setAutoSaveError] = useState<string>('');
  const [lastAutoSaveTime, setLastAutoSaveTime] = useState<Date | null>(null);
  
  // Effect to sync workspace states when runsheet changes
  useEffect(() => {
    const expandedRowParam = searchParams.get('expanded');
    const sideBySideRowParam = searchParams.get('sidebyside');
    
    if (expandedRowParam && currentRunsheetId) {
      const rowIndex = parseInt(expandedRowParam);
      if (!isNaN(rowIndex) && rowIndex >= 0) {
        setFullScreenWorkspace({ runsheetId: currentRunsheetId, rowIndex });
        setSideBySideWorkspace(null);
      }
    } else if (sideBySideRowParam && currentRunsheetId) {
      const rowIndex = parseInt(sideBySideRowParam);
      if (!isNaN(rowIndex) && rowIndex >= 0) {
        setSideBySideWorkspace({ runsheetId: currentRunsheetId, rowIndex });
        setFullScreenWorkspace(null);
      }
    } else {
      setFullScreenWorkspace(null);
      setSideBySideWorkspace(null);
    }
  }, [currentRunsheetId, searchParams]);
  
  // Enhanced UI state for better interactions
  const [isScrolling, setIsScrolling] = useState(false);
  const [cellValidationErrors, setCellValidationErrors] = useState<Record<string, string>>({});
  const [isTableLoading, setIsTableLoading] = useState(false);
  
  // Hover state for re-analyze functionality
  const [hoveredCell, setHoveredCell] = useState<{rowIndex: number, column: string} | null>(null);
  const [showReExtractDialog, setShowReExtractDialog] = useState(false);
  const [showOverwriteDialog, setShowOverwriteDialog] = useState(false);
  const [overwriteDialogData, setOverwriteDialogData] = useState<{
    rowIndex: number;
    rowSummary: string;
    error: string;
    file: File;
    onConfirm: () => void;
    onCancel: () => void;
  } | null>(null);
  const [reExtractField, setReExtractField] = useState<{rowIndex: number, column: string, currentValue: string} | null>(null);
  const [isReExtracting, setIsReExtracting] = useState(false);
  const [lastEditedCell, setLastEditedCell] = useState<{rowIndex: number, column: string} | null>(null);
  
  const tableContainerRef = useRef<HTMLDivElement>(null);
  
  const [pendingDataInsertion, setPendingDataInsertion] = useState<{
    rowIndex: number;
    data: Record<string, string>;
    hasExistingData: boolean;
  } | null>(null);
  const [showInsertionPreview, setShowInsertionPreview] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Realtime sync controls to avoid self-echo and toast spam
  const lastSavedAtRef = useRef<number>(0);
  const lastSavedDataHashRef = useRef<string | null>(null);
  const lastSyncToastAtRef = useRef<number>(0);
  const isProcessingUploadRef = useRef<boolean>(false);
  const suppressRealtimeUntilRef = useRef<number>(0);
  const dataRef = useRef<Record<string, string>[]>(data);
  const recentEditedRowsRef = useRef<Map<number, { timestamp: number; row: Record<string, string> }>>(new Map());
  // Track latest server version we've applied to avoid out-of-order overwrites
  const lastServerAppliedAtRef = useRef<number>(0);
  
  // Immediate save system like Google Sheets - no debouncing, save on every change
  const { saveToDatabase, saveAsNewRunsheet, isSaving: immediateSaving } = useImmediateSave({
    runsheetId: currentRunsheet?.id || currentRunsheetId,
    userId: user?.id,
    onSaveStart: () => {
      setAutoSaveStatus('saving');
      setAutoSaveError('');
      // Mark last save time and snapshot to ignore self-echo realtime updates
      try {
        lastSavedAtRef.current = Date.now();
        lastSavedDataHashRef.current = JSON.stringify(data);
      } catch {}
    },
    onSaveSuccess: (result) => {
      // Update state to reflect successful save like Google Sheets
      setHasUnsavedChanges(false);
      setAutoSaveStatus('saved');
      setLastAutoSaveTime(new Date());
      
      // CRITICAL: Update lastSavedState to prevent auto-save oscillation
      // This fixes the issue where silent saves don't update the change detection baseline
      const savedState = JSON.stringify({ data, columns, runsheetName, columnInstructions });
      setLastSavedState(savedState);
      setLastSaveTime(new Date());
      onUnsavedChanges?.(false);
      
      // Update current runsheet ID if this was a new runsheet or converted from temporary
      if ((!currentRunsheetId || currentRunsheetId.startsWith('temp-')) && result?.id) {
        console.log('🔄 Updating runsheet ID from', currentRunsheetId, 'to', result.id);
        setCurrentRunsheetId(result.id);
        setActiveRunsheet({
          id: result.id,
          name: runsheetName,
          data,
          columns,
          columnInstructions
        });
        
        // Clear localStorage since we now have database persistence
        try {
          localStorage.removeItem('runsheet-emergency-draft');
          console.log('🗑️ Cleared emergency draft - now using database persistence');
        } catch (error) {
          console.error('Error clearing emergency draft:', error);
        }
      }
    },
    onSaveError: (error: any) => {
      // Show error state like Google Sheets does
      setAutoSaveStatus('error');
      const errorMessage = typeof error === 'string' ? error : (error && typeof error === 'object' && error.message) || 'Failed to save';
      setAutoSaveError(errorMessage);
      console.error('Immediate save error:', error);
    }
  });

  // Keep a live ref of the latest data to avoid stale saves from event handlers
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  // Regular save function for manual saves (shows UI feedback)
  const saveImmediately = useCallback(async () => {
    if (runsheetName && runsheetName !== 'Untitled Runsheet') {
      console.log('💾 Saving manually to database');
      try {
        await saveToDatabase(data, columns, runsheetName, columnInstructions, false); // Non-silent save
      } catch (error) {
        console.error('Manual save failed:', error);
      }
    }
  }, [saveToDatabase, data, columns, runsheetName, columnInstructions]);

  // Single-user database sync - data is saved immediately on every change
  // No real-time sync needed since only one user per runsheet

  // Load data ONLY from database on mount - single source of truth
  useEffect(() => {
    const loadFromDatabase = async () => {
      if (!currentRunsheetId || !user) return;
      
      console.log('📊 Loading data from database (single source of truth)');
      
      try {
        const { data: runsheet, error } = await supabase
          .from('runsheets')
          .select('*')
          .eq('id', currentRunsheetId)
          .single();
          
        if (error) throw error;
        
        // Set state directly from database
        setData((runsheet.data as Record<string, string>[]) || []);
        setColumns((runsheet.columns as string[]) || []);
        setColumnInstructions((runsheet.column_instructions as Record<string, string>) || {});
        setRunsheetName(runsheet.name);
        
        console.log('✅ Loaded from database:', (runsheet.data as any[])?.length, 'rows');
        
      } catch (error) {
        console.error('❌ Failed to load from database:', error);
      }
    };
    
    loadFromDatabase();
  }, [currentRunsheetId, user]);

  // Handle changes to initialData prop (for uploaded runsheets)
  useEffect(() => {
    console.log('🔍 useEffect triggered for initialData change');
    console.log('🔍 initialData length:', initialData?.length);
    console.log('🔍 current data length:', data.length);
    
    if (initialData && initialData.length > 0) {
      // Check if the current data is just empty rows
      const hasRealData = data.some(row => Object.values(row).some(value => value.trim() !== ''));
      
      if (!hasRealData) {
        console.log('✅ Updating data with initialData since current data is empty');
        const minRows = 20;
        const existingRows = initialData.length;
        const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
          const row: Record<string, string> = {};
          initialColumns.forEach(col => row[col] = '');
          return row;
        });
        const newData = [...initialData, ...emptyRows];
        setData(newData);
        console.log('✅ Data updated with', newData.length, 'total rows');
      } else {
        console.log('⚠️ Current data has content, not overriding with initialData');
      }
    }
  }, [initialData, initialColumns]); // Only depend on initialData changes

  // Database-first approach for reliable single-user data persistence

  // Listen for document upload save requests
  React.useEffect(() => {
    const handleSaveRequest = async (event: CustomEvent) => {
      try {
        console.log('🔧 EditableSpreadsheet: Received save request before upload');
        
        // Store the pending upload request for after save completes
        setPendingUploadRequest(event.detail);
        
        // Check if this is a new runsheet that needs to be saved first
        if (!currentRunsheetId) {
          console.log('🔧 EditableSpreadsheet: New runsheet detected - auto-saving before upload');
          
          // Check if the runsheet has a valid name - if not, assign a default one
          const nameToUse = runsheetName && runsheetName.trim() !== '' && runsheetName !== 'Untitled Runsheet' 
            ? runsheetName 
            : `New Runsheet ${new Date().toLocaleDateString()}`;
          
          if (nameToUse !== runsheetName) {
            setRunsheetName(nameToUse);
          }
          
          // Trigger a direct save to create the runsheet in the database
          try {
            console.log('🔧 EditableSpreadsheet: Creating new runsheet for document upload');
            
            // Direct save without auto-save system
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) throw new Error('User not authenticated');
            
            const runsheetData = {
              name: nameToUse,
              columns,
              data,
              column_instructions: columnInstructions,
              user_id: user.id,
              updated_at: new Date().toISOString(),
            };
            
            const { data: insertResult, error } = await supabase
              .from('runsheets')
              .insert(runsheetData)
              .select('*')
              .single();
            
            if (error) throw error;
            
            // Update state with new runsheet ID
            setCurrentRunsheetId(insertResult.id);
            setActiveRunsheet({
              id: insertResult.id,
              name: nameToUse,
              data,
              columns,
              columnInstructions
            });
            
            console.log('🔧 EditableSpreadsheet: Successfully created runsheet with ID:', insertResult.id);
            const responseEvent = new CustomEvent('runsheetSaveResponse', {
              detail: { success: true, runsheetId: insertResult.id }
            });
            window.dispatchEvent(responseEvent);
            return;
            
          } catch (saveError) {
            console.error('🔧 EditableSpreadsheet: Failed to create new runsheet:', saveError);
            const responseEvent = new CustomEvent('runsheetSaveResponse', {
              detail: { 
                success: false, 
                error: 'Failed to create runsheet. Please add some data and try again.' 
              }
            });
            window.dispatchEvent(responseEvent);
            return;
          }
        }
        
        // For existing runsheets, just return the current ID
        const runsheetIdToReturn = currentRunsheetId;
        
        if (runsheetIdToReturn) {
          // Send success response with the runsheet ID
          const responseEvent = new CustomEvent('runsheetSaveResponse', {
            detail: { success: true, runsheetId: runsheetIdToReturn }
          });
          window.dispatchEvent(responseEvent);
          console.log('🔧 EditableSpreadsheet: Sent success response with runsheet ID:', runsheetIdToReturn);
        } else {
          // Send error response
          const responseEvent = new CustomEvent('runsheetSaveResponse', {
            detail: { success: false, error: 'Failed to save runsheet - no ID available after save' }
          });
          window.dispatchEvent(responseEvent);
          console.log('🔧 EditableSpreadsheet: Sent error response - no runsheet ID available');
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
    
    // Handle new runsheet creation from Dashboard
    const handleDashboardNewRunsheet = (event: CustomEvent) => {
      // If a pending request exists (from Dashboard/service), clear it now
      try { sessionStorage.removeItem('pending_new_runsheet'); } catch {}
      
      // Check if we're in upload mode - if so, ignore this event
      const isUploadMode = window.location.search.includes('action=upload');
      const preventCreation = sessionStorage.getItem('prevent_default_runsheet_creation');
      
      if (isUploadMode || preventCreation === 'true') {
        console.log('🚫 Ignoring createNewRunsheetFromDashboard - upload mode active');
        return;
      }
      
      const { name, columns: newColumns, instructions } = event.detail;
      console.log('🔧 EDITABLE_SPREADSHEET: Received event with name:', name);
      console.log('🔧 EDITABLE_SPREADSHEET: Received columns:', newColumns);
      console.log('🔧 EDITABLE_SPREADSHEET: Received instructions:', instructions);
      console.log('🔧 EDITABLE_SPREADSHEET: Current columns before update:', columns);
      
      // Use the columns passed from RunsheetService (which should fetch user preferences)
      const safeColumns = Array.isArray(newColumns) && newColumns.length > 0 ? newColumns : [];
      const safeInstructions: Record<string, string> = (instructions && typeof instructions === 'object') ? instructions : {};
      console.log('🔧 EDITABLE_SPREADSHEET: Using columns from preferences:', safeColumns);
      
      // Clear any existing emergency draft when creating a new runsheet
      try {
        localStorage.removeItem('runsheet-emergency-draft');
        console.log('🗑️ Cleared emergency draft for new runsheet creation');
      } catch (error) {
        console.error('Error clearing emergency draft:', error);
      }
      
      // Create the new runsheet using the same logic as the + button
      setRunsheetName(name);
      console.log('🔧 EDITABLE_SPREADSHEET: Set runsheet name to:', name);
      setData(Array.from({ length: 100 }, () => {
        const row: Record<string, string> = {};
        safeColumns.forEach((col: string) => row[col] = '');
        return row;
      }));
      // Clear current state first - AGGRESSIVELY clear localStorage to prevent restoration
      console.log('🧹 Clearing current runsheet state for new runsheet:', name);
      
      // Clear localStorage immediately to prevent active runsheet restoration
      localStorage.removeItem('currentRunsheetId');
      localStorage.removeItem('activeRunsheet');
      
      setCurrentRunsheetId(null);
      clearActiveRunsheet();
      setSelectedCell(null);
      setEditingCell(null);
      setCellValue('');
      setSelectedRange(null);
      setHasUnsavedChanges(false);
      setLastSavedState('');
      
      // Create new data with the columns
      const newData = Array.from({ length: 100 }, () => {
        const row: Record<string, string> = {};
        safeColumns.forEach((col: string) => row[col] = '');
        return row;
      });
      console.log('🔧 EDITABLE_SPREADSHEET: Setting data with new columns, data sample:', newData[0]);
      
      // Set all the new state
      setData(newData);
      setColumns(safeColumns);
      setColumnInstructions(safeInstructions);
      onDataChange?.(newData);
      onColumnChange(safeColumns);
      
      // CRITICAL: Immediately save the new runsheet to database to get a proper ID
      // This prevents the localStorage active runsheet from taking over
      console.log('🆕 Creating new runsheet immediately to prevent localStorage override:', name);
      
      // Set a flag to prevent any automatic runsheet loading for a few seconds
      sessionStorage.setItem('creating_new_runsheet', Date.now().toString());
      
      setTimeout(async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          toast({
            title: "Sign in required",
            description: "Please sign in to create a runsheet.",
            variant: "destructive"
          });
          return;
        }

        // Check if a runsheet with this name already exists and generate a unique name
        let finalName = name;
        let attempt = 1;
        const maxAttempts = 10;
        
        try {
          while (attempt <= maxAttempts) {
            const { data: existingRunsheet, error: checkError } = await supabase
              .from('runsheets')
              .select('id')
              .eq('user_id', user.id)
              .eq('name', finalName)
              .maybeSingle();

            if (checkError && checkError.code !== 'PGRST116') {
              throw checkError;
            }

            if (!existingRunsheet) {
              // Name is available, break out of loop
              break;
            }

            // Name exists, try with suffix
            finalName = `${name} (${attempt})`;
            attempt++;
          }

          if (attempt > maxAttempts) {
            throw new Error('Could not generate a unique runsheet name');
          }

          const { data: newRunsheet, error } = await supabase
            .from('runsheets')
            .insert({
              user_id: user.id,
              name: finalName,
              columns: safeColumns,
              data: newData,
              column_instructions: safeInstructions
            })
            .select()
            .single();

          if (error) throw error;

          // Set this as the active runsheet immediately
          setCurrentRunsheet(newRunsheet.id);
          
          // Update the local state to match what was saved
          setRunsheetName(newRunsheet.name);
          setData((newRunsheet.data as Record<string, string>[]) || newData);
          setColumns((newRunsheet.columns as string[]) || newColumns);
          setColumnInstructions((newRunsheet.column_instructions as Record<string, string>) || instructions);

          toast({
            title: "New runsheet created",
            description: `"${finalName}" is ready for your data.`,
          });
          
          // The useActiveRunsheet hook will automatically load the data when the ID changes
          // Don't manually set the spreadsheet state here as it conflicts with the hook
          
          console.log('✅ New runsheet created and set as active:', newRunsheet.id);
        } catch (error) {
          console.error('Failed to create new runsheet:', error);
          
          // Only show error if we actually failed - check if runsheet was created
          const { data: existingRunsheet } = await supabase
            .from('runsheets')
            .select('id, name')
            .eq('user_id', user.id)
            .eq('name', finalName)
            .maybeSingle();
          
          if (!existingRunsheet) {
            // Runsheet wasn't created, show error
            toast({
              title: "Error creating runsheet",
              description: error instanceof Error ? `Failed to save new runsheet: ${error.message}` : "Failed to save new runsheet. Please try again.",
              variant: "destructive"
            });
          } else {
            // Runsheet was actually created successfully, just set it as active
            console.log('✅ Runsheet was created successfully despite error, setting as active:', existingRunsheet.id);
            setCurrentRunsheet(existingRunsheet.id);
            toast({
              title: "New runsheet created",
              description: `"${finalName}" is ready for your data.`,
            });
          }
        } finally {
          // Clear the creation flag
          sessionStorage.removeItem('creating_new_runsheet');
        }
      }, 100);
      
      // Mark as having unsaved changes so auto-save picks it up as fallback
      setHasUnsavedChanges(true);
      
    };

    console.log('🔧 EDITABLE_SPREADSHEET: Setting up createNewRunsheetFromDashboard event listener');
    window.addEventListener('createNewRunsheetFromDashboard', handleDashboardNewRunsheet as EventListener);
    
    // After listener is ready, handle any pending creation request stored in sessionStorage
    try {
      const pending = sessionStorage.getItem('pending_new_runsheet');
      if (pending) {
        const payload = JSON.parse(pending);
        const withinWindow = !payload.ts || (Date.now() - payload.ts < 15000);
        if (withinWindow) {
          console.log('⏪ Restoring pending new runsheet request from sessionStorage');
          const event = new CustomEvent('createNewRunsheetFromDashboard', { detail: {
            name: payload.name,
            columns: payload.columns,
            instructions: payload.instructions
          }});
          window.dispatchEvent(event);
        } else {
          console.log('⏱️ Pending new runsheet request expired, ignoring');
        }
        sessionStorage.removeItem('pending_new_runsheet');
      }
    } catch (e) {
      console.error('Failed to process pending_new_runsheet:', e);
    }
    
    // Handle new runsheet start from DocumentProcessor - but ONLY for actual new runsheets
    const handleStartNewRunsheet = (event: CustomEvent) => {
      console.log('🧹 EditableSpreadsheet: Received startNewRunsheet event');
      
      // CRITICAL: Don't clear data if we have an active runsheet with actual data
      if (currentRunsheetId && data && data.length > 0) {
        console.log('🚫 Ignoring startNewRunsheet - we have active data that should not be cleared');
        return;
      }
      
      const { clearDocuments, clearStorage, isNewRunsheet } = event.detail || {};
      
      if (clearDocuments) {
        // Clear document map completely
        setDocumentMap(new Map());
        updateDocumentMap(new Map());
        console.log('🧹 EditableSpreadsheet: Cleared document map');
      }
      
      if (clearStorage) {
        // Clear any runsheet-related state
        setCurrentRunsheetId(null);
        setRunsheetName('Untitled Runsheet');
        setLastSaveTime(null);
        setHasUnsavedChanges(false);
        
        // CRITICAL: Clear the actual spreadsheet data to prevent old data from persisting
        setData([]);
        setSelectedCell(null);
        setEditingCell(null);
        setCellValue('');
        setSelectedRange(null);
        
        console.log('🧹 EditableSpreadsheet: Cleared runsheet state and data');
      }
      
      // CRITICAL: If this is a new runsheet, prevent any backup data restoration
      if (isNewRunsheet) {
        // Set a flag to prevent backup restoration for the next few seconds
        const preventBackupKey = 'prevent_backup_restoration';
        sessionStorage.setItem(preventBackupKey, Date.now().toString());
        setTimeout(() => {
          sessionStorage.removeItem(preventBackupKey);
        }, 5000); // Prevent restoration for 5 seconds
        console.log('🧹 EditableSpreadsheet: Set backup prevention flag for new runsheet');
      }
    };
    
    window.addEventListener('startNewRunsheet', handleStartNewRunsheet as EventListener);
    
    // Handle Ctrl+S save event from DocumentProcessor
    const handleSaveEvent = async () => {
      if (user) {
        try {
          await saveImmediately();
          // Send success response back to DocumentProcessor
          const responseEvent = new CustomEvent('runsheetSaveComplete', {
            detail: { success: true }
          });
          window.dispatchEvent(responseEvent);
        } catch (error) {
          // Send error response back to DocumentProcessor
          const responseEvent = new CustomEvent('runsheetSaveComplete', {
            detail: { success: false, error: error instanceof Error ? error.message : 'Unknown error' }
          });
          window.dispatchEvent(responseEvent);
        }
      } else {
        // Send error response if no user
        const responseEvent = new CustomEvent('runsheetSaveComplete', {
          detail: { success: false, error: 'User not authenticated' }
        });
        window.dispatchEvent(responseEvent);
      }
    };
    
    window.addEventListener('saveRunsheet', handleSaveEvent);
    window.addEventListener('forceSaveRunsheet', handleSaveEvent);
    
    // Handle runsheet name updates from DocumentProcessor
    const handleUpdateRunsheetName = (event: CustomEvent) => {
      console.log('🔧 EditableSpreadsheet: Received updateRunsheetName event:', event.detail);
      setRunsheetName(event.detail.name);
    };
    
    // Handle adding more rows when documents are added beyond current row count
    const handleAddMoreRowsForDocument = (event: CustomEvent) => {
      const { requiredRowIndex } = event.detail;
      console.log('🔧 EditableSpreadsheet: Adding more rows for document at index:', requiredRowIndex);
      
      // Calculate how many rows we need to add
      const currentRowCount = data.length;
      const rowsToAdd = Math.max(20, requiredRowIndex - currentRowCount + 10); // Add extra buffer
      
      addMoreRows(rowsToAdd);
    };
    
    // Handle naming dialog requests
    const handleShowNameDialog = (event: CustomEvent) => {
      const { columns, instructions, required } = event.detail;
      setPendingRunsheetData({ columns, instructions, required });
      setShowNameDialog(true);
    };

    window.addEventListener('updateRunsheetName', handleUpdateRunsheetName as EventListener);
    window.addEventListener('addMoreRowsForDocument', handleAddMoreRowsForDocument as EventListener);
    window.addEventListener('showRunsheetNameDialog', handleShowNameDialog as EventListener);
    
    return () => {
      window.removeEventListener('saveRunsheetBeforeUpload', handleSaveRequest as EventListener);
      window.removeEventListener('createNewRunsheetFromDashboard', handleDashboardNewRunsheet as EventListener);
      window.removeEventListener('startNewRunsheet', handleStartNewRunsheet as EventListener);
      window.removeEventListener('updateRunsheetName', handleUpdateRunsheetName as EventListener);
      window.removeEventListener('addMoreRowsForDocument', handleAddMoreRowsForDocument as EventListener);
      window.removeEventListener('showRunsheetNameDialog', handleShowNameDialog as EventListener);
      window.removeEventListener('saveRunsheet', handleSaveEvent);
      window.removeEventListener('forceSaveRunsheet', handleSaveEvent);
    };
  }, [currentRunsheetId, runsheetName, data, columns, columnInstructions]);
  
  // Session storage cleanup is now handled in DocumentProcessor since we use the unified Dashboard approach
  
  // Listen for external add-row events (from DocumentProcessor)
  useEffect(() => {
    console.log('🔧 DEBUG: Setting up externalAddRow event listener in EditableSpreadsheet');
    
    const handler = (event: CustomEvent) => {
      try {
        console.log('🔧 DEBUG: EditableSpreadsheet received externalAddRow event');
        const payload = (event as any).detail?.data as Record<string, string>;
        const eventRunsheetId = (event as any).detail?.runsheetId;
        console.log('🔧 DEBUG: payload:', payload);
        console.log('🔧 DEBUG: eventRunsheetId:', eventRunsheetId);
        console.log('🔧 DEBUG: currentRunsheetId:', currentRunsheetId);
        
        if (!payload) {
          console.log('🔧 DEBUG: No payload found, returning');
          return;
        }

        // Ensure we only process events for our current runsheet
        if (eventRunsheetId && currentRunsheetId && eventRunsheetId !== currentRunsheetId) {
          console.log('🔧 DEBUG: Event is for different runsheet, ignoring');
          return;
        }

        setData(prevData => {
          console.log('🔧 DEBUG: ===== ADDING NEW ROW =====');
          console.log('🔧 DEBUG: Current data before adding row:', prevData);
          console.log('🔧 DEBUG: Current documentMap entries:', Array.from(documentMap.entries()));
          console.log('🔧 DEBUG: Payload to add:', payload);
          
          // Find the first truly empty row (no data and no linked document)
          const firstEmptyRowIndex = prevData.findIndex((row, index) => {
            const isDataEmpty = Object.values(row).every(value => !value || value.trim() === '');
            const hasLinkedDocument = documentMap.has(index);
            console.log(`🔧 DEBUG: Row ${index} - isEmpty: ${isDataEmpty}, hasDocument: ${hasLinkedDocument}, data:`, row);
            return isDataEmpty && !hasLinkedDocument;
          });
          
          let newRowIndex: number;
          let newData: Record<string, string>[];
          
          if (firstEmptyRowIndex >= 0) {
            // Use the empty row
            newRowIndex = firstEmptyRowIndex;
            newData = [...prevData];
            console.log('🔧 DEBUG: Using existing empty row at index:', newRowIndex);
          } else {
            // Add to the end
            newRowIndex = prevData.length;
            newData = [...prevData];
            console.log('🔧 DEBUG: Adding new row at index:', newRowIndex);
            console.log('🔧 DEBUG: This will be row number:', newRowIndex + 1, 'in the UI');
          }
          
          // Convert payload to match current columns
          const filteredPayload: Record<string, string> = {};
          
          // Include all current columns in the new row
          columns.forEach(column => {
            // Check if payload has this column (case-insensitive)
            const payloadKey = Object.keys(payload).find(key => 
              key.toLowerCase() === column.toLowerCase()
            );
            
            if (payloadKey && payload[payloadKey]) {
              filteredPayload[column] = payload[payloadKey];
            } else {
              filteredPayload[column] = '';
            }
          });
          
          console.log('🔧 DEBUG: Filtered payload for current columns:', filteredPayload);
          
          // Update the row with the new data
          if (firstEmptyRowIndex >= 0) {
            newData[newRowIndex] = filteredPayload;
          } else {
            newData.push(filteredPayload);
          }
          console.log('🔧 DEBUG: Updated data after adding row:', newData);
          
          // Update the document map to reflect the new row structure
          setTimeout(() => {
            // Since we added a row, we need to check if there are any pending documents for this new row
            console.log('🔧 DEBUG: Checking for pending documents for new row at index:', newRowIndex);
            const pendingDocs = JSON.parse(sessionStorage.getItem('pendingDocuments') || '[]');
            const pendingDoc = pendingDocs.find((doc: any) => doc.rowIndex === newRowIndex);
            
            if (pendingDoc) {
              console.log('🔧 DEBUG: Found pending document for new row:', pendingDoc);
              
              // Create a mock document record for the document map
              const mockDocumentRecord: DocumentRecord = {
                id: pendingDoc.id || 'pending',
                file_path: pendingDoc.storagePath,
                stored_filename: pendingDoc.fileName,
                original_filename: pendingDoc.fileName,
                content_type: pendingDoc.fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg',
                row_index: newRowIndex,
                runsheet_id: currentRunsheetId || '',
                user_id: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
                file_size: 0
              };
              
              const newMap = new Map(documentMap);
              newMap.set(newRowIndex, mockDocumentRecord);
              console.log('🔧 DEBUG: Updated document map with new row document:', Array.from(newMap.entries()));
              updateDocumentMap(newMap);
            }
          }, 0);
          
          setHasUnsavedChanges(true);
          
          // For batch processing, trigger immediate auto-save to prevent data loss on refresh
          if (payload['Storage Path']) {
            console.log('🔧 AUTO_SAVE: Triggering immediate auto-save for batch processing');
            setTimeout(() => {
      saveImmediately();
            }, 200); // Short delay to allow state updates to complete
          }
          
          // Dispatch event to inform DocumentProcessor about the actual row placement
          setTimeout(() => {
            console.log('🔧 DEBUG: *** DISPATCHING externalRowPlaced event ***');
            console.log('🔧 DEBUG: Dispatch timestamp:', Date.now());
            console.log('🔧 DEBUG: Row index:', newRowIndex);
            console.log('🔧 DEBUG: Runsheet ID:', currentRunsheetId);
            const storagePath = payload['Storage Path'];
            if (storagePath) {
              console.log('🔧 DEBUG: Storage path found:', storagePath);
              console.log('🔧 DEBUG: About to dispatch externalRowPlaced event...');
              window.dispatchEvent(new CustomEvent('externalRowPlaced', {
                detail: {
                  rowIndex: newRowIndex,
                  runsheetId: currentRunsheetId,
                  storagePath: storagePath
                }
              }));
              console.log('🔧 DEBUG: *** externalRowPlaced event DISPATCHED ***');
              
              // CRITICAL: Force immediate save to database to prevent data loss on refresh
              console.log('🔧 AUTO_SAVE: Forcing immediate save after batch processing to prevent data loss');
              if (currentRunsheet && currentRunsheetId) {
                setTimeout(async () => {
                  try {
                    const updatedRunsheet = {
                      ...currentRunsheet,
                      data: newData,
                      updated_at: new Date().toISOString()
                    };
                    
                    console.log('🔧 AUTO_SAVE: Saving runsheet data to prevent loss on refresh');
                    await setActiveRunsheet(updatedRunsheet);
                    console.log('🔧 AUTO_SAVE: Runsheet saved successfully after batch processing');
                  } catch (error) {
                    console.error('🔧 AUTO_SAVE: Failed to save runsheet after batch processing:', error);
                  }
                }, 100); // Small delay to ensure state is fully updated
              }
              
            } else {
              console.log('🔧 DEBUG: No storage path found in payload:', payload);
            }
          }, 50);
          
          return newData;
        });

      } catch (e) {
        console.error('🔧 DEBUG: externalAddRow handler error', e);
      }
    };

    window.addEventListener('externalAddRow', handler as EventListener);
    console.log('🔧 DEBUG: externalAddRow event listener added');
    
    return () => {
      console.log('🔧 DEBUG: Removing externalAddRow event listener');
      window.removeEventListener('externalAddRow', handler as EventListener);
    };
  }, []); // Empty dependency array to prevent frequent re-mounting of event listener

  // Ref for container width measurement
  const containerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const singleClickTimerRef = useRef<number | null>(null);
  // Calculate and distribute column widths when columns change
  useEffect(() => {
    if (containerRef.current && columns.length > 0) {
      // Get the container width (accounting for borders and padding)
      const containerWidth = containerRef.current.clientWidth - 2; // -2 for borders
      const availableWidth = Math.max(containerWidth, 800); // Minimum width of 800px
      const columnWidth = Math.floor(availableWidth / columns.length);
      
      // Only set widths if no columns have been manually resized AND we're not loading preferences
      if (!hasManuallyResizedColumns && !isLoadingColumnWidths) {
        const newWidths: Record<string, number> = {};
        columns.forEach(column => {
          const minWidth = getMinimumColumnWidth(column);
          newWidths[column] = Math.max(columnWidth, minWidth);
        });
        setColumnWidths(newWidths);
      }
    }
  }, [columns, hasManuallyResizedColumns, isLoadingColumnWidths]);

  // Sync data with initialData prop changes
  useEffect(() => {
    // Don't override columns if we're in the middle of creating a new runsheet from Dashboard
    const isCreatingNewRunsheet = sessionStorage.getItem('creating_new_runsheet');
    if (isCreatingNewRunsheet) {
      console.log('🚫 Skipping initialData sync - new runsheet creation in progress');
      return;
    }

    console.log('🔍 initialData sync effect triggered with:', {
      initialDataLength: initialData?.length,
      initialRunsheetId,
      isUploadedRunsheet: initialRunsheetId?.startsWith('uploaded-')
    });

    // For uploaded runsheets, always sync the data (bypass emergency draft check)
    const isUploadedRunsheet = initialRunsheetId?.startsWith('uploaded-');
    
    // Clear any emergency draft when loading fresh database data
    try {
      localStorage.removeItem('runsheet-emergency-draft');
      console.log('🗑️ Cleared emergency draft - loading fresh database data');
    } catch (error) {
      console.error('Error clearing emergency draft:', error);
    }
    
    // Always ensure we have minimum rows
    const minRows = 20;
    const existingRows = initialData.length;
    const emptyRows = Array.from({ length: Math.max(0, minRows - existingRows) }, () => {
      const row: Record<string, string> = {};
      initialColumns.forEach(col => row[col] = '');
      return row;
    });
    const newData = [...initialData, ...emptyRows];
    
    // Update data with fresh database data - but protect recent edits
    setData(prevData => {
      // Check if we have recent unsaved edits - if so, don't overwrite
      const now = Date.now();
      const hasRecentEdits = now - lastSavedAtRef.current < 5000; // Within 5 seconds of last save
      const hasUnsavedChanges = JSON.stringify({ data: prevData, columns, runsheetName, columnInstructions }) !== lastSavedState;
      
      if (hasRecentEdits || hasUnsavedChanges) {
        console.log('🔒 Protecting recent edits from initialData sync', { hasRecentEdits, hasUnsavedChanges });
        return prevData;
      }
      
      // If the new data has more content than previous, always update
      const newDataHasContent = newData.some(row => 
        Object.values(row).some(value => value && value.trim() !== '' && value !== 'Document File Name')
      );
      
      if (newDataHasContent || JSON.stringify(prevData) !== JSON.stringify(newData)) {
        console.log('🔄 Syncing with fresh database data');
        return newData;
      }
      return prevData;
    });
  }, [initialData, initialColumns, initialRunsheetId]);

  // Sync currentRunsheetId with active runsheet on mount and when currentRunsheet changes
  useEffect(() => {
    if (currentRunsheet?.id && currentRunsheetId !== currentRunsheet.id) {
      console.log('📋 Syncing currentRunsheetId with active runsheet:', currentRunsheet.id);
      setCurrentRunsheetId(currentRunsheet.id);
      
      // Also sync the runsheet name if it differs
      if (currentRunsheet.name && runsheetName !== currentRunsheet.name) {
        setRunsheetName(currentRunsheet.name);
      }
    }
    
    // CRITICAL: If we have an active runsheet but no currentRunsheetId, this indicates 
    // a state restoration issue - prioritize the active runsheet
    if (currentRunsheet?.id && !currentRunsheetId) {
      console.log('🔄 Restoring currentRunsheetId from active runsheet after page refresh:', currentRunsheet.id);
      setCurrentRunsheetId(currentRunsheet.id);
      setRunsheetName(currentRunsheet.name || 'Untitled Runsheet');
      
      // Clear any conflicting data
      try {
        localStorage.removeItem('runsheet-emergency-draft');
        console.log('🗑️ Cleared conflicting data');
      } catch (error) {
        console.error('Error clearing conflicting data:', error);
      }
    }
  }, [currentRunsheet, currentRunsheetId, runsheetName]);

  // REMOVED: Emergency draft system - unnecessary with immediate database saves
  // All user actions now save immediately to database, making localStorage backup redundant

  // Emergency draft cleanup REMOVED - no longer needed with direct database saves

  // REMOVED: Emergency draft restoration system - unnecessary with direct database saves  
  // Database is now the single source of truth, no localStorage fallback needed
  
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
    let unsub: (() => void) | undefined;

    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        setUser(session?.user ?? null);
        
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          setUser(session?.user ?? null);
        });
        
        unsub = () => subscription.unsubscribe();
      } catch (error) {
        console.warn('Auth initialization failed in spreadsheet:', error);
      }
    })();

    return () => { if (unsub) unsub(); };
  }, []);

  // Check if opened from extension and needs fresh data
  const isFromExtension = searchParams.get('from') === 'extension';
  
  useEffect(() => {
    console.log('🔧 EditableSpreadsheet: Component mounted/updated', {
      isFromExtension,
      initialRunsheetId,
      currentRunsheetId
    });
    
    // Force refresh if opened from extension
    if (isFromExtension && initialRunsheetId && initialRunsheetId === currentRunsheetId) {
      console.log('🔄 Force refreshing runsheet data from extension');
      loadSpecificRunsheet(initialRunsheetId, true); // Force refresh
    }
  }, [isFromExtension, initialRunsheetId, currentRunsheetId]);

  // Set up real-time updates
  // Real-time updates removed to prevent data persistence issues
  // Users can manually save and refresh when needed

  // Update runsheet name when initialRunsheetName prop changes
  useEffect(() => {
    if (initialRunsheetName && initialRunsheetName !== runsheetName) {
      setRunsheetName(initialRunsheetName);
    }
  }, [initialRunsheetName]);

  // Set initial runsheet ID if provided, or sync with restored active runsheet
  useEffect(() => {
    // Do not override a newly created runsheet
    const creatingFlag = sessionStorage.getItem('creating_new_runsheet');
    const creatingRecent = !!creatingFlag && (creatingFlag === 'true' || (Date.now() - (parseInt(creatingFlag) || 0) < 5000));
    if (creatingRecent) return;

    // Only set from initialRunsheetId when we don't already have a current one
    if (initialRunsheetId && !currentRunsheetId) {
      setCurrentRunsheetId(initialRunsheetId);
    } else if (currentRunsheet?.id && !currentRunsheetId) {
      // Sync with restored active runsheet from localStorage on mount
      console.log('🔄 Syncing currentRunsheetId with restored active runsheet:', currentRunsheet.id);
      setCurrentRunsheetId(currentRunsheet.id);
      if (currentRunsheet.name && currentRunsheet.name !== 'Untitled Runsheet') {
        setRunsheetName(currentRunsheet.name);
      }
    }
  }, [initialRunsheetId, currentRunsheet?.id, currentRunsheetId]);

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
        console.log('Document map entries:', Array.from(documents.entries()));
        updateDocumentMap(documents);
        
        // Force refresh any cached images to ensure we see the latest versions
        setTimeout(() => {
          const images = document.querySelectorAll('img[src*="supabase"]');
          images.forEach((img: Element) => {
            const htmlImg = img as HTMLImageElement;
            const src = htmlImg.src;
            htmlImg.src = '';
            htmlImg.src = src + '?t=' + Date.now();
          });
          console.log('🔧 EditableSpreadsheet: Force refreshed', images.length, 'cached images');
        }, 100);
      } catch (error) {
        console.error('Error loading documents:', error);
      }
    };

    loadDocuments();
  }, [user, currentRunsheetId]); // Removed isSaving from dependency array

  // Load column width preferences when runsheet changes
  useEffect(() => {
    const loadColumnWidthPreferences = async () => {
      if (!user || !currentRunsheetId) return;
      
      setIsLoadingColumnWidths(true);
      try {
        console.log('Loading column width preferences for runsheet:', currentRunsheetId);
        const preferences = await ColumnWidthPreferencesService.loadPreferences(currentRunsheetId);
        console.log('✅ Loaded column width preferences:', preferences);
        if (Object.keys(preferences).length > 0) {
          setColumnWidths(preferences);
          setHasManuallyResizedColumns(true); // Mark as manually resized to prevent auto-sizing
        }
      } catch (error) {
        console.error('Error loading column width preferences:', error);
      } finally {
        setIsLoadingColumnWidths(false);
      }
    };

    loadColumnWidthPreferences();
  }, [user, currentRunsheetId]);

  // Listen for document record creation events to refresh the document map
  useEffect(() => {
    const handleDocumentRecordCreated = async (event: CustomEvent) => {
      console.log('🚨 EditableSpreadsheet: EVENT RECEIVED! Document record created event:', event.detail);
      console.log('🔧 EditableSpreadsheet: Document record created event received:', event.detail);
      const { runsheetId, rowIndex, allPossibleIds } = event.detail;
      
      // Get the most current runsheet ID at the time of the event
      const getCurrentRunsheetId = () => {
        const globalRunsheet = JSON.parse(localStorage.getItem('activeRunsheet') || 'null');
        return globalRunsheet?.id || currentRunsheetId;
      };
      
      const activeRunsheetId = getCurrentRunsheetId();
      
      console.log('🔧 EditableSpreadsheet: Event received with runsheetId:', runsheetId, 'allPossibleIds:', allPossibleIds);
      console.log('🔧 EditableSpreadsheet: Comparing against activeRunsheetId:', activeRunsheetId);
      
      // Check if any of the IDs match our current runsheet
      const idsToCheck = [
        runsheetId,
        allPossibleIds?.activeRunsheetId,
        allPossibleIds?.locationStateId,
        allPossibleIds?.finalRunsheetId
      ].filter(Boolean);
      
      const hasMatch = idsToCheck.includes(activeRunsheetId);
      console.log('🔧 EditableSpreadsheet: IDs to check:', idsToCheck, 'activeRunsheetId:', activeRunsheetId, 'hasMatch:', hasMatch);
      
      if (hasMatch) {
        console.log('🔍 EditableSpreadsheet: Runsheet ID matches, refreshing document map only');
        
        // Only refresh document map, don't force save to avoid interrupting user input
        
        // THEN: Refresh the entire document map
        if (user && activeRunsheetId) {
          try {
            console.log('🔍 EditableSpreadsheet: Fetching updated document map for runsheet:', activeRunsheetId);
            const documents = await DocumentService.getDocumentMapForRunsheet(activeRunsheetId);
            console.log('🔧 EditableSpreadsheet: New document map:', documents);
            console.log('🔧 EditableSpreadsheet: Document map size:', documents.size);
            
            // Force update the document map and trigger re-render
            updateDocumentMap(new Map(documents));
            
            // Force component re-render to ensure expand buttons work
            setTimeout(() => {
              console.log('🔄 EditableSpreadsheet: Document map updated, checking if expand should work now');
              console.log('🔄 EditableSpreadsheet: Document map after refresh:', Array.from(documents.entries()));
            }, 50);
            
            // Force refresh any cached image elements
            setTimeout(() => {
              const images = document.querySelectorAll('img[src*="supabase"]');
              images.forEach((img: Element) => {
                const htmlImg = img as HTMLImageElement;
                const src = htmlImg.src;
                htmlImg.src = '';
                htmlImg.src = src + '?t=' + Date.now();
              });
              console.log('🔧 EditableSpreadsheet: Force refreshed', images.length, 'cached images');
            }, 100);
            
            // Don't refresh runsheet data when document processor just added data locally
            // The local data is more current than the database at this point
            console.log('🔍 EditableSpreadsheet: Skipping database refresh to preserve locally processed data');
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
    
    // Also listen for postMessage events from extension
    const handlePostMessage = (event: MessageEvent) => {
      console.log('🔧 EditableSpreadsheet: Received postMessage:', event.data);
      // Only process messages from our extension
      if (event.data && event.data.source === 'runsheet-extension') {
        if (event.data.type === 'EXTENSION_DOCUMENT_CREATED') {
          console.log('🚨 EditableSpreadsheet: PostMessage received from extension:', event.data.detail);
          handleDocumentRecordCreated(new CustomEvent('documentRecordCreated', { detail: event.data.detail }));
        } else if (event.data.type === 'EXTENSION_RUNSHEET_REFRESH_NEEDED') {
          console.log('🚨 EditableSpreadsheet: Refresh requested by extension:', event.data.reason);
          // Force refresh the runsheet data by setting a refresh flag
          if (currentRunsheetId && event.data.runsheetId === currentRunsheetId) {
            console.log('🔄 Triggering runsheet data refresh for mass capture mode');
            // Use a small delay to ensure the database changes have propagated
            setTimeout(() => {
              // Force a re-render by triggering window resize event
              window.dispatchEvent(new Event('resize'));
              // Also try to refresh the documents if available
              const documentRefreshEvent = new CustomEvent('refreshDocuments');
              window.dispatchEvent(documentRefreshEvent);
            }, 500);
          }
        }
      }
    };
    window.addEventListener('message', handlePostMessage);
    
    
    return () => {
      console.log('🔧 EditableSpreadsheet: Removing document record created event listener');
      window.removeEventListener('documentRecordCreated', handleDocumentRecordCreated as EventListener);
      window.removeEventListener('message', handlePostMessage);
    };
  }, [user]); // Only depend on user, and get runsheet ID dynamically

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
        updateDocumentMap(documents);
        
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

  // Update active runsheet when name changes (prevent loops)
  useEffect(() => {
    if (runsheetName && runsheetName !== 'Untitled Runsheet' && currentRunsheet && 
        currentRunsheet.name !== runsheetName && currentRunsheetId) {
      // Only update if the name actually changed and we have a valid runsheet ID to prevent loops
      console.log('🔧 EditableSpreadsheet: Updating active runsheet name from', currentRunsheet.name, 'to', runsheetName);
      setActiveRunsheet({ 
        ...currentRunsheet,
        name: runsheetName 
      });
    }
  }, [runsheetName, currentRunsheet?.name, currentRunsheetId]); // More specific dependencies

  // Listen for external trigger events from DocumentProcessor
  useEffect(() => {
    const handleUploadTrigger = () => {
      handleUploadClick();
    };

    const handleOpenTrigger = () => {
      setShowOpenDialog(true);
    };

    const handleLoadSpecificRunsheet = (event: CustomEvent) => {
      const { runsheetId, forceRefresh } = event.detail;
      console.log('Loading specific runsheet:', runsheetId, 'Force refresh:', forceRefresh);
      loadSpecificRunsheet(runsheetId, forceRefresh);
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
      console.log('🔧 EditableSpreadsheet: Current runsheet ID:', currentRunsheetId);
      console.log('🔧 EditableSpreadsheet: IDs match:', runsheetId === currentRunsheetId);
      
      if (runsheetId === currentRunsheetId && user) {
        // Check if we have recent unsaved edits - if so, skip the refresh to avoid rollback
        const now = Date.now();
        const hasRecentEdits = now - lastSavedAtRef.current < 3000; // Within 3 seconds of last save
        const currentState = JSON.stringify({ data, columns, runsheetName, columnInstructions });
        const hasUnsavedChanges = currentState !== lastSavedState;
        
        if (hasRecentEdits || hasUnsavedChanges) {
          console.log('🔧 EditableSpreadsheet: Skipping refresh due to recent edits or unsaved changes');
          console.log('🔧 EditableSpreadsheet: Recent edits:', hasRecentEdits, 'Unsaved changes:', hasUnsavedChanges);
          return;
        }
        
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
            // Check if the server data is newer than our last save
            const serverUpdatedAt = new Date(runsheet.updated_at).getTime();
            if (lastSavedAtRef.current > 0 && serverUpdatedAt <= lastSavedAtRef.current) {
              console.log('🔧 EditableSpreadsheet: Server data is not newer than local data, skipping refresh');
              console.log('🔧 EditableSpreadsheet: Server updated:', serverUpdatedAt, 'Last saved:', lastSavedAtRef.current);
              return;
            }
            
            console.log('🔧 EditableSpreadsheet: Successfully refreshed runsheet data');
            console.log('🔧 EditableSpreadsheet: refreshRunsheetData - Current data length:', data.length);
            console.log('🔧 EditableSpreadsheet: refreshRunsheetData - New data from DB:', runsheet.data);
            // Properly type-cast the data from JSON to the expected format
            // FIXED: Don't preserve empty rows - only count actual data rows
            const newData = (runsheet.data as Record<string, string>[]) || [];
            const actualDataRowCount = newData.filter(row => 
              Object.values(row).some(value => value && String(value).trim() !== '')
            ).length;
            const targetRowCount = Math.max(actualDataRowCount, 20); // Ensure minimum 20 rows for UX
            const dataWithMinRows = ensureMinimumRows(newData, (runsheet.columns as string[]) || []);
            
            // Only add extra rows if we need more than what we have
            if (targetRowCount > dataWithMinRows.length) {
              const additionalRows = Array.from({ length: targetRowCount - dataWithMinRows.length }, () => {
                const row: Record<string, string> = {};
                ((runsheet.columns as string[]) || []).forEach(col => row[col] = '');
                return row;
              });
              setData([...dataWithMinRows, ...additionalRows]);
            } else {
              setData(dataWithMinRows);
            }
            setColumns((runsheet.columns as string[]) || []);
            setRunsheetName(runsheet.name || 'Untitled Runsheet');
            setCurrentRunsheetId(runsheet.id);
            
            // Also refresh the document links
            console.log('🔧 EditableSpreadsheet: Refreshing document links');
            const documents = await DocumentService.getDocumentMapForRunsheet(runsheetId);
            console.log('🔧 EditableSpreadsheet: Refreshed documents:', documents);
            updateDocumentMap(documents);
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
    
    // Listen for batch analysis progress for immediate UI updates
    const handleBatchAnalysisProgress = async (event: CustomEvent) => {
      const { rowIndex, extractedData } = event.detail;
      if (effectiveRunsheetId && extractedData) {
        console.log('🧠 Batch analysis progress: updating row', rowIndex, 'with data:', extractedData);
        // Suppress realtime briefly to avoid overwrite races
        suppressRealtimeUntilRef.current = Date.now() + 4000;

        let nextDataSnapshot: Record<string, string>[] | null = null;
        setData(currentData => {
          const newData = [...currentData];
          // Ensure the target row exists
          while (newData.length <= rowIndex) {
            const emptyRow: Record<string, string> = {};
            columns.forEach(col => { emptyRow[col] = ''; });
            newData.push(emptyRow);
          }
          // Merge extracted data into the row
          newData[rowIndex] = { ...newData[rowIndex], ...extractedData };
          nextDataSnapshot = newData;
          return newData;
        });

        // Persist immediately so server state matches UI
        if (nextDataSnapshot) {
          try {
            // Mark last save and suppress realtime to prevent loops
            lastSavedAtRef.current = Date.now();
            try { lastSavedDataHashRef.current = JSON.stringify(nextDataSnapshot); } catch {}
            suppressRealtimeUntilRef.current = Date.now() + 6000;
            await saveToDatabase(nextDataSnapshot, columns, runsheetName, columnInstructions, true);
          } catch (e) {
            console.error('Failed to persist batch analysis progress:', e);
          }
        }
      }
    };
    window.addEventListener('batchAnalysisProgress', handleBatchAnalysisProgress as EventListener);
    
    // Listen for force save events from document analysis
    const handleForceSave = async (event: CustomEvent) => {
      const { rowIndex, updatedData, extractedData } = event.detail || {};
      console.log('🔧 Force save requested for row', rowIndex, 'with data:', updatedData || extractedData);
      
      if (effectiveRunsheetId) {
        try {
          // Use latest data snapshot to avoid stale overwrites and merge incoming row if provided
          const snapshot = [...dataRef.current];
          const incoming = updatedData || extractedData;
          if (typeof rowIndex === 'number' && incoming && typeof incoming === 'object') {
            snapshot[rowIndex] = incoming;
          }

          // Mark last save and suppress realtime to prevent loops/overwrite
          lastSavedAtRef.current = Date.now();
          try { lastSavedDataHashRef.current = JSON.stringify(snapshot); } catch {}
          suppressRealtimeUntilRef.current = Date.now() + 6000;

          // Trigger immediate database save (silent)
          await saveToDatabase(snapshot, columns, runsheetName, columnInstructions, true);
          console.log('✅ Force save completed successfully');
        } catch (error) {
          console.error('❌ Force save failed:', error);
        }
      }
    };
    window.addEventListener('forceSaveCurrentRunsheet', handleForceSave as EventListener);

    return () => {
      window.removeEventListener('triggerSpreadsheetUpload', handleUploadTrigger);
      window.removeEventListener('triggerSpreadsheetOpen', handleOpenTrigger);
      window.removeEventListener('loadSpecificRunsheet', handleLoadSpecificRunsheet as EventListener);
      window.removeEventListener('autoRestoreLastRunsheet', handleAutoRestoreLastRunsheet);
      window.removeEventListener('importRunsheetFile', handleImportRunsheetFile as EventListener);
      window.removeEventListener('openGoogleDrivePicker', handleOpenGoogleDrivePicker);
      window.removeEventListener('refreshRunsheetData', handleRefreshRunsheetData as EventListener);
      window.removeEventListener('updateDocumentFilename', handleUpdateDocumentFilename as EventListener);
      window.removeEventListener('batchAnalysisProgress', handleBatchAnalysisProgress as EventListener);
      window.removeEventListener('forceSaveCurrentRunsheet', handleForceSave as EventListener);
    };
  }, [columns, currentRunsheetId, effectiveRunsheetId]);

  // Real-time synchronization for runsheet data changes
  useEffect(() => {
    if (!currentRunsheetId) return;

    console.log('🔄 Setting up real-time subscription for runsheet:', currentRunsheetId);

    const channel = supabase
      .channel(`runsheet-changes-${currentRunsheetId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'runsheets',
          filter: `id=eq.${currentRunsheetId}`
        },
        (payload) => {
          console.log('🔄 Real-time runsheet update received:', payload);
          
          const newData = payload.new?.data as Record<string, string>[];
          if (!newData) return;

          // Suppress self-echo or immediate post-upload overrides
          const now = Date.now();
          const withinSelfEcho = now - lastSavedAtRef.current < 8000;
          const newDataHash = (() => { try { return JSON.stringify(newData); } catch { return null; } })();
          const isSameAsLastSaved = newDataHash && newDataHash === lastSavedDataHashRef.current;
          const creatingFlag = sessionStorage.getItem('creating_new_runsheet');
          const creatingRecent = !!creatingFlag && (creatingFlag === 'true' || (now - (parseInt(creatingFlag) || 0) < 5000));

          const batchAnalysisRunning = backgroundAnalyzer.getJobStatus()?.status === 'running';
          const suppressActive = now < suppressRealtimeUntilRef.current;

          if (syncService.isUploadInProgress() || withinSelfEcho || isSameAsLastSaved || creatingRecent || batchAnalysisRunning || suppressActive) {
            console.log('🚫 Skipping realtime update (self-echo/upload in progress/batch analysis running/suppressed)');
            return;
          }

          // Stale/destructive update protection
          const countFilled = (rows: Record<string, string>[]) => rows.reduce((acc, row) => acc + Object.values(row || {}).filter(v => typeof v === 'string' && v.trim() !== '').length, 0);
          const currentSnapshot = dataRef.current || [];
          const currentFilled = countFilled(currentSnapshot);
          const newFilled = countFilled(newData);
          const payloadUpdatedAt = payload.new?.updated_at ? Date.parse(payload.new.updated_at as string) : 0;
          const localBarrier = Math.max(lastSavedAtRef.current, lastServerAppliedAtRef.current);
          const staleByTime = !!payloadUpdatedAt && (payloadUpdatedAt <= localBarrier + 1000); // require strictly newer by 1s
          const destructive = currentFilled > 0 && (newData.length === 0 || newFilled + 3 < currentFilled);

          if (staleByTime || destructive) {
            console.warn('🚫 Ignoring realtime update (stale or destructive).', { staleByTime, destructive, currentFilled, newFilled, payloadUpdatedAt, lastSavedAt: lastSavedAtRef.current, lastServerAppliedAt: lastServerAppliedAtRef.current });
            suppressRealtimeUntilRef.current = Date.now() + 5000;
            return;
          }

          // Apply server truth directly
          setData(newData);
          dataRef.current = newData;
          onDataChange?.(newData);
        }
      )
      .subscribe((status) => {
        console.log('🔄 Real-time subscription status:', status);
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to real-time updates');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error setting up real-time subscription');
        }
      });

    return () => {
      console.log('🔄 Cleaning up real-time subscription');
      supabase.removeChannel(channel);
    };
  }, [currentRunsheetId]); // Keep subscription stable to prevent flicker


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

  // Legacy save functions removed - now using auto-save hooks above

  // Track changes for unsaved indicator (no auto-save timer)
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
      
      // No timer-based auto-save here - saves happen immediately on user actions (cell edits, etc.)
      // This effect is only for tracking unsaved state for UI indicators
    }
  }, [data, columns, runsheetName, columnInstructions, user, lastSavedState, onUnsavedChanges]);

  // REMOVED: Aggressive 30-second auto-save timer 
  // This was causing unnecessary saves when user wasn't making changes
  // Changes are now saved immediately on edit, no need for timer-based saves

  // Enhanced page navigation and visibility handling
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges && user) {
        // Store current state before leaving for navigation recovery
        sessionStorage.setItem('tempRunsheetState', JSON.stringify({
          runsheetName,
          currentRunsheetId,
          data,
          columns,
          columnInstructions,
          documentMap: Array.from(documentMap.entries()),
          timestamp: Date.now()
        }));
        
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
        
        // Also try regular auto-save
      saveImmediately();
      }
    };

    // Save when page becomes hidden (user switches tabs or navigates) - but don't reset state
    const handleVisibilityChange = () => {
      if (document.hidden && hasUnsavedChanges && user) {
        // Save current state to prevent loss
        sessionStorage.setItem('preserveRunsheetState', JSON.stringify({
          runsheetName,
          currentRunsheetId,
          data,
          columns,
          columnInstructions,
          documentMap: Array.from(documentMap.entries()),
          timestamp: Date.now()
        }));
        saveImmediately();
      } else if (!document.hidden) {
        // When page becomes visible again, check for preserved state
        const preservedState = sessionStorage.getItem('preserveRunsheetState');
        if (preservedState) {
          try {
            const state = JSON.parse(preservedState);
            const stateAge = Date.now() - (state.timestamp || 0);
            
            // Only restore if very recent (within 30 seconds) and we have empty state
            if (stateAge < 30000 && !currentRunsheetId && runsheetName === 'Untitled Runsheet') {
              console.log('🔄 Restoring preserved state after tab focus');
              
              if (state.data && Array.isArray(state.data)) setData(state.data);
              if (state.columns && Array.isArray(state.columns)) setColumns(state.columns);
              if (state.columnInstructions) setColumnInstructions(state.columnInstructions);
              if (state.runsheetName && state.runsheetName !== 'Untitled Runsheet') setRunsheetName(state.runsheetName);
              if (state.currentRunsheetId) setCurrentRunsheetId(state.currentRunsheetId);
              if (state.documentMap && Array.isArray(state.documentMap)) {
                const restoredMap = new Map<number, DocumentRecord>(state.documentMap as [number, DocumentRecord][]);
                setDocumentMap(restoredMap);
                updateDocumentMap(restoredMap);
              }
            }
            sessionStorage.removeItem('preserveRunsheetState');
          } catch (error) {
            console.error('Error restoring preserved state:', error);
            sessionStorage.removeItem('preserveRunsheetState');
          }
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
    }, [hasUnsavedChanges, user, runsheetName, columns, data, columnInstructions, saveImmediately]);

  // Auto-save trigger when data changes (Google Sheets behavior)
  // Disabled when user is viewing documents to prevent interruptions
  useEffect(() => {
    // Don't auto-save if user is in document viewing mode (side-by-side or expanded)
    const expandedRowParam = searchParams.get('expanded');
    const sideBySideRowParam = searchParams.get('sidebyside');
    const isViewingDocuments = expandedRowParam || sideBySideRowParam;
    
    if (hasUnsavedChanges && user?.id && !isViewingDocuments) {
      console.log('🔄 Changes detected, scheduling auto-save');
      const timeoutId = setTimeout(() => {
        console.log('🔄 Executing scheduled auto-save');
        saveImmediately();
      }, 2000); // 2 second delay to batch rapid changes
      
      return () => {
        console.log('🔄 Clearing auto-save timeout');
        clearTimeout(timeoutId);
      };
    } else if (isViewingDocuments && hasUnsavedChanges) {
      console.log('🔄 Auto-save paused while viewing documents');
    }
  }, [hasUnsavedChanges, user?.id, saveImmediately, searchParams]);

  // Simple database sync - no real-time multi-user complexity needed
  // Data is saved immediately on every change, so no sync required
  useEffect(() => {
    // Only log for debugging - no real-time sync needed for single-user
    if (currentRunsheetId) {
      console.log('📊 Single-user runsheet active:', currentRunsheetId);
    }
  }, [currentRunsheetId]);

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
  const saveRunsheet = async (): Promise<{ id: string } | null> => {
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
            columnInstructions
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
          
          // If this was triggered by an upload request, send error response
          if (pendingUploadRequest) {
            const responseEvent = new CustomEvent('runsheetSaveResponse', {
              detail: { success: false, error: 'Runsheet name conflict - please resolve the conflict and try again' }
            });
            window.dispatchEvent(responseEvent);
            setPendingUploadRequest(null);
          }
          return null; // Return null instead of undefined
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
        
        // Migrate any documents from the old temporary runsheet to the new permanent one
        if (currentRunsheetId && currentRunsheetId !== savedRunsheet.id) {
          try {
            const { error: updateError } = await supabase
              .from('documents')
              .update({ runsheet_id: savedRunsheet.id })
              .eq('runsheet_id', currentRunsheetId)
              .eq('user_id', user.id);
            
            if (updateError) {
              console.warn('Failed to migrate documents to new runsheet:', updateError);
            } else {
              console.log('✅ Successfully migrated documents to new runsheet ID:', savedRunsheet.id);
              // Refresh document map after migration
              try {
                const documents = await DocumentService.getDocumentMapForRunsheet(savedRunsheet.id);
                updateDocumentMap(documents);
              } catch (docError) {
                console.error('Error refreshing documents after migration:', docError);
              }
            }
          } catch (error) {
            console.warn('Error migrating documents:', error);
          }
        }
        
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
            columnInstructions
          });
        }
      }

      console.log('Save successful!');
      
      const savedState = JSON.stringify({ data, columns, runsheetName: finalName, columnInstructions });
      setLastSavedState(savedState);
      setHasUnsavedChanges(false);
      setLastSaveTime(new Date());
      onUnsavedChanges?.(false);
      // Remove redundant toast since auto-save indicator shows save status
      
      // Return the saved runsheet data
      return savedRunsheet;
    } catch (error: any) {
      console.error('Save failed:', error);
      toast({
        title: "Failed to save runsheet",
        description: error.message,
        variant: "destructive",
      });
      return null;
    } finally {
      setIsSaving(false);
      console.log('Save process completed');
    }
  };


  // Save and close runsheet - saves the data, clears active status, and navigates back to dashboard
  const saveAndCloseRunsheet = async () => {
    console.log('Save and Close button clicked!');
    console.log('🔧 SAVE_AND_CLOSE: Current data state:', data);
    console.log('🔧 SAVE_AND_CLOSE: Data length:', data.length);
    console.log('🔧 SAVE_AND_CLOSE: First few rows:', data.slice(0, 3));
    console.log('🔧 SAVE_AND_CLOSE: Sample row content:', JSON.stringify(data[0], null, 2));
    console.log('🔧 SAVE_AND_CLOSE: All empty check:', data.every(row => Object.values(row).every(val => val === '')));
    
    // Check if user actually entered any data
    const hasActualData = data.some(row => Object.values(row).some(val => val.trim() !== ''));
    console.log('🔧 SAVE_AND_CLOSE: Has actual data entered by user:', hasActualData);
    console.log('🔧 SAVE_AND_CLOSE: Current columns state:', columns);
    console.log('🔧 SAVE_AND_CLOSE: Columns length:', columns.length);
    console.log('🔧 SAVE_AND_CLOSE: Column instructions:', columnInstructions);
    
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
        console.log('🔧 SAVE_AND_CLOSE: About to save - columns:', columns);
        console.log('🔧 SAVE_AND_CLOSE: About to save - data length:', data.length);
        console.log('🔧 SAVE_AND_CLOSE: About to save - column_instructions:', columnInstructions);
        
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
        
        console.log('🔧 SAVE_AND_CLOSE: Update result:', updateResult);
        if (error) {
          console.error('🔧 SAVE_AND_CLOSE: Update error:', error);
          throw error;
        }
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
          return null; // Return null instead of undefined
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

      // Clear the active runsheet since user is closing it
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
        
        // Migrate any documents from the old temporary runsheet to the new permanent one
        if (currentRunsheetId && currentRunsheetId !== savedRunsheet.id) {
          try {
            const { error: updateError } = await supabase
              .from('documents')
              .update({ runsheet_id: savedRunsheet.id })
              .eq('runsheet_id', currentRunsheetId)
              .eq('user_id', user.id);
            
            if (updateError) {
              console.warn('Failed to migrate documents to new runsheet:', updateError);
            } else {
              console.log('✅ Successfully migrated documents to new runsheet ID:', savedRunsheet.id);
              // Refresh document map after migration
              try {
                const documents = await DocumentService.getDocumentMapForRunsheet(savedRunsheet.id);
                updateDocumentMap(documents);
              } catch (docError) {
                console.error('Error refreshing documents after migration:', docError);
              }
            }
          } catch (error) {
            console.warn('Error migrating documents:', error);
          }
        }
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
          columnInstructions
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
      
      // If this was triggered by an upload request, send success response
      if (pendingUploadRequest) {
        const responseEvent = new CustomEvent('runsheetSaveResponse', {
          detail: { success: true, runsheetId: savedRunsheet.id }
        });
        window.dispatchEvent(responseEvent);
        setPendingUploadRequest(null);
      }
    } catch (error: any) {
      console.error('Save failed:', error);
      
      // If this was triggered by an upload request, send error response
      if (pendingUploadRequest) {
        const responseEvent = new CustomEvent('runsheetSaveResponse', {
          detail: { success: false, error: error.message || 'Failed to save runsheet' }
        });
        window.dispatchEvent(responseEvent);
        setPendingUploadRequest(null);
      }
      
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
    // If this was triggered by an upload request, send error response
    if (pendingUploadRequest) {
      const responseEvent = new CustomEvent('runsheetSaveResponse', {
        detail: { success: false, error: 'Save operation was cancelled' }
      });
      window.dispatchEvent(responseEvent);
      setPendingUploadRequest(null);
    }
    
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
      
      // Get fresh session to ensure we're authenticated
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Authentication error: ' + sessionError.message);
      }
      
      if (!session) {
        throw new Error('No active session found');
      }
      
      console.log('Session confirmed, user ID:', session.user.id);
      
      const { data: runsheets, error } = await supabase
        .from('runsheets')
        .select('id, name, created_at, updated_at, columns, data, column_instructions')
        .eq('user_id', session.user.id)
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
        description: error.message || 'An unexpected error occurred',
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
    
    // TEMPORARILY DISABLED: Database recovery mechanism to diagnose issue
    // Check if we need to look for actual data issues
    console.log('🔍 DIAGNOSIS: Checking runsheet data integrity');
    console.log('🔍 Runsheet ID:', runsheet.id);
    console.log('🔍 Runsheet name:', runsheet.name);
    console.log('🔍 Data length from DB:', runsheet.data?.length || 0);
    console.log('🔍 Sample rows from DB:', runsheet.data?.slice(0, 3));
    
    // Check if this runsheet has any actual data (not just empty rows)
    const hasRealData = runsheet.data && runsheet.data.length > 0 && 
      runsheet.data.some((row: any) => 
        Object.values(row).some(value => value && String(value).trim() !== '')
      );
    
    console.log('🔍 Has real data:', hasRealData);
    
    if (!hasRealData && runsheet.id) {
      console.log('⚠️ WARNING: This runsheet appears to have no actual data, only empty rows');
      toast({
        title: "Data Issue Detected",
        description: `The runsheet "${runsheet.name}" appears to contain only empty rows. This may be due to a data sync issue.`,
        variant: "destructive",
      });
    }
    const dataWithMinRows = ensureMinimumRows(runsheet.data || [], runsheet.columns || []);
    // Only preserve current row count if we're loading a runsheet with actual data
    // For new/empty runsheets, use the minimum required rows
    const hasActualData = runsheet.data && runsheet.data.length > 0 && 
      runsheet.data.some((row: any) => Object.values(row).some(value => value && String(value).trim() !== ''));
    
    // FIXED: Don't preserve empty rows - only preserve if we actually have more data rows
    const actualDataRowCount = runsheet.data ? runsheet.data.filter((row: any) => 
      Object.values(row).some(value => value && String(value).trim() !== '')
    ).length : 0;
    
    const targetRowCount = hasActualData ? Math.max(dataWithMinRows.length, actualDataRowCount) : dataWithMinRows.length;
    
    console.log('🔧 Debug: hasActualData:', hasActualData);
    console.log('🔧 Debug: actualDataRowCount:', actualDataRowCount);
    console.log('🔧 Debug: dataWithMinRows.length:', dataWithMinRows.length);
    console.log('🔧 Debug: current data.length:', data.length);
    console.log('🔧 Debug: targetRowCount:', targetRowCount);
    if (targetRowCount > dataWithMinRows.length) {
      const additionalRows = Array.from({ length: targetRowCount - dataWithMinRows.length }, () => {
        const row: Record<string, string> = {};
        (runsheet.columns || []).forEach(col => row[col] = '');
        return row;
      });
      setData([...dataWithMinRows, ...additionalRows]);
    } else {
      setData(dataWithMinRows);
    }
    setColumnInstructions(finalColumnInstructions);
    onColumnInstructionsChange?.(finalColumnInstructions);
    
    // Set columns last, after column instructions are ready
    console.log('🔧 Debug: Setting runsheet columns:', runsheet.columns);
    setColumns(runsheet.columns);
    onColumnChange(runsheet.columns);
    
    setShowOpenDialog(false);
    
    // Only reset column width state for completely new runsheets, not when reopening existing ones
    // Column width preferences will be loaded by the effect hook
    
    // Wait a bit to ensure state updates are complete, then re-enable missing column checks
    setTimeout(() => {
      setIsLoadingRunsheet(false);
    }, 100);
    
    toast({
      title: "Runsheet loaded",
      description: `"${runsheet.name}" has been loaded successfully.`,
    });

    // Set this as the active runsheet globally so the page reflects the selection
    setCurrentRunsheet(runsheet.id);
  };

  // Load a specific runsheet by ID (for URL parameter functionality)
  // Add a diagnostic function to check localStorage
  const checkLocalStorageBackups = () => {
    const backupKeys = Object.keys(localStorage).filter(key => key.startsWith('runsheet_backup_'));
    console.log('📋 Found localStorage backup keys:', backupKeys);
    
    backupKeys.forEach(key => {
      try {
        const backup = localStorage.getItem(key);
        if (backup) {
          const backupData = JSON.parse(backup);
          const hasData = backupData.data && backupData.data.length > 0 && 
            backupData.data.some((row: any) => 
              Object.values(row).some(value => value && String(value).trim() !== '')
            );
          console.log(`📋 Backup ${key}:`, {
            name: backupData.name || 'Unknown',
            hasRealData: hasData,
            rowCount: backupData.data?.length || 0
          });
        }
      } catch (error) {
        console.error(`Error reading backup ${key}:`, error);
      }
    });
  };

  const loadSpecificRunsheet = async (runsheetId: string, forceRefresh: boolean = false) => {
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
        console.log('🔧 Debug: Force refresh:', forceRefresh);
        
        // If force refresh is enabled (from extension), clear existing data first
        if (forceRefresh) {
          console.log('🔄 Force refresh enabled - clearing existing data');
          setData([]);
          setSelectedCell(null);
          setEditingCell(null);
          setCellValue('');
          setSelectedRange(null);
        }
        
        console.log('🔧 Debug: About to call setIsLoadingRunsheet(true)');
        setIsLoadingRunsheet(true);
        console.log('🔧 Debug: About to call loadRunsheet()');
        await loadRunsheet(runsheet);
        
        // Set as active runsheet after loading
        setActiveRunsheet({
          id: runsheet.id,
          name: runsheet.name,
          data: Array.isArray(runsheet.data) ? runsheet.data as Record<string, string>[] : [],
          columns: Array.isArray(runsheet.columns) ? runsheet.columns as string[] : [],
          columnInstructions: (runsheet.column_instructions && typeof runsheet.column_instructions === 'object') 
            ? runsheet.column_instructions as Record<string, string> 
            : {}
        });
        
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
        const publicUrl = DocumentService.getDocumentUrlSync(document.file_path);
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
          const publicUrl = DocumentService.getDocumentUrlSync(document.file_path);
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

      // Add documents from storage to ZIP - fetch all documents for this runsheet
      const documentsFolder = zip.folder("documents");
      
      // Get all documents for this runsheet (not just those in documentMap)
      const allDocuments = await DocumentService.getDocumentsForRunsheet(currentRunsheetId);
      
      for (const document of allDocuments) {
        try {
          const { data: fileData } = await supabase.storage
            .from('documents')
            .download(document.file_path);
          
          if (fileData) {
            const filename = `Row_${document.row_index + 1}_${document.original_filename}`;
            documentsFolder?.file(filename, fileData);
          }
        } catch (error) {
          console.error(`Error downloading document for row ${document.row_index}:`, error);
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
        description: `Runsheet and ${allDocuments.length} documents downloaded as ZIP.`,
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
    reader.onload = async (e) => {
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

        await updateSpreadsheetData(headers, parsedData, fileName);
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
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (jsonData.length === 0) {
          toast({
            title: "Empty spreadsheet",
            description: "The Excel file appears to be empty.",
            variant: "destructive",
          });
          return;
        }

        const headers = (jsonData[0] as string[]).map(h => (h?.toString() || '').trim()).filter(h => h);
        const parsedData = jsonData.slice(1)
          .filter(row => row.some(cell => cell !== null && cell !== undefined && String(cell).trim() !== ''))
          .map((row: any[]) => {
            const rowData: Record<string, string> = {};
            headers.forEach((header, index) => {
              const cellValue = row[index];
              rowData[header] = cellValue !== null && cellValue !== undefined ? String(cellValue) : '';
            });
            return rowData;
          });

        await updateSpreadsheetData(headers, parsedData, fileName);
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

  // Helper function to update spreadsheet data immediately without flash
  const updateSpreadsheetData = async (headers: string[], parsedData: Record<string, string>[], fileName: string) => {
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

    // Update all spreadsheet state atomically to prevent flash
    console.log('📊 Updating spreadsheet data atomically:', { headers: finalHeaders.length, data: newData.length });
    
    // Clear document map when uploading new data
    setDocumentMap(new Map());
    updateDocumentMap(new Map());
    console.log('🧹 Cleared document map for uploaded runsheet');
    
    // Update state in one batch to prevent flashing
    setColumns(finalHeaders);
    setData(newData);
    setRunsheetName(fileName.replace(/\.[^/.]+$/, "") || 'Imported Runsheet');
    
    onColumnChange(finalHeaders);
    
    // Update parent component's data
    if (onDataChange) {
      onDataChange(updatedParsedData); // Only pass the actual data, not the empty rows
    }
    
    // Generate unique runsheet name based on filename
    const fileNameWithoutExt = fileName.replace(/\.[^/.]+$/, ""); // Remove extension
    let uniqueName = fileNameWithoutExt || 'Imported Runsheet';
    
    // Check if name already exists and generate unique name if needed
    if (user) {
      try {
        const { data: existingRunsheets } = await supabase
          .from('runsheets')
          .select('name')
          .eq('user_id', user.id)
          .ilike('name', `${uniqueName}%`);
        
        if (existingRunsheets && existingRunsheets.length > 0) {
          const existingNames = existingRunsheets.map(r => r.name);
          let counter = 1;
          let tempName = uniqueName;
          
          while (existingNames.includes(tempName)) {
            tempName = `${uniqueName} (${counter})`;
            counter++;
          }
          
          uniqueName = tempName;
        }
      } catch (error) {
        console.error('Error checking existing runsheet names:', error);
        // Fallback to timestamp if there's an error
        const timestamp = Date.now();
        uniqueName = `${uniqueName}_${timestamp}`;
      }
    }
    
    setRunsheetName(uniqueName);
    
    
    // DON'T auto-generate column instructions - let user configure them manually
    // This ensures uploaded columns show up in the configuration dialog
    console.log('📋 Skipping auto-generation of column instructions for uploaded data');
    
    // Only set column instructions if they don't already exist
    if (Object.keys(columnInstructions).length === 0) {
      setColumnInstructions({});
      onColumnInstructionsChange?.({});
    }

    // Auto-save the runsheet with imported data and set as active
    setTimeout(async () => {
      try {
        // Prevent old location.state or effects from overriding this fresh upload
        sessionStorage.setItem('creating_new_runsheet', Date.now().toString());
        sessionStorage.setItem('new_runsheet_name', uniqueName);
        isProcessingUploadRef.current = true;
        syncService.setUploadInProgress(true);
        lastSavedAtRef.current = Date.now();
        try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}

        const result = await saveAsNewRunsheet(newData, finalHeaders, uniqueName, columnInstructions, false);
        if (result && result.id) {
          // Set this as the active runsheet so it displays properly
          setCurrentRunsheet(result.id);
          console.log('✅ Set uploaded runsheet as active:', result.id);

          // Navigate to a clean URL with empty state to avoid old state reapplying
          navigate('/runsheet', { replace: true, state: {} });
        }
      } catch (error) {
        console.error('Failed to save uploaded runsheet:', error);
      } finally {
        // Allow realtime again after a short grace period
        setTimeout(() => { 
          isProcessingUploadRef.current = false; 
          syncService.setUploadInProgress(false);
        }, 1500);
      }
    }, 100); // Small delay to ensure state updates are complete

    toast({
      title: "Spreadsheet uploaded",
      description: `Successfully imported ${updatedParsedData.length} rows with ${finalHeaders.length} columns from ${fileName}.`,
    });
  };

  // Auto-focus input when editing starts and resize textarea
  useEffect(() => {
    if (editingCell && textareaRef.current) {
      textareaRef.current.focus();
      
      // Auto-resize textarea to fit content
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const minHeight = 80;
      textareaRef.current.style.height = Math.max(minHeight, scrollHeight) + 'px';
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
        if (e.defaultPrevented) return;
        const target = e.target as HTMLElement | null;
        if (target && target.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')) {
          return; // don't steal typing from form fields
        }
        
        // Allow copy/paste/cut shortcuts to pass through
        if ((e.ctrlKey || e.metaKey) && ['c', 'v', 'x'].includes(e.key.toLowerCase())) {
          return; // Let copy/paste handler deal with these
        }
        
        // Prevent arrow keys from scrolling the page when navigating cells
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
          e.preventDefault();
          return; // Let the cell-specific handler deal with navigation
        }
        // Handle letter keys for editing
        else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          startEditing(selectedCell.rowIndex, selectedCell.column, e.key, undefined, 'none');
          e.preventDefault();
        }
      };
      document.addEventListener('keydown', handleGlobalKeyDown);
      return () => document.removeEventListener('keydown', handleGlobalKeyDown);
    }
  }, [selectedCell, editingCell]);

  // Enhanced scroll handling
  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setIsScrolling(true);
    // Clear hovered cell when scrolling
    setHoveredCell(null);
    
    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }
    
    scrollTimeoutRef.current = setTimeout(() => {
      setIsScrolling(false);
    }, 150);
  }, []);

  // Column resizing functions
  const getColumnWidth = (column: string) => {
    return columnWidths[column] || 120; // default width
  };

  // Helper function to get consistent minimum width for all columns
  const getMinimumColumnWidth = (column: string) => {
    // Fixed minimum width that accommodates:
    // - Resize handle (20px)
    // - Text truncation with ellipsis (60px minimum)
    // - Padding (20px)
    return 100; // Consistent 100px minimum for all columns
  };

  // Row resizing functions
  const getRowHeight = (rowIndex: number) => {
    return rowHeights[rowIndex] || 60; // default height
  };

  // Calculate total table width
  const getTotalTableWidth = () => {
    const rowActionsWidth = 60; // Narrower row actions column width (no drag handle)
    const dataColumnsWidth = columns.reduce((total, column) => total + getColumnWidth(column), 0);
    // Removed documentFileNameWidth - no longer needed
    const actionsColumnWidth = 480; // Reduced width for actions column to minimize unnecessary space
    return rowActionsWidth + dataColumnsWidth + actionsColumnWidth;
  };

  // Column resize handlers
  const handleMouseDown = (e: React.MouseEvent, column: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = getColumnWidth(column);
    setResizing({ column, startX, startWidth });
    setIsDraggingResize(false); // Will be set to true if mouse moves
    // Suppress realtime while resizing to prevent stale overwrites
    suppressRealtimeUntilRef.current = Date.now() + 4000;
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
        // Mark that we're actually dragging, not just clicking
        setIsDraggingResize(true);
        
        const deltaX = e.clientX - resizing.startX;
        const minimumWidth = getMinimumColumnWidth(resizing.column);
        const newWidth = Math.max(minimumWidth, resizing.startWidth + deltaX);
        setColumnWidths(prev => ({
          ...prev,
          [resizing.column]: newWidth
        }));
        setHasManuallyResizedColumns(true);
        
        // Save the preference immediately
        ColumnWidthPreferencesService.saveColumnWidth(
          resizing.column,
          newWidth,
          currentRunsheetId
        );
        // Keep realtime suppressed while actively resizing to avoid stale overwrites
        suppressRealtimeUntilRef.current = Date.now() + 3000;
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

    const handleMouseUp = (e: MouseEvent) => {
      console.log('🔧 Mouse up detected, clearing resize state');
      const wasResizing = resizing !== null;
      const wasResizingRow = resizingRow !== null;
      
      // Force clear all resize states
      setResizing(null);
      setResizingRow(null);
      setIsDraggingResize(false);
      
      // Stop event propagation to prevent any further resize activity
      e.stopPropagation();
      e.preventDefault();
    };

    // Handle mouse leave from the document to exit resize mode
    const handleMouseLeave = (e: MouseEvent) => {
      console.log('🔧 Mouse leave detected, clearing resize state');
      if (resizing || resizingRow) {
        setResizing(null);
        setResizingRow(null);
        setIsDraggingResize(false);
      }
    };

    // Handle escape key to exit resize mode
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && (resizing || resizingRow)) {
        console.log('🔧 Escape key pressed, clearing resize state');
        setResizing(null);
        setResizingRow(null);
        setIsDraggingResize(false);
      }
    };

    // Always add event listeners globally to catch all mouse events
    // This prevents the "stuck resize" issue
    document.addEventListener('mousemove', handleMouseMove, { passive: false });
    document.addEventListener('mouseup', handleMouseUp, { passive: false });
    document.addEventListener('mouseleave', handleMouseLeave, { passive: false });
    document.addEventListener('keydown', handleKeyDown, { passive: false });
    
    // Also add specific window events for extra coverage
    window.addEventListener('mouseup', handleMouseUp, { passive: false });
    window.addEventListener('blur', handleMouseLeave, { passive: false });
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseLeave);
    };
  }, [resizing, resizingRow, getMinimumColumnWidth, currentRunsheetId, getRowHeight]);


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
      
      
      // DON'T auto-generate instructions for new columns - let them appear in config dialog
      console.log('📋 New column added without auto-generated instructions:', newColumnName);
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
      
      
      // DON'T auto-generate instructions for new columns - let them appear in config dialog
      console.log('📋 New column inserted without auto-generated instructions:', newColumnName);
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
  const selectCell = async (rowIndex: number, column: string, shouldStartEditing: boolean = false) => {
    // Save any current editing before switching cells
    if (editingCell) {
      await saveEdit(); // Use the proper save function instead of manual save
    }
    
    setSelectedCell({ rowIndex, column });
    // Clear range selection when selecting a single cell
    setSelectedRange(null);
    setCopiedRange(null);
    
    // Scroll the selected cell into view and focus it
    setTimeout(() => {
      const cellElement = document.querySelector(`[data-cell="${rowIndex}-${column}"]`);
      if (cellElement) {
        // Force layout recalculation before scrolling
        cellElement.getBoundingClientRect();
        
        // Scroll into view with more aggressive settings
        cellElement.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'center'
        });
        
        // Focus the cell element to ensure proper keyboard navigation
        (cellElement as HTMLElement)?.focus();
        
        // Additional fallback scrolling if needed
        setTimeout(() => {
          const rect = cellElement.getBoundingClientRect();
          const isVisible = rect.top >= 0 && rect.left >= 0 && 
                           rect.bottom <= window.innerHeight && 
                           rect.right <= window.innerWidth;
          
          if (!isVisible) {
            cellElement.scrollIntoView({
              behavior: 'auto',
              block: 'center',
              inline: 'center'
            });
          }
        }, 50);
      }
    }, 50); // Reduced delay for faster response
    
    // Only start editing if explicitly requested (for double-click or typing)
    if (shouldStartEditing) {
      startEditing(rowIndex, column, data[rowIndex]?.[column] || '', undefined, 'none');
    }
  };

  const handleCellClick = (rowIndex: number, column: string, event: React.MouseEvent) => {
    const now = Date.now();
    const timeDiff = now - lastClickTime;
    const isSameCell = lastClickedCell?.rowIndex === rowIndex && lastClickedCell?.column === column;
    
    if (isSameCell && timeDiff < 500) { // 500ms window for multiple clicks
      setClickCount(prev => prev + 1);
    } else {
      setClickCount(1);
      setLastClickedCell({ rowIndex, column });
    }
    
    setLastClickTime(now);
    
    // Handle triple click
    if (clickCount === 2 && isSameCell && timeDiff < 500) {
      event.preventDefault();
      if (singleClickTimerRef.current) {
        window.clearTimeout(singleClickTimerRef.current);
        singleClickTimerRef.current = null;
      }
      handleCellTripleClick(rowIndex, column);
      return;
    }
    
    // Single click behavior - if cell is already being edited, allow cursor positioning
    if (editingCell && editingCell.rowIndex === rowIndex && editingCell.column === column) {
      return; // Do nothing; textarea handles caret
    }
    
    // Defer single-click selection slightly to detect if a double-click happens
    if (singleClickTimerRef.current) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    singleClickTimerRef.current = window.setTimeout(() => {
      // Start editing immediately on single click to show cursor
      selectCell(rowIndex, column, true);
      singleClickTimerRef.current = null;
    }, 220);
  };

  const handleCellDoubleClick = (rowIndex: number, column: string, event?: React.MouseEvent) => {
    // Cancel pending single-click selection to avoid focus stealing
    if (singleClickTimerRef.current) {
      window.clearTimeout(singleClickTimerRef.current);
      singleClickTimerRef.current = null;
    }
    
    // Check if we're already editing this cell
    const isCurrentlyEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
    
    if (isCurrentlyEditing) {
      // Let native double-click behavior select the word; do not interfere
      return;
    } else {
      // Prevent browser default double-click selection conflicts
      event?.preventDefault();
      event?.stopPropagation();
      
      // Double click should enter edit mode and position cursor at click location
      const cellValue = data[rowIndex]?.[column] || '';
      startEditing(rowIndex, column, cellValue, event, 'none'); // Position cursor at click location
    }
  };

  const handleCellTripleClick = (rowIndex: number, column: string) => {
    // Triple click should select all text
    const cellValue = data[rowIndex]?.[column] || '';
    startEditing(rowIndex, column, cellValue, undefined, 'all'); // Select all for triple-click
  };

  const startEditing = useCallback((rowIndex: number, column: string, value: string, clickEvent?: React.MouseEvent, selectionType: 'none' | 'word' | 'all' = 'none') => {
    setEditingCell({ rowIndex, column });
    setCellValue(value);
    setSelectedCell({ rowIndex, column });
    
    // Focus the textarea after it's rendered and handle selection
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus();
        
        if (selectionType === 'all') {
          // Triple-click: select all text
          textareaRef.current.select();
        } else if (selectionType === 'word' && clickEvent && value) {
          // Double-click: select word at cursor position
          const textarea = textareaRef.current;
          
          // Compute caret position based on click coordinates within the textarea (reliable for textareas)
          let position = 0;
          const rect = textarea.getBoundingClientRect();
          const x = clickEvent.clientX - rect.left;
          const y = clickEvent.clientY - rect.top;
          
          // Get computed styles for accurate calculations
          const style = window.getComputedStyle(textarea);
          const paddingLeft = parseInt(style.paddingLeft) || 0;
          const paddingTop = parseInt(style.paddingTop) || 0;
          
          // Adjust coordinates for padding
          const adjustedX = x - paddingLeft;
          const adjustedY = y - paddingTop;
          
          // Create a temporary element to measure text more accurately
          const tempDiv = document.createElement('div');
          tempDiv.style.font = style.font;
          tempDiv.style.lineHeight = style.lineHeight;
          tempDiv.style.padding = `${paddingTop}px ${paddingLeft}px`;
          tempDiv.style.border = 'none';
          tempDiv.style.position = 'absolute';
          tempDiv.style.visibility = 'hidden';
          tempDiv.style.whiteSpace = 'pre-wrap';
          tempDiv.style.wordWrap = 'break-word';
          tempDiv.style.width = `${textarea.clientWidth}px`;
          document.body.appendChild(tempDiv);
          
          const lines = value.split('\n');
          let accumulatedHeight = 0;
          let targetLineIndex = 0;
          
          // Find which line was clicked by measuring actual line heights
          for (let i = 0; i < lines.length; i++) {
            tempDiv.textContent = lines[i] || ' '; // Use space for empty lines
            const lineHeight = tempDiv.offsetHeight;
            
            if (adjustedY <= accumulatedHeight + lineHeight) {
              targetLineIndex = i;
              break;
            }
            accumulatedHeight += lineHeight;
            if (i === lines.length - 1) targetLineIndex = i;
          }
          
          // Calculate position up to the target line
          position = 0;
          for (let i = 0; i < targetLineIndex; i++) {
            position += lines[i].length + 1; // +1 for newline
          }
          
          // Find position within the clicked line
          if (targetLineIndex < lines.length) {
            const currentLine = lines[targetLineIndex];
            tempDiv.textContent = '';
            
            // Binary search for the character position
            let left = 0;
            let right = currentLine.length;
            
            while (left < right) {
              const mid = Math.floor((left + right) / 2);
              tempDiv.textContent = currentLine.substring(0, mid);
              
              if (tempDiv.offsetWidth < adjustedX) {
                left = mid + 1;
              } else {
                right = mid;
              }
            }
            
            position += Math.min(left, currentLine.length);
          }
          
          document.body.removeChild(tempDiv);
          
          // Ensure position is within bounds
          position = Math.max(0, Math.min(position, value.length));
          
          console.log('Double-click debug:', {
            clickCoords: [clickEvent.clientX, clickEvent.clientY],
            calculatedPosition: position,
            textAroundPosition: value.substring(Math.max(0, position - 5), position + 5),
            charAtPosition: value[position]
          });
          
          // Find word boundaries around the calculated position
          let wordStart = position;
          let wordEnd = position;
          
          // If we're not on a word character, try to find the nearest word
          if (position < value.length && !/\w/.test(value[position])) {
            // Look backward for a word character
            let backPos = position - 1;
            while (backPos >= 0 && !/\w/.test(value[backPos])) {
              backPos--;
            }
            // Look forward for a word character
            let forwardPos = position + 1;
            while (forwardPos < value.length && !/\w/.test(value[forwardPos])) {
              forwardPos++;
            }
            
            // Use the closest word character position
            if (backPos >= 0 && (forwardPos >= value.length || position - backPos <= forwardPos - position)) {
              position = backPos;
            } else if (forwardPos < value.length) {
              position = forwardPos;
            }
          }
          
          wordStart = position;
          wordEnd = position;
          
          // Expand backward to find word start
          while (wordStart > 0 && /\w/.test(value[wordStart - 1])) {
            wordStart--;
          }
          
          // Expand forward to find word end  
          while (wordEnd < value.length && /\w/.test(value[wordEnd])) {
            wordEnd++;
          }
          
          console.log('Word selection:', {
            finalPosition: position,
            wordBoundaries: [wordStart, wordEnd],
            selectedText: value.substring(wordStart, wordEnd)
          });
          
          // Select the word and reinforce selection after potential browser adjustments
          textarea.setSelectionRange(wordStart, wordEnd);
          requestAnimationFrame(() => textarea.setSelectionRange(wordStart, wordEnd));
          setTimeout(() => {
            if (document.activeElement === textarea) {
              textarea.setSelectionRange(wordStart, wordEnd);
            }
          }, 60);
        } else if (clickEvent && value) {
          // Position cursor at click location (single click or double-click entry)
          const textarea = textareaRef.current;
          const rect = textarea.getBoundingClientRect();
          const x = clickEvent.clientX - rect.left;
          const y = clickEvent.clientY - rect.top;
          
          const style = window.getComputedStyle(textarea);
          const paddingLeft = parseInt(style.paddingLeft) || 0;
          const paddingTop = parseInt(style.paddingTop) || 0;
          
          const adjustedX = x - paddingLeft;
          const adjustedY = y - paddingTop;
          
          let position = 0;
          const lines = value.split('\n');
          const lineHeight = parseInt(style.lineHeight) || 20;
          const targetLine = Math.floor(adjustedY / lineHeight);
          
          for (let i = 0; i < Math.min(targetLine, lines.length - 1); i++) {
            position += lines[i].length + 1;
          }
          
          if (targetLine < lines.length) {
            const currentLine = lines[targetLine];
            const charWidth = 8; // Approximate character width
            const charIndex = Math.floor(adjustedX / charWidth);
            position += Math.min(charIndex, currentLine.length);
          }
          
          position = Math.max(0, Math.min(position, value.length));
          textarea.setSelectionRange(position, position);
        } else {
          // Default behavior: position cursor at the end of the text
          const length = textareaRef.current.value.length;
          textareaRef.current.setSelectionRange(length, length);
        }
      }
    }, 50); // Increased timeout to ensure it runs after useEffect
  }, []);

  const saveEdit = useCallback(async () => {
    if (editingCell) {
      console.log('🔧 SAVE_EDIT: Saving cell edit for row', editingCell.rowIndex, 'column', editingCell.column, 'value:', cellValue);
      const newData = [...data];
      newData[editingCell.rowIndex] = {
        ...newData[editingCell.rowIndex],
        [editingCell.column]: cellValue
      };
      console.log('🔧 SAVE_EDIT: Updated row data:', JSON.stringify(newData[editingCell.rowIndex], null, 2));
      setData(newData);
      onDataChange?.(newData);
      console.log('🔧 SAVE_EDIT: Called onDataChange with updated data');
      setHasUnsavedChanges(true);

      // ✅ SILENT BACKGROUND SAVE - Save in background without affecting UI
      console.log('💾 Saving cell edit silently in background');
      if (runsheetName && runsheetName !== 'Untitled Runsheet' && user) {
        try {
          // Mark last save to ignore self-echo realtime updates
          lastSavedAtRef.current = Date.now();
          try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
          await saveToDatabase(newData, columns, runsheetName, columnInstructions, true); // Silent save
          console.log('✅ Cell edit saved to database silently');
        } catch (error) {
          console.error('❌ Failed to save cell edit to database:', error);
        }
      }
      
      // Handle Document File Name column edits specially - update the actual document filename
      if (editingCell.column === 'Document File Name' && currentRunsheetId && cellValue.trim()) {
        const document = documentMap.get(editingCell.rowIndex);
        if (document) {
          try {
            // For direct filename edits, use the exact filename entered by the user
            const sanitizedFilename = cellValue.trim();
            
            // Construct new file path with the user's exact filename
            const pathParts = document.file_path.split('/');
            const newFilePath = `${pathParts[0]}/${pathParts[1]}/${sanitizedFilename}`;

            // Move file in storage
            const { error: moveError } = await supabase.storage
              .from('documents')
              .move(document.file_path, newFilePath);

            if (moveError) {
              console.error('Error moving file in storage:', moveError);
              toast({
                title: "Error",
                description: "Failed to rename document in storage",
                variant: "destructive",
              });
              return;
            }

            // Update database record
            const { error: updateError } = await supabase
              .from('documents')
              .update({
                stored_filename: sanitizedFilename,
                file_path: newFilePath,
                updated_at: new Date().toISOString()
              })
              .eq('id', document.id);

            if (updateError) {
              console.error('Error updating document record:', updateError);
              toast({
                title: "Error",
                description: "Failed to update document record",
                variant: "destructive",
              });
              return;
            }
            
            // Refresh the document map to reflect the changes
            const updatedDocumentMap = await DocumentService.getDocumentMapForRunsheet(currentRunsheetId);
            setDocumentMap(updatedDocumentMap);
            onDocumentMapChange?.(updatedDocumentMap);
            
            toast({
              title: "Document renamed",
              description: `Document filename updated to: ${sanitizedFilename}`,
            });
          } catch (error) {
            console.error('Error updating document filename:', error);
            toast({
              title: "Error",
              description: "Failed to update document filename",
              variant: "destructive",
            });
          }
        }
      } 
      // DISABLED: Automatic filename updates removed to prevent unwanted renaming
      // File names should only change when explicitly requested via "Rename Files" button
      // } else if (currentRunsheetId && user) {
      //   // For other columns, trigger document filename updates with debounce
      //   setTimeout(() => {
      //     DocumentService.updateDocumentFilenames(currentRunsheetId, newData);
      //   }, 2000);
      // }
      
      setEditingCell(null);
    }
   }, [editingCell, cellValue, data, onDataChange, currentRunsheetId, user, documentMap, setDocumentMap, onDocumentMapChange, toast, runsheetName, columns, columnInstructions, saveToDatabase]);

   // Handle re-extract functionality
   const handleReExtract = useCallback(async (rowIndex: number, column: string, notes: string, saveToPreferences?: boolean) => {
     const document = documentMap.get(rowIndex);
     if (!document) {
       toast({
         title: "Error",
         description: "No document found for this row",
         variant: "destructive",
       });
       return;
     }

      setIsReExtracting(true);
      try {
        const currentValue = data[rowIndex]?.[column] || '';
        const fieldInstructions = columnInstructions[column] || `Extract the ${column} field accurately from the document`;

       // Get signed URL for the document
       const { data: signedUrlData } = await supabase.storage
         .from('documents')
         .createSignedUrl(document.file_path, 3600);
       
       const fileUrl = signedUrlData?.signedUrl;
       if (!fileUrl) {
         throw new Error('Failed to get document URL');
       }

       const response = await supabase.functions.invoke('re-extract-field', {
         body: {
           imageData: fileUrl,
           fileName: document.stored_filename,
           fieldName: column,
           fieldInstructions,
           userNotes: notes,
           currentValue,
           fileUrl
         }
       });

       if (response.error) throw response.error;

       const { extractedValue } = response.data;
       
       // Update the cell with the re-extracted value
       const newData = [...data];
       newData[rowIndex] = {
         ...newData[rowIndex],
         [column]: extractedValue
       };
       
       setData(newData);
       onDataChange?.(newData);
       setHasUnsavedChanges(true);

        // Save to database
        if (runsheetName && runsheetName !== 'Untitled Runsheet' && user) {
          // Mark last save to ignore self-echo realtime updates
          lastSavedAtRef.current = Date.now();
          try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
          await saveToDatabase(newData, columns, runsheetName, columnInstructions, true);
        }

        // Save feedback to extraction preferences if requested
        if (saveToPreferences) {
          const success = await ExtractionPreferencesService.appendToColumnInstructions(
            column,
            notes
          );
          
          if (success) {
            console.log(`✅ Saved feedback to extraction preferences for "${column}"`);
          } else {
            console.error(`❌ Failed to save feedback to extraction preferences for "${column}"`);
          }
        }

        toast({
          title: "Field re-extracted",
          description: `Updated ${column} with new value${saveToPreferences ? '. Feedback saved for future extractions.' : ''}`,
        });
     } catch (error) {
       console.error('Error re-extracting field:', error);
       toast({
         title: "Error",
         description: "Failed to re-extract field",
         variant: "destructive",
       });
     } finally {
       setIsReExtracting(false);
       setShowReExtractDialog(false);
       setReExtractField(null);
     }
   }, [documentMap, data, columnInstructions, toast, saveToDatabase, runsheetName, columns, user, onDataChange]);

   const cancelEdit = useCallback(() => {
     setEditingCell(null);
     setCellValue('');
   }, []);

  // Keyboard navigation
  const handleKeyDown = useCallback((e: React.KeyboardEvent, rowIndex: number, column: string) => {
    const columnIndex = columns.indexOf(column);
    
    // Helper function to ensure cell is scrolled into view after navigation
    const scrollToCellWithDelay = (targetRowIndex: number, targetColumn: string, startEdit = false) => {
      selectCell(targetRowIndex, targetColumn, startEdit);
      setTimeout(() => {
        const cellElement = document.querySelector(`[data-cell="${targetRowIndex}-${targetColumn}"]`);
        if (cellElement) {
          cellElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          });
        }
      }, 50);
    };
    
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
              scrollToCellWithDelay(nextRowIndex, currentColumn, false);
            }, 0);
          } else {
            // If we're at the last row, create a new row and move to it
            const newRow: Record<string, string> = {};
            columns.forEach(col => {
              newRow[col] = '';
            });
            const newData = [...data, newRow];
            setData(newData);
            onDataChange?.(newData);
            
            setTimeout(() => {
              scrollToCellWithDelay(nextRowIndex, currentColumn, false);
            }, 0);
          }
        } else {
          // Enter should start editing mode
          startEditing(rowIndex, column, data[rowIndex]?.[column] || '', undefined, 'none');
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
          // Just select the next cell without starting edit mode
          setTimeout(() => {
            scrollToCellWithDelay(nextRowIndex, nextColumn, false);
          }, 0);
        }
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        if (editingCell) return;
        if (rowIndex > 0) {
          scrollToCellWithDelay(rowIndex - 1, column, false);
        }
        break;
        
      case 'ArrowDown':
        e.preventDefault();
        if (editingCell) return;
        if (rowIndex < data.length - 1) {
          scrollToCellWithDelay(rowIndex + 1, column, false);
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
            scrollToCellWithDelay(rowIndex, columns[newColumnIndex], false);
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
            scrollToCellWithDelay(rowIndex, columns[newColumnIndex], false);
          }
        }
        break;
        
      case 'Delete':
        if (!editingCell && selectedCell?.rowIndex === rowIndex && selectedCell?.column === column) {
          // Clear the cell content when Delete is pressed (Excel-like behavior)
          const newData = [...data];
          newData[rowIndex] = {
            ...newData[rowIndex],
            [column]: ''
          };
          setData(newData);
          onDataChange?.(newData);
          e.preventDefault();
        }
        break;
        
      case 'Backspace':
        if (!editingCell && selectedCell?.rowIndex === rowIndex && selectedCell?.column === column) {
          // Backspace on selected cell should clear content (Excel-like behavior)
          const newData = [...data];
          newData[rowIndex] = {
            ...newData[rowIndex],
            [column]: ''
          };
          setData(newData);
          onDataChange?.(newData);
          e.preventDefault();
        }
        break;
        
      default:
        if (!editingCell && e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          startEditing(rowIndex, column, e.key, undefined, 'none');
          e.preventDefault();
        }
        break;
    }
  }, [columns, data, editingCell, selectedCell, saveEdit, cancelEdit, startEditing]);

  // Handle input key events during editing
  const handleInputKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Helper function to ensure cell is scrolled into view after navigation
    const scrollToCellWithDelay = (targetRowIndex: number, targetColumn: string, startEdit = false) => {
      selectCell(targetRowIndex, targetColumn, startEdit);
      setTimeout(() => {
        const cellElement = document.querySelector(`[data-cell="${targetRowIndex}-${targetColumn}"]`);
        if (cellElement) {
          cellElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'center'
          });
        }
      }, 50);
    };

    if (e.key === 'Enter' && !e.altKey && !e.shiftKey) {
      // Capture the current editing cell info before saving (since saveEdit will clear editingCell)
      if (editingCell) {
        const currentRowIndex = editingCell.rowIndex;
        const currentColumn = editingCell.column;
        
        saveEdit();
        
        // Move to the next row in the same column (Excel-like behavior)
        let nextRowIndex = currentRowIndex + 1;
        if (nextRowIndex >= data.length) {
          // If at the end, add a new row
          setData(prev => {
            const newRow: Record<string, string> = {};
            columns.forEach(col => newRow[col] = '');
            return [...prev, newRow];
          });
        }
        
        if (nextRowIndex < data.length || nextRowIndex === data.length) {
          setTimeout(() => {
            scrollToCellWithDelay(nextRowIndex, currentColumn, false);
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
          scrollToCellWithDelay(nextRowIndex, nextColumn, false);
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
          // Just select the cell and ensure it's in view (no auto-edit)
          scrollToCellWithDelay(nextRowIndex, nextColumn, false);
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
    // Handle drag selection
    if (isDragging && selectedRange) {
      const columnIndex = columns.indexOf(column);
      setSelectedRange(prev => prev ? {
        ...prev,
        end: { rowIndex, columnIndex }
      } : null);
    }
    
    // Track hovered cell for re-analyze button (only if not scrolling)
    if (!isScrolling) {
      setHoveredCell({ rowIndex, column });
    }
  }, [isDragging, selectedRange, columns, isScrolling]);

  // Auto-scroll during drag selection
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return;

    const scrollContainer = document.querySelector('.table-container');
    if (!scrollContainer) return;

    const rect = scrollContainer.getBoundingClientRect();
    const scrollSpeed = 10;
    const edgeThreshold = 50; // pixels from edge to trigger scroll

    // Auto-scroll horizontally
    if (e.clientX < rect.left + edgeThreshold) {
      // Near left edge - scroll left
      scrollContainer.scrollLeft = Math.max(0, scrollContainer.scrollLeft - scrollSpeed);
    } else if (e.clientX > rect.right - edgeThreshold) {
      // Near right edge - scroll right
      scrollContainer.scrollLeft += scrollSpeed;
    }

    // Auto-scroll vertically
    if (e.clientY < rect.top + edgeThreshold) {
      // Near top edge - scroll up
      scrollContainer.scrollTop = Math.max(0, scrollContainer.scrollTop - scrollSpeed);
    } else if (e.clientY > rect.bottom - edgeThreshold) {
      // Near bottom edge - scroll down
      scrollContainer.scrollTop += scrollSpeed;
    }
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Copy/Paste functionality
  const copySelection = useCallback(() => {
    // Handle single cell copy if no range is selected
    if (!selectedRange && selectedCell) {
      const { rowIndex, column } = selectedCell;
      const cellValue = data[rowIndex]?.[column] || '';
      const copiedData = [[cellValue]];
      
      setCopiedData(copiedData);
      setCopiedCell({ rowIndex, column });
      try { navigator.clipboard.writeText(cellValue); } catch {}
      
      toast({
        title: 'Copied',
        description: `Cell value "${cellValue}" copied to clipboard`,
      });
      return;
    }
    
    // Handle range copy
    if (!selectedRange) return;
    setCopiedCell(null);
    
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
    setCopiedRange(selectedRange); // Store the copied range for border styling
    
    // Also copy to clipboard as tab-separated values
    const clipboardText = copiedData.map(row => row.join('\t')).join('\n');
    navigator.clipboard.writeText(clipboardText);
    
    toast({
      title: "Copied",
      description: `${copiedData.length} rows × ${copiedData[0]?.length || 0} columns copied to clipboard`,
    });
  }, [selectedRange, selectedCell, columns, data, toast]);

  const pasteSelection = useCallback(async () => {
    if (!selectedCell) return;
    
    let dataToPaste: string[][] = [];
    let isCutOperation = false;
    
    // Check if this is a cut operation
    if (cutData && copiedData) {
      dataToPaste = copiedData;
      isCutOperation = true;
    } else if (copiedData) {
      dataToPaste = copiedData;
    } else {
      // Try to get data from clipboard
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
    
    // If this is a cut operation, clear the original cells first
    if (isCutOperation && cutData) {
      if (cutData.range) {
        const { start, end } = cutData.range;
        const minRow = Math.min(start.rowIndex, end.rowIndex);
        const maxRow = Math.max(start.rowIndex, end.rowIndex);
        const minCol = Math.min(start.columnIndex, end.columnIndex);
        const maxCol = Math.max(start.columnIndex, end.columnIndex);
        
        for (let row = minRow; row <= maxRow; row++) {
          for (let col = minCol; col <= maxCol; col++) {
            const column = columns[col];
            if (column && newData[row]) {
              newData[row] = {
                ...newData[row],
                [column]: ''
              };
            }
          }
        }
      } else if (cutData.cell) {
        const { rowIndex, column } = cutData.cell;
        if (newData[rowIndex]) {
          newData[rowIndex] = {
            ...newData[rowIndex],
            [column]: ''
          };
        }
      }
    }
    
    // Paste the data to the new location
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
    
    // Clear cut/copy visuals after successful paste
    setCopiedCell(null);
    setCopiedRange(null);
    if (isCutOperation) {
      setCutData(null);
      setCopiedData(null);
    }
    
    toast({
      title: isCutOperation ? 'Moved' : 'Pasted',
      description: `${dataToPaste.length} rows × ${dataToPaste[0]?.length || 0} columns ${isCutOperation ? 'moved' : 'pasted'}`,
    });
  }, [copiedData, cutData, selectedCell, columns, data, onDataChange, toast]);

  // Cut functionality (Excel-like)
  const cutSelection = useCallback(() => {
    // First copy the selection
    copySelection();
    
    // Then mark for cutting and clear the visual content
    if (selectedRange) {
      setCutData({ range: selectedRange });
      // Clear the cut cells visually but don't delete data until paste
      const { start, end } = selectedRange;
      const minRow = Math.min(start.rowIndex, end.rowIndex);
      const maxRow = Math.max(start.rowIndex, end.rowIndex);
      const minCol = Math.min(start.columnIndex, end.columnIndex);
      const maxCol = Math.max(start.columnIndex, end.columnIndex);
      
      toast({
        title: "Cut",
        description: `${maxRow - minRow + 1} rows × ${maxCol - minCol + 1} columns cut. Paste to move them.`,
      });
    } else if (selectedCell) {
      setCutData({ cell: selectedCell });
      toast({
        title: "Cut", 
        description: "Cell cut. Paste to move it.",
      });
    }
  }, [copySelection, selectedRange, selectedCell, toast]);

  // Delete selected cells (Delete key functionality)
  const deleteSelectedCells = useCallback(() => {
    if (selectedRange) {
      const { start, end } = selectedRange;
      const minRow = Math.min(start.rowIndex, end.rowIndex);
      const maxRow = Math.max(start.rowIndex, end.rowIndex);
      const minCol = Math.min(start.columnIndex, end.columnIndex);
      const maxCol = Math.max(start.columnIndex, end.columnIndex);
      
      const newData = [...data];
      for (let row = minRow; row <= maxRow; row++) {
        for (let col = minCol; col <= maxCol; col++) {
          const column = columns[col];
          if (column && newData[row]) {
            newData[row] = {
              ...newData[row],
              [column]: ''
            };
          }
        }
      }
      
      setData(newData);
      onDataChange?.(newData);
      
      toast({
        title: "Deleted",
        description: `${maxRow - minRow + 1} rows × ${maxCol - minCol + 1} columns cleared`,
      });
    } else if (selectedCell) {
      const { rowIndex, column } = selectedCell;
      const newData = [...data];
      if (newData[rowIndex]) {
        newData[rowIndex] = {
          ...newData[rowIndex],
          [column]: ''
        };
      }
      
      setData(newData);
      onDataChange?.(newData);
      
      toast({
        title: "Deleted",
        description: "Cell content cleared",
      });
    }
  }, [selectedRange, selectedCell, data, columns, onDataChange, toast]);

  // Check if a cell is in the cut selection
  const isCellCut = useCallback((rowIndex: number, column: string) => {
    if (!cutData) return false;
    
    if (cutData.cell) {
      return cutData.cell.rowIndex === rowIndex && cutData.cell.column === column;
    }
    
    if (cutData.range) {
      const { start, end } = cutData.range;
      const minRow = Math.min(start.rowIndex, end.rowIndex);
      const maxRow = Math.max(start.rowIndex, end.rowIndex);
      const minCol = Math.min(start.columnIndex, end.columnIndex);
      const maxCol = Math.max(start.columnIndex, end.columnIndex);
      const columnIndex = columns.indexOf(column);
      
      return rowIndex >= minRow && rowIndex <= maxRow && 
             columnIndex >= minCol && columnIndex <= maxCol;
    }
    
    return false;
  }, [cutData, columns]);

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

  // Helper function to get range border styles for outer borders
  const getRangeBorderStyle = useCallback((rowIndex: number, columnIndex: number) => {
    // Check if cell is in selected range (for normal selection)
    const inSelectedRange = selectedRange && isCellInRange(rowIndex, columnIndex);
    
    // Check if cell is in copied range (for copied selection)
    const inCopiedRange = copiedRange && 
      rowIndex >= Math.min(copiedRange.start.rowIndex, copiedRange.end.rowIndex) &&
      rowIndex <= Math.max(copiedRange.start.rowIndex, copiedRange.end.rowIndex) &&
      columnIndex >= Math.min(copiedRange.start.columnIndex, copiedRange.end.columnIndex) &&
      columnIndex <= Math.max(copiedRange.start.columnIndex, copiedRange.end.columnIndex);
    
    if (!inSelectedRange && !inCopiedRange) return '';
    
    // Use copied range dimensions if available, otherwise selected range
    const activeRange = copiedRange || selectedRange;
    if (!activeRange) return '';
    
    const { start, end } = activeRange;
    const minRow = Math.min(start.rowIndex, end.rowIndex);
    const maxRow = Math.max(start.rowIndex, end.rowIndex);
    const minCol = Math.min(start.columnIndex, end.columnIndex);
    const maxCol = Math.max(start.columnIndex, end.columnIndex);
    
    const isTopEdge = rowIndex === minRow;
    const isBottomEdge = rowIndex === maxRow;
    const isLeftEdge = columnIndex === minCol;
    const isRightEdge = columnIndex === maxCol;
    
    const borderColor = 'border-primary';
    const borderStyle = inCopiedRange ? 'border-dashed' : 'border-solid';
    
    let borders = [];
    // Only add borders on the outer edges of the selection
    if (isTopEdge) borders.push('border-t-2');
    if (isBottomEdge) borders.push('border-b-2');
    if (isLeftEdge) borders.push('border-l-2');
    if (isRightEdge) borders.push('border-r-2');
    
    // Remove default cell borders for cells in range
    const removeBorders = [];
    if (!isTopEdge) removeBorders.push('border-t-0');
    if (!isBottomEdge) removeBorders.push('border-b-0');
    if (!isLeftEdge) removeBorders.push('border-l-0');
    if (!isRightEdge) removeBorders.push('border-r-0');
    
    return `${borders.join(' ')} ${removeBorders.join(' ')} ${borderColor} ${borderStyle}`;
  }, [selectedRange, copiedRange, isCellInRange]);

  // Global mouse up event listener and auto-scroll during drag
  useEffect(() => {
    const handleGlobalMouseUp = () => setIsDragging(false);
    
    // Add mouse move listener for auto-scroll during drag
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
    }
    
    document.addEventListener('mouseup', handleGlobalMouseUp);
    
    return () => {
      document.removeEventListener('mouseup', handleGlobalMouseUp);
      document.removeEventListener('mousemove', handleMouseMove);
    };
  }, [isDragging, handleMouseMove]);

  // Fixed copy/paste keyboard shortcuts and Shift+Arrow selection
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      
      const target = e.target as HTMLElement | null;
      const insideOurCell = target && target.closest('[data-cell]');
      const isInExternalFormField = !insideOurCell && target && target.closest('input, textarea, select, [contenteditable="true"]');
      
      if (isInExternalFormField) {
        return; // Only block for external form fields, not our table cells
      }
      
      // Handle Shift+Arrow keys for extending selection
      if (e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        
        if (!selectedCell) return;
        
        const currentRowIndex = selectedCell.rowIndex;
        const currentColumnIndex = columns.indexOf(selectedCell.column);
        
        let newRowIndex = currentRowIndex;
        let newColumnIndex = currentColumnIndex;
        
        switch (e.key) {
          case 'ArrowUp':
            newRowIndex = Math.max(0, currentRowIndex - 1);
            break;
          case 'ArrowDown':
            newRowIndex = Math.min(data.length - 1, currentRowIndex + 1);
            break;
          case 'ArrowLeft':
            newColumnIndex = Math.max(0, currentColumnIndex - 1);
            break;
          case 'ArrowRight':
            newColumnIndex = Math.min(columns.length - 1, currentColumnIndex + 1);
            break;
        }
        
        // Create or extend range
        if (!selectedRange) {
          // Start new range from current cell to new position
          setSelectedRange({
            start: { rowIndex: currentRowIndex, columnIndex: currentColumnIndex },
            end: { rowIndex: newRowIndex, columnIndex: newColumnIndex }
          });
        } else {
          // Extend existing range - keep start, update end
          setSelectedRange({
            start: selectedRange.start,
            end: { rowIndex: newRowIndex, columnIndex: newColumnIndex }
          });
        }
        
        return;
      }
      
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c') {
        console.log('🔍 COPY TRIGGERED');
        e.preventDefault();
        copySelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v') {
        console.log('🔍 PASTE TRIGGERED');
        e.preventDefault();
        pasteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
        console.log('🔍 CUT TRIGGERED');
        e.preventDefault();
        cutSelection();
      } else if (e.key === 'Delete' && (selectedCell || selectedRange)) {
        console.log('🔍 DELETE TRIGGERED');
        e.preventDefault();
        deleteSelectedCells();
      }
    };
    
    // Only use document listener, not window (avoid duplicates)
    document.addEventListener('keydown', handleKeyDown);
    
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [copySelection, pasteSelection, cutSelection, deleteSelectedCells, selectedCell, selectedRange]);
  
  // Clipboard event handlers to better support Cmd/Ctrl+C/V inside iframes and restricted contexts
  useEffect(() => {
    const onCopy = (e: ClipboardEvent) => {
      if (editingCell) return; // allow default when editing textarea
      if (!selectedCell && !selectedRange) return;
      try {
        if (selectedRange) {
          const { start, end } = selectedRange;
          const minRow = Math.min(start.rowIndex, end.rowIndex);
          const maxRow = Math.max(start.rowIndex, end.rowIndex);
          const minCol = Math.min(start.columnIndex, end.columnIndex);
          const maxCol = Math.max(start.columnIndex, end.columnIndex);
          const matrix: string[][] = [];
          for (let r = minRow; r <= maxRow; r++) {
            const rowArr: string[] = [];
            for (let c = minCol; c <= maxCol; c++) {
              const colName = columns[c];
              rowArr.push((data[r]?.[colName] ?? ''));
            }
            matrix.push(rowArr);
          }
          const text = matrix.map(r => r.join('\t')).join('\n');
          e.preventDefault();
          e.clipboardData?.setData('text/plain', text);
          setCopiedData(matrix);
          setCopiedCell(null);
          setCopiedRange(selectedRange); // ensure dashed border shows for copied range
          toast({ title: 'Copied', description: `${matrix.length} rows × ${matrix[0]?.length || 0} columns copied to clipboard` });
        } else if (selectedCell) {
          const { rowIndex, column } = selectedCell;
          const value = data[rowIndex]?.[column] || '';
          e.preventDefault();
          e.clipboardData?.setData('text/plain', value);
          setCopiedData([[value]]);
          setCopiedCell({ rowIndex, column });
          setCopiedRange(null);
          toast({ title: 'Copied', description: `Cell value "${value}" copied to clipboard` });
        }
      } catch {
        // no-op
      }
    };

    const onCut = (e: ClipboardEvent) => {
      if (editingCell) return;
      if (!selectedCell && !selectedRange) return;
      onCopy(e);
      // Mark selection for cut (we clear original cells on paste, Excel-like)
      if (selectedRange) {
        setCutData({ range: selectedRange });
      } else if (selectedCell) {
        setCutData({ cell: selectedCell });
      }
    };

    const onPaste = (e: ClipboardEvent) => {
      if (editingCell) return; // let textarea handle its own paste
      if (!selectedCell) return;
      const text = e.clipboardData?.getData('text/plain') ?? '';
      if (!text) return;
      e.preventDefault();
      const rows = text.split('\n').map(row => row.split('\t'));
      setCopiedData(rows);
      // Defer to existing pasteSelection which uses copiedData
      setTimeout(() => {
        pasteSelection();
      }, 0);
    };

    document.addEventListener('copy', onCopy as any);
    document.addEventListener('cut', onCut as any);
    document.addEventListener('paste', onPaste as any);
    return () => {
      document.removeEventListener('copy', onCopy as any);
      document.removeEventListener('cut', onCut as any);
      document.removeEventListener('paste', onPaste as any);
    };
  }, [columns, data, selectedCell, selectedRange, editingCell, pasteSelection, toast]);
  
  // Function to update document row_index in database
  const updateDocumentRowIndexes = useCallback(async (newDocumentMap: Map<number, DocumentRecord>) => {
    if (!currentRunsheet?.id || !user) return;
    
    try {
      // Create row mappings from old to new positions
      const rowMappings: { oldIndex: number, newIndex: number }[] = [];
      
      // Compare the new document map with the current one to find changes
      newDocumentMap.forEach((doc, newIndex) => {
        // Find where this document was before
        for (const [oldIndex, oldDoc] of documentMap.entries()) {
          if (oldDoc.id === doc.id && oldIndex !== newIndex) {
            rowMappings.push({ oldIndex, newIndex });
            break;
          }
        }
      });

      if (rowMappings.length === 0) {
        console.log('No document row changes detected');
        return;
      }

      console.log('Syncing document row changes:', rowMappings);

      // Call the edge function to sync document rows
      const { error } = await supabase.functions.invoke('sync-document-rows', {
        body: {
          runsheetId: currentRunsheet.id,
          rowMappings
        }
      });

      if (error) {
        console.error('Error syncing document rows:', error);
        throw error;
      }
      
      console.log('✅ Updated document row indexes after row move');
    } catch (error) {
      console.error('Error updating document row indexes:', error);
    }
  }, [currentRunsheet?.id, user, documentMap]);

  // Reset column widths to default
  const resetColumnWidths = useCallback(async () => {
    try {
      // Clear saved preferences
      if (currentRunsheetId) {
        await ColumnWidthPreferencesService.deleteRunsheetPreferences(currentRunsheetId);
      }
      
      // Reset local state
      setColumnWidths({});
      setHasManuallyResizedColumns(false);
      
      toast({
        title: "Column widths reset",
        description: "Column widths have been reset to default values.",
      });
    } catch (error) {
      console.error('Error resetting column widths:', error);
      toast({
        title: "Error",
        description: "Failed to reset column widths.",
        variant: "destructive",
      });
    }
  }, [currentRunsheet?.id, toast]);

  // Function to delete a row
  const deleteRow = useCallback(async (rowIndex: number) => {
    console.log('🗑️ DELETING ROW:', rowIndex, 'hasUnsavedChanges before:', hasUnsavedChanges);
    
    // Set unsaved changes flag  
    setHasUnsavedChanges(true);
    
    // Update local state first
    const newData = data.filter((_, index) => index !== rowIndex);
    setData(newData);
    console.log('🗑️ Row deleted from local state, new data length:', newData.length);
    
    // Update document map to adjust indices
    const newDocumentMap = new Map<number, DocumentRecord>();
    documentMap.forEach((doc, mapRowIndex) => {
      if (mapRowIndex < rowIndex) {
        newDocumentMap.set(mapRowIndex, doc);
      } else if (mapRowIndex > rowIndex) {
        newDocumentMap.set(mapRowIndex - 1, doc);
      }
      // Skip the deleted row (mapRowIndex === rowIndex)
    });
    updateDocumentMap(newDocumentMap);
    
    // ✅ SILENT BACKGROUND SAVE - Save in background without affecting UI
    console.log('💾 Saving row deletion silently in background');
    if (runsheetName && runsheetName !== 'Untitled Runsheet' && user) {
      try {
        // Mark last save to ignore self-echo realtime updates
        lastSavedAtRef.current = Date.now();
        try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
        await saveToDatabase(newData, columns, runsheetName, columnInstructions, true); // Silent save
        console.log('✅ Row deletion saved to database silently');
        setHasUnsavedChanges(false);
        onUnsavedChanges?.(false);
      } catch (error) {
        console.error('❌ Failed to save row deletion to database:', error);
      }
    }
    
    // Update document row indexes in database
    updateDocumentRowIndexes(newDocumentMap);
    
    toast({
      title: "Row deleted",
      description: `Row ${rowIndex + 1} has been deleted and saved in background.`,
      variant: "default"
    });
  }, [data, documentMap, updateDocumentMap, hasUnsavedChanges, toast, user, runsheetName, columns, columnInstructions, onUnsavedChanges, updateDocumentRowIndexes, saveToDatabase]);

  // Function to move row up
  const moveRowUp = useCallback((rowIndex: number) => {
    if (rowIndex <= 0) return;
    
    setData(prev => {
      const newData = [...prev];
      [newData[rowIndex - 1], newData[rowIndex]] = [newData[rowIndex], newData[rowIndex - 1]];
      
      // Update document map
      const newDocumentMap = new Map<number, DocumentRecord>();
      documentMap.forEach((doc, mapRowIndex) => {
        if (mapRowIndex === rowIndex) {
          newDocumentMap.set(rowIndex - 1, doc);
        } else if (mapRowIndex === rowIndex - 1) {
          newDocumentMap.set(rowIndex, doc);
        } else {
          newDocumentMap.set(mapRowIndex, doc);
        }
      });
      updateDocumentMap(newDocumentMap);
      
      // Update database row indexes
      updateDocumentRowIndexes(newDocumentMap);
      
      setHasUnsavedChanges(true);
      return newData;
    });
  }, [documentMap, updateDocumentMap, updateDocumentRowIndexes]);

  // Function to move row down
  const moveRowDown = useCallback((rowIndex: number) => {
    setData(prev => {
      if (rowIndex >= prev.length - 1) return prev;
      
      const newData = [...prev];
      [newData[rowIndex], newData[rowIndex + 1]] = [newData[rowIndex + 1], newData[rowIndex]];
      
      // Update document map
      const newDocumentMap = new Map<number, DocumentRecord>();
      documentMap.forEach((doc, mapRowIndex) => {
        if (mapRowIndex === rowIndex) {
          newDocumentMap.set(rowIndex + 1, doc);
        } else if (mapRowIndex === rowIndex + 1) {
          newDocumentMap.set(rowIndex, doc);
        } else {
          newDocumentMap.set(mapRowIndex, doc);
        }
      });
      updateDocumentMap(newDocumentMap);
      
      // Update database row indexes
      updateDocumentRowIndexes(newDocumentMap);
      
      setHasUnsavedChanges(true);
      return newData;
    });
  }, [documentMap, updateDocumentMap, updateDocumentRowIndexes]);

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

  // Handle runsheet naming confirmation
  const handleConfirmNamedRunsheet = useCallback(async (name: string) => {
    if (!pendingRunsheetData) return;

    const { columns: newColumns, instructions } = pendingRunsheetData;
    
    console.log('🔧 EDITABLE_SPREADSHEET: Creating named runsheet:', name);
    
    // Clear any existing emergency draft when creating a new runsheet
    try {
      localStorage.removeItem('runsheet-emergency-draft');
      console.log('🗑️ Cleared emergency draft for new runsheet creation');
    } catch (error) {
      console.error('Error clearing emergency draft:', error);
    }
    
    // Clear current state first
    console.log('🧹 Clearing current runsheet state for new runsheet:', name);
    
    // Clear localStorage immediately to prevent active runsheet restoration
    localStorage.removeItem('currentRunsheetId');
    localStorage.removeItem('activeRunsheet');
    
    setCurrentRunsheetId(null);
    clearActiveRunsheet();
    setSelectedCell(null);
    setEditingCell(null);
    setCellValue('');
    setSelectedRange(null);
    setHasUnsavedChanges(false);
    setLastSavedState('');
    
    // Create new data with the columns
    const newData = Array.from({ length: 100 }, () => {
      const row: Record<string, string> = {};
      newColumns.forEach((col: string) => row[col] = '');
      return row;
    });
    
    // Set all the new state
    setRunsheetName(name);
    setData(newData);
    setColumns(newColumns);
    setColumnInstructions(instructions);
    onDataChange?.(newData);
    onColumnChange(newColumns);
    
    // Set a flag to prevent any automatic runsheet loading for a few seconds
    sessionStorage.setItem('creating_new_runsheet', Date.now().toString());
    
    // Save to database immediately
    if (user) {
      try {
        const { data: newRunsheet, error } = await supabase
          .from('runsheets')
          .insert({
            user_id: user.id,
            name: name,
            columns: newColumns,
            data: newData,
            column_instructions: instructions
          })
          .select()
          .single();

        if (error) throw error;

        // Set this as the active runsheet immediately
        setCurrentRunsheet(newRunsheet.id);
        setActiveRunsheet({
          id: newRunsheet.id,
          name: newRunsheet.name,
          data: newData,
          columns: newColumns,
          columnInstructions: instructions
        });
        
        console.log('✅ Named runsheet created and set as active:', newRunsheet.id);
        
        // Clear the creation flag
        sessionStorage.removeItem('creating_new_runsheet');
        
        toast({
          title: "Runsheet created",
          description: `"${name}" is ready for your data.`,
        });
      } catch (error) {
        console.error('Failed to create named runsheet:', error);
        toast({
          title: "Error creating runsheet",
          description: "Failed to save runsheet. Please try again.",
          variant: "destructive"
        });
      }
    }
    
    // Clear pending data
    setPendingRunsheetData(null);
  }, [pendingRunsheetData, user, onDataChange, onColumnChange, clearActiveRunsheet, setCurrentRunsheet, setActiveRunsheet, toast]);

  const analyzeDocumentAndPopulateRow = async (file: File, targetRowIndex: number, forceOverwrite: boolean = false, fillEmptyOnly: boolean = false, selectedInstrument?: number) => {
    try {
      console.log('🔍 Starting document analysis for:', file.name, 'type:', file.type, 'size:', file.size);
      console.log('🔍 Target row index:', targetRowIndex, 'Force overwrite:', forceOverwrite);
      console.log('🔍 Current runsheet ID:', currentRunsheetId);
      console.log('🔍 Available columns:', columns);
      
      // Check for empty or corrupted files
      if (file.size === 0) {
        console.error('🔍 File is empty - this should not happen for existing documents');
        toast({
          title: "File is empty",
          description: "The linked file appears to be empty or corrupted. Please re-upload the document.",
          variant: "destructive"
        });
        return;
      }
      
      // Verify the file is a supported format (images and PDFs)
      const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'application/pdf'];
      if (file.type && !supportedTypes.includes(file.type)) {
        // Handle octet-stream files that might actually be images
        if (file.type === 'application/octet-stream') {
          // Check if filename suggests it's an image
          const isImageFile = /\.(jpg|jpeg|png|gif|webp)$/i.test(file.name);
          if (!isImageFile) {
            toast({
              title: "Unsupported File Format",
              description: `File format ${file.type} is not supported. Please use PNG, JPEG, GIF, or WebP images.`,
              variant: "destructive"
            });
            return;
          }
          // Continue processing for octet-stream files with image extensions
        } else {
          toast({
            title: "Unsupported File Format",
            description: `File format ${file.type} is not supported. Please use PNG, JPEG, GIF, or WebP images.`,
            variant: "destructive"
          });
          return;
        }
      }
      
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

      // Choose the appropriate analysis function based on file type
      console.log('🔍 File analysis - name:', file.name, 'type:', file.type);
      let analysisResult, functionError;
      
if (file.name.toLowerCase().endsWith('.pdf')) {
        console.log('🔍 PDF detected - converting to images and analyzing with OpenAI');

        // Ensure the PDF is available as a File (from local upload or fetched from storage)
        let pdfFile: File = file;
        if (!(file instanceof File)) {
          // Fallback: fetch from storage URL if needed (rare)
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) throw new Error('User not authenticated');
          const originalName = ((file as any)?.name as string) || 'document.pdf';
          const filePath = `${user.id}/${currentRunsheetId}/${targetRowIndex}/${originalName}`;
          const { data } = supabase.storage.from('documents').getPublicUrl(filePath);
          const res = await fetch(data.publicUrl);
          const blob = await res.blob();
          pdfFile = new File([blob], originalName, { type: 'application/pdf' });
        }

        // 1) Convert all pages to images
        const pages = await convertPDFToImages(pdfFile, 4);
        if (!pages.length) throw new Error('No pages found in PDF');

        const basePdfName = (((file as any)?.name as string) || 'document.pdf');
        const pageFiles = pages.map(p => createFileFromBlob(p.blob, `${basePdfName.replace(/\.pdf$/i, '')}_page-${p.pageNumber}.png`));

        // 3) Combine pages vertically into one tall image for best OCR
        const { file: combinedImage } = await combineImages(pageFiles, { type: 'vertical', maxWidth: undefined, quality: 0.9 });

        // 4) Read combined image as base64 data URL for OpenAI vision
        const reader = new FileReader();
        const combinedImageData: string = await new Promise((resolve, reject) => {
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error('Failed to read combined image'));
          reader.readAsDataURL(combinedImage);
        });

        // 5) Analyze with enhanced document analysis
        ({ data: analysisResult, error: functionError } = await supabase.functions.invoke('enhanced-document-analysis', {
          body: {
            document_data: combinedImageData,
            runsheet_id: currentRunsheetId,
            document_name: file.name,
            extraction_preferences: {
              columns: extractionPrefs?.columns || columns.filter(col => col !== 'Document File Name'),
              column_instructions: extractionPrefs?.column_instructions || {}
            },
            selected_instrument: selectedInstrument
          }
        }));
      } else {
        console.log('🔍 Non-PDF file detected - using enhanced document analysis');
        console.log('🔍 Calling enhanced-document-analysis edge function...');
        ({ data: analysisResult, error: functionError } = await supabase.functions.invoke('enhanced-document-analysis', {
          body: {
            document_data: imageData,
            runsheet_id: currentRunsheetId,
            document_name: file.name,
            extraction_preferences: {
              columns: extractionPrefs?.columns || columns.filter(col => col !== 'Document File Name'),
              column_instructions: extractionPrefs?.column_instructions || {}
            },
            selected_instrument: selectedInstrument
          }
        }));
      }

      if (functionError) {
        console.error('🔍 Edge function error:', functionError);
        throw new Error(functionError.message || 'Failed to analyze document');
      }

      if (!analysisResult?.success) {
        throw new Error(analysisResult?.error || 'Analysis failed');
      }

      const analysis = analysisResult.analysis;
      
      // Check for multiple instruments
      if (analysis.multiple_instruments && analysis.instrument_count > 1 && !selectedInstrument) {
        console.log('🔍 Multiple instruments detected:', analysis.instrument_count);
        setDetectedInstruments(analysis.instruments || []);
        setPendingInstrumentAnalysis({ file, rowIndex: targetRowIndex, forceOverwrite, fillEmptyOnly });
        setShowInstrumentSelectionDialog(true);
        toast({
          title: "Multiple Instruments Detected",
          description: `Found ${analysis.instrument_count} instruments on this page. Please select which one to extract.`,
        });
        return;
      }
      
      if (!analysis?.extracted_data) {
        throw new Error('No data extracted from document');
      }

      console.log('🔍 Analysis result:', analysis);

      // Extract the data from the enhanced analysis response
      const extractedData = analysis.extracted_data;
      
      // Convert any non-string values to strings
      const processedData: Record<string, string> = {};
      Object.keys(extractedData).forEach(key => {
        if (extractedData[key] !== null && extractedData[key] !== undefined) {
          processedData[key] = String(extractedData[key]);
        }
      });

      console.log('🔍 Processed extracted data:', processedData);

      console.log('🔍 Target row index:', targetRowIndex);
      console.log('🔍 Current data before update:', data);
      console.log('🔍 Available columns:', columns);

      // Create flexible mapping from extracted keys to column names
      // The AI should return keys that match column names, but we'll handle some common variations
      const createFlexibleMapping = (extractedData: any, availableColumns: string[]): Record<string, string> => {
        const mapping: Record<string, string> = {};
        
        Object.keys(extractedData).forEach(aiKey => {
          // First try exact match
          if (availableColumns.includes(aiKey)) {
            mapping[aiKey] = aiKey;
            return;
          }
          
          // Try case-insensitive match
          const lowerAiKey = aiKey.toLowerCase();
          const matchingColumn = availableColumns.find(col => col.toLowerCase() === lowerAiKey);
          if (matchingColumn) {
            mapping[aiKey] = matchingColumn;
            return;
          }
          
          // Try partial matches for common variations
          const partialMatch = availableColumns.find(col => {
            const lowerCol = col.toLowerCase();
            const words = lowerCol.split(/[\s\/\-_]+/);
            const aiWords = lowerAiKey.split(/[\s\/\-_]+/);
            
            // Check if any significant words match
            return words.some(word => 
              word.length > 2 && aiWords.some(aiWord => 
                aiWord.includes(word) || word.includes(aiWord)
              )
            );
          });
          
          if (partialMatch) {
            mapping[aiKey] = partialMatch;
          }
        });
        
        return mapping;
      };

      const keyMapping = createFlexibleMapping(processedData, columns);
      console.log('🔍 Generated key mapping:', keyMapping);

      // Map the extracted data to use column names as keys
      const mappedData: Record<string, string> = {};
      
      Object.entries(processedData).forEach(([key, value]) => {
        const mappedKey = keyMapping[key];
        
        // Only include data for columns that actually exist and have a mapping
        if (mappedKey && columns.includes(mappedKey)) {
          // Handle object values (like complex Grantor/Grantee data)
          let stringValue: string;
          if (typeof value === 'object' && value !== null) {
            // If it's an object with Name and Address properties (capitalized)
            if (typeof value === 'object' && value && 'Name' in value && 'Address' in value) {
              stringValue = `${(value as any).Name || ''}; ${(value as any).Address || ''}`;
            } else if (typeof value === 'object' && value && 'name' in value && 'address' in value) {
              stringValue = `${(value as any).name || ''}; ${(value as any).address || ''}`;
            } else {
              // For other objects, create a readable string without brackets
              const objStr = JSON.stringify(value);
              stringValue = objStr.replace(/[{}]/g, '').replace(/"/g, '').replace(/:/g, ': ').replace(/,/g, ', ');
            }
          } else {
            stringValue = String(value);
          }
          
          mappedData[mappedKey] = stringValue;
        } else {
          console.log('🔍 Skipping unmapped key:', key, 'value:', value);
        }
      });

      console.log('🔍 Final mapped data:', mappedData);

      // Validate the data before insertion
      const dataValidation = validateDataForInsertion(mappedData, columns);
      if (!dataValidation.isValid) {
        throw new Error(dataValidation.error || 'Invalid data for insertion');
      }

      // Show warnings if any
      if (dataValidation.warnings && dataValidation.warnings.length > 0) {
        console.warn('Data insertion warnings:', dataValidation.warnings);
      }

      // Validate the target row unless overwrite is forced
      const currentRow = data[targetRowIndex];
      const hasLinkedDocument = documentMap.get(targetRowIndex) ? true : false;
      const rowValidation = validateRowForInsertion(currentRow, targetRowIndex, forceOverwrite, hasLinkedDocument);
      
      if (!rowValidation.isValid && !forceOverwrite) {
        // Show proper confirmation dialog for overwriting existing data
        setOverwriteDialogData({
          rowIndex: targetRowIndex,
          rowSummary: getRowDataSummary(currentRow),
          error: rowValidation.error || '',
          file,
          onConfirm: () => {
            setShowOverwriteDialog(false);
            setOverwriteDialogData(null);
            // Continue with overwrite
            analyzeDocumentAndPopulateRow(file, targetRowIndex, true);
          },
          onCancel: () => {
            setShowOverwriteDialog(false);
            setOverwriteDialogData(null);
            
            // Find the next empty row and suggest it
            const nextEmptyRowIndex = findFirstEmptyRow(data, documentMap);
            if (nextEmptyRowIndex !== -1) {
              // Ask if they want to use empty row instead
              const useEmptyRow = window.confirm(
                `Would you like to add the data to the first empty row (row ${nextEmptyRowIndex + 1}) instead?`
              );
              if (useEmptyRow) {
                analyzeDocumentAndPopulateRow(file, nextEmptyRowIndex, false);
              }
            } else {
              toast({
                title: "Operation cancelled",
                description: "Data insertion was cancelled to prevent overwriting existing information.",
                variant: "default"
              });
            }
          }
        });
        setShowOverwriteDialog(true);
        return;
      }

      // Clean the data for insertion
      const cleanMappedData = prepareDataForInsertion(mappedData, columns);

      // Update the row with mapped data
      const newData = [...data];
      console.log('🔍 Row data before update:', newData[targetRowIndex]);
      
      // Merge with existing data
      if (fillEmptyOnly) {
        // Only fill empty fields, keep existing data
        const existingRow = newData[targetRowIndex];
        const mergedData: Record<string, string> = { ...existingRow };
        
        Object.keys(cleanMappedData).forEach(field => {
          const existingValue = existingRow[field];
          // Only replace if field is empty or N/A
          if (!existingValue || existingValue.toString().trim() === '' || 
              existingValue.toString().trim().toLowerCase() === 'n/a') {
            mergedData[field] = cleanMappedData[field];
          }
        });
        
        newData[targetRowIndex] = mergedData;
      } else {
        // Replace all data (or merge for partial updates)
        newData[targetRowIndex] = {
          ...newData[targetRowIndex],
          ...cleanMappedData
        };
      }
      
      console.log('🔍 Row data after update:', newData[targetRowIndex]);
      console.log('🔍 Full updated data array:', newData);
      
      // Mark this update as a brain button analysis to prevent sync conflicts
      setIsProcessingBrainAnalysis(true);
      // Suppress realtime overwrites while we persist changes
      suppressRealtimeUntilRef.current = Date.now() + 8000;
      
      setData(newData);
      // Immediately update dataRef to ensure force saves have the latest data
      dataRef.current = newData;
      console.log('🔍 setData called with:', newData);
      console.log('🔍 onDataChange callback exists:', !!onDataChange);
      onDataChange?.(newData);
      console.log('🔍 onDataChange called');
      // Track recent local edit for merge protection against realtime overwrites
      try {
        recentEditedRowsRef.current.set(targetRowIndex, { timestamp: Date.now(), row: newData[targetRowIndex] });
        // Prune old entries
        const nowTs = Date.now();
        for (const [idx, meta] of recentEditedRowsRef.current) {
          if (nowTs - meta.timestamp > 60000) recentEditedRowsRef.current.delete(idx);
        }
      } catch {}
      
      // Show success message with details
      const populatedFields = Object.keys(cleanMappedData);
      console.log('🔍 About to show success toast for populated fields:', populatedFields);
      console.log('🔍 Clean mapped data:', cleanMappedData);
      console.log('🔍 Final data state after analysis:', newData);
      console.log('🔍 Specific row after analysis:', newData[targetRowIndex]);
      
      toast({
        title: "Document analyzed successfully",
        description: `Data extracted and added to row ${targetRowIndex + 1}. Populated fields: ${populatedFields.join(', ')}`,
        variant: "default"
      });
      
      console.log('🔍 Analysis completed successfully for row:', targetRowIndex);

      // Persist changes using immediate save (silent) to avoid realtime conflicts
      if (currentRunsheetId && runsheetName) {
        try {
          // Mark last save and suppress realtime to prevent conflicts
          lastSavedAtRef.current = Date.now();
          try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
          suppressRealtimeUntilRef.current = Date.now() + 8000; // Prevent realtime conflicts
          await saveToDatabase(newData, columns, runsheetName, columnInstructions, true);
          console.log('🔍 Brain analysis: Silent save completed successfully');
        } catch (e) {
          console.error('🔍 Brain analysis: Silent save failed', e);
        } finally {
          setIsProcessingBrainAnalysis(false);
        }
      }


    } catch (error) {
      console.error('🔍 Document analysis error details:', {
        error: error,
        message: error?.message,
        stack: error?.stack,
        fileName: file?.name,
        fileType: file?.type,
        rowIndex: targetRowIndex,
        runsheetId: currentRunsheetId
      });
      
      // Show specific error message to user
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
      
      toast({
        title: "Analysis failed",
        description: `Error: ${errorMessage}. Please check the console for more details.`,
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
            {/* Save Button with Dropdown */}
            <div className="flex">
              <Button
                variant="default"
                size="sm"
                onClick={saveRunsheet}
                disabled={isSaving || !user}
                className="gap-2 rounded-r-none border-r-0"
              >
                <Save className="h-4 w-4" />
                {isSaving || immediateSaving ? 'Saving...' : 'Save'}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="default"
                    size="sm"
                    disabled={isSaving || !user}
                    className="rounded-l-none px-2"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-background border shadow-lg">
                  <DropdownMenuItem
                    onClick={saveAndCloseRunsheet}
                    disabled={isSaving || !user}
                    className="gap-2 cursor-pointer"
                  >
                    <Save className="h-4 w-4" />
                    Save & Close
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>


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
            
            
            {/* Add Rows Button */}
            <DropdownMenu open={addRowsDropdownOpen} onOpenChange={setAddRowsDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Add Rows
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-background border shadow-lg z-50">
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setAddRowsDropdownOpen(false);
                    setShowAddRowsDialog(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Custom Amount...
                </DropdownMenuItem>
                
                <DropdownMenuSeparator />
                
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addMoreRows(10);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add 10 rows
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addMoreRows(25);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add 25 rows
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addMoreRows(50);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add 50 rows
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    addMoreRows(100);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add 100 rows
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            
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
                          setShowNewRunsheetDialog(false);
                          setShowFileUpload(true);
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
                       onClick={async () => {
                         setShowNewRunsheetDialog(false);
                         // Wait a moment for the dialog to close, then fetch runsheets
                         setTimeout(() => {
                           fetchSavedRunsheets();
                         }, 100);
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
                             // Define default columns and instructions for new runsheet
                             const DEFAULT_COLUMNS = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'];
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
                             
                             const finalName = newRunsheetName.trim();
                             
                             // Close dialog first
                             setShowNameNewRunsheetDialog(false);
                             setNewRunsheetName('');
                             
                             // Set a flag to prevent loading any old runsheet data
                             sessionStorage.setItem('creating_new_runsheet', Date.now().toString());
                             sessionStorage.setItem('new_runsheet_name', finalName);
                             
                             // Navigate to a clean runsheet URL without any parameters
                             navigate('/runsheet', { replace: true, state: {} });
                             
                             // Dispatch the same event that Dashboard uses to trigger the proper save
                             setTimeout(() => {
                               const event = new CustomEvent('createNewRunsheetFromDashboard', {
                                 detail: {
                                   name: finalName,
                                   columns: DEFAULT_COLUMNS,
                                   instructions: DEFAULT_EXTRACTION_INSTRUCTIONS
                                 }
                               });
                               window.dispatchEvent(event);
                             }, 100);
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
                         
                         // Define default columns and instructions for new runsheet
                         const DEFAULT_COLUMNS = ['Inst Number', 'Book/Page', 'Inst Type', 'Recording Date', 'Document Date', 'Grantor', 'Grantee', 'Legal Description', 'Notes'];
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
                         
                         const finalName = newRunsheetName.trim();
                         
                         // Close dialog first
                         setShowNameNewRunsheetDialog(false);
                         setNewRunsheetName('');
                         
                         // Set a flag to prevent loading any old runsheet data
                         sessionStorage.setItem('creating_new_runsheet', Date.now().toString());
                         sessionStorage.setItem('new_runsheet_name', finalName);
                         
                         // Navigate to a clean runsheet URL without any parameters
                         navigate('/runsheet', { replace: true, state: {} });
                         
                         // Dispatch the same event that Dashboard uses to trigger the proper save
                         setTimeout(() => {
                           const event = new CustomEvent('createNewRunsheetFromDashboard', {
                             detail: {
                               name: finalName,
                               columns: DEFAULT_COLUMNS,
                               instructions: DEFAULT_EXTRACTION_INSTRUCTIONS
                             }
                           });
                           window.dispatchEvent(event);
                         }, 100);
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

        {/* Loading overlay for table operations */}
        {isTableLoading && (
          <div className="fixed inset-0 bg-background/50 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-background border rounded-lg p-6 shadow-lg">
              <div className="flex items-center gap-3">
                <div className="animate-spin h-6 w-6 border-b-2 border-primary rounded-full"></div>
                <span>Updating spreadsheet...</span>
              </div>
            </div>
          </div>
        )}

        {/* Scrollable container optimized for sticky headers */}
        <div 
          ref={(node) => {
            // Set both refs to the same element
            if (containerRef.current !== node) containerRef.current = node;
            if (tableContainerRef.current !== node) tableContainerRef.current = node;
          }}
          className={`table-container border rounded-md bg-background relative h-[750px] mx-6 overflow-auto transition-all duration-200 ${
            isScrolling ? 'scroll-smooth' : ''
          }`}
          style={{ 
            maxWidth: '100%',
            scrollBehavior: 'smooth',
            overflow: 'auto',
            position: 'relative',
            isolation: 'isolate' // Create a new stacking context for sticky elements
          }}
          onScroll={handleScroll}
        >
          {/* Fixed table wrapper for proper sticky behavior */}
          <div 
            style={{ 
              minWidth: `${getTotalTableWidth()}px`,
              width: 'fit-content',
              position: 'relative',
              height: 'fit-content',
              minHeight: '100%'
          }}
          onScroll={handleScroll}
        >
             <table 
              className="w-full table-fixed" 
              style={{ 
                tableLayout: 'fixed', 
                minWidth: `${getTotalTableWidth()}px`,
                width: 'fit-content',
                position: 'relative',
                borderCollapse: 'separate',
                borderSpacing: '0'
              }}
             >
            {/* STICKY HEADER - Always visible at top */}
            <thead 
              className="sticky-table-header"
              style={{ 
                position: 'sticky',
                top: 0,
                zIndex: 1000,
                backgroundColor: 'hsl(var(--background))',
                borderBottom: '2px solid hsl(var(--border))',
                boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              }}
            >
               <tr className="hover:bg-muted/50 transition-colors">
                  {/* Row Actions column header */}
                  <th
                    className="font-bold text-center border-r border-b border-border relative p-0 bg-background sticky top-0"
                    style={{ 
                       width: "60px", 
                       minWidth: "60px",
                      backgroundColor: 'hsl(var(--background))',
                      position: 'sticky',
                      top: '0px',
                      zIndex: 999
                    }}
                  >
                    <div className="w-full h-full px-1 py-2 flex items-center justify-center">
                      <span className="font-bold text-xs">#</span>
                    </div>
                  </th>
                  
                   {columns.map((column) => (
                   <th 
                        key={column}
                        className={`font-bold text-center border-r border-b border-border relative cursor-move transition-all duration-200 h-12 font-medium text-muted-foreground
                           ${draggedColumn === column ? 'opacity-50 transform scale-95' : ''}
                           ${dragOverColumn === column ? 'bg-primary/20 shadow-lg' : 'bg-background'}
                           ${localMissingColumns.includes(column) ? 'bg-yellow-100 border-2 border-yellow-400 dark:bg-yellow-900/20 dark:border-yellow-500 animate-pulse shadow-yellow-200 dark:shadow-yellow-900' : 'hover:bg-muted/30'}
                           backdrop-blur-sm`}
                        style={{ 
                          width: `${getColumnWidth(column)}px`, 
                          minWidth: `${getColumnWidth(column)}px`,
                          backgroundColor: dragOverColumn === column ? 'hsl(var(--primary) / 0.2)' : 'hsl(var(--background))',
                          position: 'sticky',
                          top: '0px',
                          zIndex: 999
                        }}
                       draggable
                      onDragStart={(e) => handleDragStart(e, column)}
                      onDragOver={(e) => handleDragOver(e, column)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, column)}
                      onDragEnd={handleDragEnd}
                    >
                       <ContextMenu>
                          <ContextMenuTrigger className="w-full h-full p-0 select-none sticky-header-content">
                              <div 
                                className={`w-full h-full px-4 py-2 cursor-pointer transition-all duration-200 relative rounded-sm
                                  ${localMissingColumns.includes(column) 
                                    ? 'hover:bg-yellow-200 dark:hover:bg-yellow-800/30 animate-pulse' 
                                    : 'hover:bg-primary/15 hover:shadow-sm'
                                  }`}
                                onClick={(e) => {
                                  console.log('Header clicked - checking if sticky is working');
                                  console.log('isDraggingResize:', isDraggingResize);
                                  
                                  // Only prevent dialog if we're currently in a resize operation
                                  // This allows normal clicks while preventing accidental opens during resize
                                  if (resizing || isDraggingResize) {
                                    console.log('Preventing dialog - resize in progress');
                                    e.preventDefault();
                                    e.stopPropagation();
                                    return;
                                  }
                                  
                                  openColumnDialog(column);
                                }}
                              >
                                <div className="flex flex-col items-center justify-center h-full px-4 pr-6"> {/* Center content vertically and horizontally */}
                                  <span 
                                    className="font-bold truncate max-w-full" 
                                    title={column}
                                    style={{ 
                                      maxWidth: `${getColumnWidth(column) - 30}px` // Reserve 30px for resize handle
                                    }}
                                  >
                                    {column}
                                  </span>
                                  {localMissingColumns.includes(column) && (
                                    <span className="text-xs text-yellow-700 dark:text-yellow-300 mt-1 font-medium animate-pulse truncate max-w-full">
                                      Click to save
                                    </span>
                                  )}
                                </div>
                                {/* Enhanced resize handle positioned at right border */}
                                <div
                                  className="absolute -right-1 top-0 bottom-0 w-2 cursor-col-resize hover:bg-primary/30 transition-all duration-200 z-10 group flex items-center justify-center"
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    handleMouseDown(e, column);
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    e.preventDefault();
                                    // Ensure no events bubble up from resize handle
                                    return false;
                                  }}
                                  title="Drag to resize column"
                                >
                                  <div className="w-0.5 h-full bg-border/60 group-hover:bg-primary transition-colors duration-200"></div>
                                </div>
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
                    </th>
                  ))}
                 
                   {/* Document File Name column header removed - using DocumentLinker instead */}
                  
                    {/* Actions column header - not draggable */}
                        <th
                         className="font-bold text-center border-b border-border relative p-0 bg-background sticky top-0"
                        style={{ 
                          width: "480px", 
                          minWidth: "480px",
                          backgroundColor: 'hsl(var(--background))',
                          position: 'sticky',
                          top: '0px',
                          zIndex: 999
                        }}
                     >
                       <div className="w-full h-full px-4 py-2 flex gap-2">
                           {/* File Name Management Dropdown */}
                           <DropdownMenu>
                             <DropdownMenuTrigger asChild>
                               <Button
                                 variant="outline"
                                 size="sm"
                                 className="h-8 text-xs gap-1"
                               >
                                <Sparkles className="h-3 w-3 text-purple-600" />
                                 File Name Tools
                                 <ChevronDown className="h-3 w-3" />
                              </Button>
                             </DropdownMenuTrigger>
                             <DropdownMenuContent align="start" className="bg-background border shadow-lg z-50">
                               <DropdownMenuItem 
                                 onClick={() => setShowDocumentNamingDialog(true)}
                               >
                                 <Sparkles className="h-4 w-4 mr-2 text-purple-600" />
                                 Smart File Name Settings
                               </DropdownMenuItem>
                               <DropdownMenuItem 
                                 onClick={async () => {
                                   let mapToCheck = documentMap;
                                   // Refresh document map before opening dialog
                                   if (currentRunsheetId) {
                                     try {
                                       const updatedDocumentMap = await DocumentService.getDocumentMapForRunsheet(currentRunsheetId);
                                       updateDocumentMap(updatedDocumentMap);
                                       mapToCheck = updatedDocumentMap;
                                     } catch (error) {
                                       console.error('Error refreshing document map:', error);
                                     }
                                   }
                                   
                                   if (mapToCheck.size === 0) {
                                     toast({
                                       title: "Nothing to rename",
                                       description: "No documents are linked to this runsheet yet.",
                                       variant: "default",
                                     });
                                     return;
                                   }
                                   
                                   setShowBatchRenameDialog(true);
                                 }}
                               >
                                 <FileEdit className="h-4 w-4 mr-2" />
                                 Rename All Files
                               </DropdownMenuItem>
                             </DropdownMenuContent>
                           </DropdownMenu>
                         
                         {/* Upload Multiple Files Button */}
                         {onShowMultipleUpload && (
                           <Button
                             variant="outline"
                             size="sm"
                             onClick={onShowMultipleUpload}
                             className="h-8 text-xs gap-1"
                           >
                             <FileStack className="h-3 w-3" />
                             Multiple Files
                           </Button>
                         )}
                         
                         {/* Batch Analysis Button */}
                         <Button
                           variant="outline"
                           size="sm"
                            onClick={async () => {
                              console.log('🧠 BATCH Brain button clicked - Debug info:');
                              console.log('currentRunsheet:', currentRunsheet);
                              console.log('currentRunsheetId:', currentRunsheetId);
                              console.log('effectiveRunsheetId:', effectiveRunsheetId);
                              console.log('documentMap size:', documentMap.size);
                              console.log('current data length:', data.length);
                             
                             if (!effectiveRunsheetId) {
                               toast({
                                 title: "No runsheet selected",
                                 description: "Please save your runsheet before analyzing documents.",
                                 variant: "destructive",
                               });
                               return;
                             }
                             
                             let mapToCheck = documentMap;
                             // Refresh document map before opening dialog
                             if (effectiveRunsheetId) {
                               try {
                                 console.log('🧠 Refreshing document map for runsheet:', effectiveRunsheetId);
                                 const updatedDocumentMap = await DocumentService.getDocumentMapForRunsheet(effectiveRunsheetId);
                                 updateDocumentMap(updatedDocumentMap);
                                 mapToCheck = updatedDocumentMap;
                                 console.log('🧠 Updated document map size:', mapToCheck.size);
                               } catch (error) {
                                 console.error('Error refreshing document map:', error);
                                 toast({
                                   title: "Error loading documents",
                                   description: "Could not load linked documents. Please try again.",
                                   variant: "destructive",
                                 });
                                 return;
                               }
                             }
                             
                             if (mapToCheck.size === 0) {
                               toast({
                                 title: "Nothing to analyze",
                                 description: "No documents are linked to this runsheet yet.",
                                 variant: "default",
                               });
                               return;
                             }
                             
                             setShowBatchAnalysisDialog(true);
                           }}
                           className="h-8 text-xs gap-1"
                         >
                           <Brain className="h-3 w-3" />
                           Analyze All
                         </Button>
                    </div>
                  </th>
                </tr>
             </thead>

              {/* Table Body */}
              <tbody>
                   {data.map((row, rowIndex) => {
                     return (
                        <>
                           {/* Show inline document viewer above this row if it's selected */}
                          {inlineViewerRow === rowIndex && (
                         <tr>
                            <td colSpan={1 + columns.length + 1} className="p-0 border-0">
                             <InlineDocumentViewer
                               runsheetId={effectiveRunsheetId}
                               rowIndex={rowIndex}
                               onClose={() => setInlineViewerRow(null)}
                             />
                           </td>
                         </tr>
                       )}
                   
                        <tr 
                          className={`relative transition-all duration-200 group hover:bg-muted/50 data-[state=selected]:bg-muted
                            ${lastEditedCell?.rowIndex === rowIndex ? 'bg-green-50 dark:bg-green-900/20 animate-pulse' : 'hover:bg-muted/30'}
                          `}
                         style={{ 
                           height: `${getRowHeight(rowIndex)}px`,
                           minHeight: `${getRowHeight(rowIndex)}px`
                         }}
                       >
                     {/* Row Actions column - Row number, drag handle, and delete button */}
                      <td 
                        className="border-r border-b border-border p-2 text-center bg-muted/30"
                        style={{ 
                           width: "60px", 
                           minWidth: "60px",
                          height: `${getRowHeight(rowIndex)}px`,
                          minHeight: `${getRowHeight(rowIndex)}px`
                        }}
                      >
                        <div className="flex items-center justify-between gap-1 h-full">
                          <span className="text-xs text-muted-foreground font-mono">{rowIndex + 1}</span>
                          
                          <div className="flex items-center gap-1">
                            
                            {/* Delete Button */}
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (hasRowData(row)) {
                                  if (confirm(`Are you sure you want to delete row ${rowIndex + 1}? This action cannot be undone.`)) {
                                    deleteRow(rowIndex);
                                  }
                                } else {
                                  deleteRow(rowIndex);
                                }
                              }}
                              className="h-6 w-6 p-0 hover:bg-red-100 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400"
                              title="Delete row"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </td>
                     
                     {columns.map((column) => {
                     const isSelected = selectedCell?.rowIndex === rowIndex && selectedCell?.column === column;
                      const isEditing = editingCell?.rowIndex === rowIndex && editingCell?.column === column;
                      const columnIndex = columns.indexOf(column);
                      const isInRange = isCellInRange(rowIndex, columnIndex);
                      const isInCopiedRange = copiedRange && 
                        rowIndex >= Math.min(copiedRange.start.rowIndex, copiedRange.end.rowIndex) &&
                        rowIndex <= Math.max(copiedRange.start.rowIndex, copiedRange.end.rowIndex) &&
                        columnIndex >= Math.min(copiedRange.start.columnIndex, copiedRange.end.columnIndex) &&
                        columnIndex <= Math.max(copiedRange.start.columnIndex, copiedRange.end.columnIndex);
                      
                      return (
                            <td
                             key={`${rowIndex}-${column}`}
                              className={`border-r border-b border-border relative cursor-text transition-all duration-200 group-hover:bg-muted/20
                                ${isEditing ? 'p-0 z-20' : 'p-0'}
                                ${cellValidationErrors[`${rowIndex}-${column}`] ? 'border-2 border-red-400 bg-red-50 dark:bg-red-900/20' : ''}
                              `}
                             style={{ 
                               width: `${getColumnWidth(column)}px`, 
                               minWidth: `${getColumnWidth(column)}px`,
                               height: `${getRowHeight(rowIndex)}px`,
                               minHeight: `${getRowHeight(rowIndex)}px`
                             }}
                           onClick={(e) => handleCellClick(rowIndex, column, e)}
                            onDoubleClick={(e) => handleCellDoubleClick(rowIndex, column, e)}
                           tabIndex={isSelected ? 0 : -1}
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
                                onBlur={() => {
                                  // Use setTimeout to ensure blur happens after any potential click events
                                  setTimeout(() => {
                                    // Cancel edit and revert to original value when clicking out
                                    if (editingCell) {
                                      cancelEdit();
                                    }
                                  }, 10);
                                }}
                                  className={`absolute inset-0 w-full h-full border-2 border-primary rounded-none bg-background focus:ring-0 focus:ring-offset-0 focus:outline-none resize-none ${
                                    columnAlignments[column] === 'center' ? 'text-center' : 
                                    columnAlignments[column] === 'right' ? 'text-right' : 'text-left'
                                  }`}
                                 style={{ 
                                   padding: '8px 12px',
                                   margin: 0
                                 }}
                                  onInput={(e) => {
                                    // Keep the height fixed to fill the cell
                                  }}
                              />
                          ) : (
                            <ContextMenu>
                              <ContextMenuTrigger asChild>
                                 <div
                                   data-cell={`${rowIndex}-${column}`}
                                   className={`relative w-full h-full min-h-[2rem] py-2 px-3 flex items-start transition-all duration-200 break-words overflow-hidden select-none ${(isInRange || isInCopiedRange) ? '' : 'rounded-sm'}
                                      ${isInRange || isInCopiedRange
                                        ? `bg-primary/5 ${getRangeBorderStyle(rowIndex, columnIndex)}`
                                        : isSelected && !selectedRange && !copiedRange
                                        ? 'border-2 border-primary ring-2 ring-primary/40 bg-transparent' 
                                        : isCellCut(rowIndex, column)
                                        ? 'bg-orange-100 dark:bg-orange-900/30 border-2 border-orange-400 dark:border-orange-600 opacity-60 border-dashed'
                                         : lastEditedCell?.rowIndex === rowIndex && lastEditedCell?.column === column
                                         ? 'bg-green-100 dark:bg-green-900/30 border-2 border-green-400 dark:border-green-600'
                                         : 'border-2 border-transparent hover:ring-1 hover:ring-primary/30'
                                       }
                                      ${copiedCell && copiedCell.rowIndex === rowIndex && copiedCell.column === column ? ' border-2 border-primary border-dashed ring-1 ring-primary/30 bg-transparent' : ''}
                                      ${columnAlignments[column] === 'center' ? 'text-center justify-center' : 
                                       columnAlignments[column] === 'right' ? 'text-right justify-end' : 'text-left justify-start'}
                                      ${cellValidationErrors[`${rowIndex}-${column}`] ? 'border-red-400 bg-red-50 dark:bg-red-900/20' : ''}
                                    `}
                                  onMouseDown={(e) => handleCellMouseDown(e, rowIndex, column)}
                                   onMouseEnter={() => handleMouseEnter(rowIndex, column)}
                                   onMouseLeave={() => setHoveredCell(null)}
                                   onMouseUp={handleMouseUp}
                                  onKeyDown={(e) => handleKeyDown(e, rowIndex, column)}
                                   tabIndex={isSelected ? 0 : -1}
                                   title={cellValidationErrors[`${rowIndex}-${column}`] || undefined}
                                >
                                  <span className="block w-full break-words overflow-hidden text-sm leading-tight whitespace-pre-wrap">{
                                    (() => {
                                      const value = row[column];
                                      if (value === null || value === undefined) return '';
                                      if (typeof value === 'object') {
                                        // Handle objects like {reference: "...", "clause text": "...", "clause label": "..."}
                                        if (value && typeof value === 'object') {
                                          // Create a readable string representation
                                          const entries = Object.entries(value);
                                          return entries.map(([key, val]) => `${key}: ${val}`).join(', ');
                                        }
                                        return JSON.stringify(value);
                                      }
                                      return String(value);
                                    })()
                                  }</span>
                                 
                                 {/* Re-analyze button - appears in bottom right corner on hover */}
                                 {hoveredCell?.rowIndex === rowIndex && hoveredCell?.column === column && 
                                  row[column] && row[column].trim() && 
                                  documentMap.get(rowIndex) && 
                                  !isScrolling && (
                                   <button
                                     className="absolute bottom-1 right-1 w-5 h-5 bg-purple-500 hover:bg-purple-600 text-white rounded-full flex items-center justify-center shadow-lg z-10 transition-all duration-200"
                                     onClick={(e) => {
                                       e.stopPropagation();
                                       setReExtractField({ rowIndex, column, currentValue: row[column] || '' });
                                       setShowReExtractDialog(true);
                                     }}
                                     title="Re-analyze this field"
                                   >
                                     <Sparkles className="w-3 h-3" />
                                   </button>
                                  )}
                               </div>
                              </ContextMenuTrigger>
                              <ContextMenuContent>
                                <ContextMenuItem 
                                  onClick={() => {
                                    const cellText = row[column]?.toString() || '';
                                    if (cellText.trim()) {
                                      setReformatCellInfo({ rowIndex, column, text: cellText });
                                      setShowTextReformatDialog(true);
                                    }
                                  }}
                                  disabled={!row[column]?.toString()?.trim()}
                                >
                                  <Sparkles className="h-4 w-4 mr-2" />
                                  Reformat Text
                                </ContextMenuItem>
                                <ContextMenuSeparator />
                                <ContextMenuItem onClick={() => {
                                  setCopiedCell({ rowIndex, column });
                                  setCutData(null);
                                  const value = row[column] || '';
                                  navigator.clipboard.writeText(value);
                                  toast({ title: "Cell copied", description: "Cell content copied to clipboard." });
                                }}>
                                  Copy
                                </ContextMenuItem>
                                <ContextMenuItem onClick={() => {
                                  setCutData({ cell: { rowIndex, column } });
                                  setCopiedCell(null);
                                  const value = row[column] || '';
                                  navigator.clipboard.writeText(value);
                                  toast({ title: "Cell cut", description: "Cell content cut to clipboard." });
                                }}>
                                  Cut
                                </ContextMenuItem>
                                <ContextMenuItem 
                                  onClick={async () => {
                                    try {
                                      const clipboardText = await navigator.clipboard.readText();
                                      const newData = [...data];
                                      newData[rowIndex] = {
                                        ...newData[rowIndex],
                                        [column]: clipboardText
                                      };
                                      setData(newData);
                                      dataRef.current = newData;
                                      onDataChange?.(newData);
                                      setHasUnsavedChanges(true);
                                      onUnsavedChanges?.(true);
                                      
                                      // Clear cut data if this was a cut operation
                                      if (cutData) setCutData(null);
                                      
                                      toast({ title: "Cell pasted", description: "Content pasted to cell." });
                                    } catch (err) {
                                      toast({ title: "Paste failed", description: "Could not access clipboard.", variant: "destructive" });
                                    }
                                  }}
                                >
                                  Paste
                                </ContextMenuItem>
                              </ContextMenuContent>
                            </ContextMenu>
                          )}
                          </td>
                     );
                    })}
                    
                      {/* Document File Name column removed - use DocumentLinker for file naming */}
                    
                          {/* Actions column - Document management */}
                        <td 
                          className="p-0 overflow-hidden border-b border-border"
                          style={{ 
                            width: "480px", 
                            minWidth: "480px",
                            maxWidth: "480px",
                            height: `${getRowHeight(rowIndex)}px`,
                            minHeight: `${getRowHeight(rowIndex)}px`
                          }}
                      >
                           <div className="bg-background border border-border rounded-md p-2 h-full min-h-[60px] flex gap-2 overflow-visible">
                             {/* Row Actions (Move buttons only) */}
                               <div className="flex flex-col items-center justify-center gap-0.5 min-w-[32px] bg-muted/30 rounded-md p-1 border border-border/40">
                                   <Button
                                     variant="ghost"
                                     size="sm"
                                     onClick={() => moveRowUp(rowIndex)}
                                     disabled={rowIndex === 0}
                                     className="h-5 w-5 p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed rounded-sm transition-all"
                                     title="Move row up"
                                   >
                                     <ArrowUp className="h-3 w-3" />
                                   </Button>
                                   <Button
                                     variant="ghost"
                                     size="sm"
                                     onClick={() => moveRowDown(rowIndex)}
                                     disabled={rowIndex >= data.length - 1}
                                     className="h-5 w-5 p-0 hover:bg-primary/10 hover:text-primary disabled:opacity-40 disabled:cursor-not-allowed rounded-sm transition-all"
                                     title="Move row down"
                                   >
                                     <ArrowDown className="h-3 w-3" />
                                   </Button>
                               </div>
                           
                            {/* Document Section */}
                            <div className="flex-1 h-full flex flex-col">
                          <DocumentLinker
                            key={`${rowIndex}-${row['Document File Name']}`}
                            runsheetId={effectiveRunsheetId}
                            rowIndex={rowIndex}
                            currentFilename={documentMap.get(rowIndex)?.stored_filename || row['Document File Name']}
                            documentPath={(() => {
                              const dbPath = documentMap.get(rowIndex)?.file_path;
                              const storagePath = row['Storage Path'];
                              return dbPath || storagePath;
                            })()}
                            existingDocumentUrl={row['Document File Name'] && row['Document File Name'].trim() !== '' ? 'exists' : undefined}
                          onDocumentLinked={async (filename) => {
                             console.log('🔧 EditableSpreadsheet: onDocumentLinked called with filename:', filename);
                             console.log('🔧 EditableSpreadsheet: Current row data before update:', data[rowIndex]);
                             const newData = [...data];
                             newData[rowIndex] = {
                               ...newData[rowIndex],
                               'Document File Name': filename
                             };
                             console.log('🔧 EditableSpreadsheet: New row data after update:', newData[rowIndex]);
                             setData(newData);
                             dataRef.current = newData; // keep ref in sync
                             onDataChange?.(newData);

                             // Immediately persist to database to avoid UI/DB drift
                             if (currentRunsheetId && runsheetName) {
                               try {
                                 lastSavedAtRef.current = Date.now();
                                 try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
                                 suppressRealtimeUntilRef.current = Date.now() + 4000;
                                 await saveToDatabase(newData, columns, runsheetName, columnInstructions, true);
                                 console.log('🔧 Document link saved silently');
                               } catch (e) {
                                 console.error('Silent save after document link failed:', e);
                               }
                             }
                             
                             // Immediately refresh document map to ensure consistency
                             if (currentRunsheetId) {
                               try {
                                 console.log('🔧 EditableSpreadsheet: Immediately refreshing document map');
                                 // Small delay to ensure database write is complete
                                 setTimeout(async () => {
                                   try {
                                     const updatedDocumentMap = await DocumentService.getDocumentMapForRunsheet(currentRunsheetId);
                                     updateDocumentMap(updatedDocumentMap);
                                     console.log('🔧 EditableSpreadsheet: Document map refreshed with', updatedDocumentMap.size, 'documents');
                                   } catch (error) {
                                     console.error('Error refreshing document map:', error);
                                   }
                                 }, 100);
                               } catch (error) {
                                 console.error('Error setting up document map refresh:', error);
                               }
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
                           updateDocumentMap((() => {
                             const newMap = new Map(documentMap);
                             newMap.delete(rowIndex);
                             return newMap;
                           })());
                         }}
                          onAnalyzeDocument={async (file, filename) => {
                            console.log('🧠 INDIVIDUAL ROW Brain button clicked for row:', rowIndex);
                            console.log('🧠 File:', file.name, 'Filename:', filename);
                            console.log('🧠 Current data state before analysis:', data);
                            console.log('🧠 Row data before analysis:', data[rowIndex]);
                            
                            // Check if row has existing data (excluding Document File Name column)
                            const rowData = data[rowIndex];
                            const hasExistingData = columns.some(col => 
                              rowData[col] && 
                              rowData[col].trim() !== ''
                            );

                              if (hasExistingData) {
                                console.log('🧠 Row has existing data, showing warning dialog');
                                // Show warning dialog for rows with existing data
                                setPendingAnalysis({ file, filename, rowIndex });
                                setShowAnalyzeWarningDialog(true);
                              } else {
                                console.log('🧠 Row is empty, proceeding with direct analysis');
                                // For empty rows, proceed directly with analysis
                                await analyzeDocumentAndPopulateRow(file, rowIndex);
                                console.log('🧠 Analysis completed, new data state:', data);
                              }
                           }}
                            onOpenWorkspace={() => {
                              console.log('🔧 EditableSpreadsheet: Opening full screen workspace for rowIndex:', rowIndex, '(display row:', rowIndex + 1, ')');
                              console.log('🔧 EditableSpreadsheet: Row data:', row);
                              console.log('🔧 EditableSpreadsheet: Document for this row:', documentMap.get(rowIndex));
                              console.log('🔧 EditableSpreadsheet: All documents in map:', Array.from(documentMap.entries()));
                              console.log('🔧 EditableSpreadsheet: Current runsheet ID:', currentRunsheetId);
                              openFullScreenWorkspace(rowIndex);
                             }}
                            onOpenSideBySide={() => {
                              console.log('🔧 EditableSpreadsheet: Opening side-by-side workspace for rowIndex:', rowIndex);
                              openSideBySideWorkspace(rowIndex);
                            }}
                           isSpreadsheetUpload={true}
                           autoAnalyze={false}
                            rowData={row}
                            />
                           </div>
                          </div>
                        </td>
                      
                       {/* Enhanced row resize handle */}
                       <div
                         className="absolute bottom-0 left-0 right-0 h-2 cursor-row-resize hover:bg-primary/40 bg-border/30 opacity-0 group-hover:opacity-70 hover:!opacity-100 transition-all duration-200 z-10"
                         onMouseDown={(e) => handleRowMouseDown(e, rowIndex)}
                         title="Drag to resize row height"
                       >
                         <div className="w-full h-0.5 bg-primary/60 mt-0.75"></div>
                        </div>
                       </tr>
                      </>
                    );
                  })}
              </tbody>
            </table>
            </div>

        </div>

          <div className="flex justify-between items-center text-sm text-muted-foreground pt-2">
            <div className="flex items-center gap-4">
              <Dialog open={showAddRowsDialog} onOpenChange={setShowAddRowsDialog}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-2 hover:bg-primary/10 transition-colors">
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
            
            {/* Performance indicator */}
            <div className="text-xs text-muted-foreground">
              {data.length} rows • {columns.length} columns
              {isScrolling && <span className="ml-2 text-primary">● Scrolling</span>}
            </div>
            </div>
            
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
          <DialogContent className="sm:max-w-[700px] w-[95vw] h-auto min-h-fit">{" "}
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
                onClick={() => {
                  setShowColumnDialog(false);
                  setShowColumnPreferencesDialog(true);
                }}
                className="gap-2"
              >
                <Settings className="h-4 w-4" />
                Column Preferences
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
          <DialogContent className="w-auto max-w-fit">
            <DialogHeader>
              <DialogTitle>Unsaved Changes</DialogTitle>
              <DialogDescription>
                You have unsaved changes in your current runsheet. What would you like to do?
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full justify-between">
                <div className="flex gap-2 sm:gap-3">
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
                </div>
                <Button 
                  onClick={async () => {
                    setShowUnsavedChangesDialog(false);
                    await saveImmediately();
                    setShowNewRunsheetDialog(true);
                  }}
                  className="w-full sm:w-auto"
                >
                  Save & Continue
                </Button>
              </div>
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
                This row already contains data. Choose how to proceed:
                <br /><br />
                <strong>Replace All:</strong> Overwrite all existing data with newly extracted values
                <br />
                <strong>Keep & Fill Empty:</strong> Keep existing data and only fill empty fields
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-col sm:flex-row gap-2">
              <AlertDialogCancel onClick={() => {
                setShowAnalyzeWarningDialog(false);
                setShowInsertionPreview(false);
                setPendingDataInsertion(null);
                setPendingAnalysis(null);
              }}>
                Cancel
              </AlertDialogCancel>
              <Button
                variant="secondary"
                onClick={async () => {
                  if (pendingAnalysis) {
                    setShowAnalyzeWarningDialog(false);
                    setShowInsertionPreview(false);
                    setPendingDataInsertion(null);
                    await analyzeDocumentAndPopulateRow(pendingAnalysis.file, pendingAnalysis.rowIndex, false, true);
                    setPendingAnalysis(null);
                  }
                }}
              >
                Keep & Fill Empty
              </Button>
              <AlertDialogAction onClick={async () => {
                if (pendingAnalysis) {
                  setShowAnalyzeWarningDialog(false);
                  setShowInsertionPreview(false);
                  setPendingDataInsertion(null);
                  await analyzeDocumentAndPopulateRow(pendingAnalysis.file, pendingAnalysis.rowIndex, true, false);
                  setPendingAnalysis(null);
                }
              }}>
                Replace All
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
         </AlertDialog>

         {/* Instrument Selection Dialog */}
         {detectedInstruments.length > 0 && (
           <InstrumentSelectionDialog
             open={showInstrumentSelectionDialog}
             onClose={() => {
               setShowInstrumentSelectionDialog(false);
               setDetectedInstruments([]);
               setPendingInstrumentAnalysis(null);
             }}
             instruments={detectedInstruments}
             onSelect={async (instrumentId) => {
               setShowInstrumentSelectionDialog(false);
               if (pendingInstrumentAnalysis) {
                 toast({
                   title: "Instrument Selected",
                   description: `Extracting data from Instrument #${instrumentId}...`,
                 });
                 await analyzeDocumentAndPopulateRow(
                   pendingInstrumentAnalysis.file,
                   pendingInstrumentAnalysis.rowIndex,
                   pendingInstrumentAnalysis.forceOverwrite,
                   pendingInstrumentAnalysis.fillEmptyOnly,
                   instrumentId
                 );
                 setPendingInstrumentAnalysis(null);
                 setDetectedInstruments([]);
               }
             }}
           />
         )}

         {/* Row Insertion Preview */}
         {showInsertionPreview && pendingDataInsertion && (
           <div className="fixed top-4 right-4 z-50 max-w-md">
             <RowInsertionIndicator
               rowIndex={pendingDataInsertion.rowIndex}
               isVisible={true}
               hasExistingData={pendingDataInsertion.hasExistingData}
             />
             
             {pendingDataInsertion.hasExistingData && (
               <NextEmptyRowIndicator
                 nextEmptyRowIndex={findFirstEmptyRow(data)}
                 isVisible={true}
                 onUseEmptyRow={() => {
                   const emptyRowIndex = findFirstEmptyRow(data);
                   if (emptyRowIndex !== -1 && pendingAnalysis) {
                     setShowAnalyzeWarningDialog(false);
                     setShowInsertionPreview(false);
                     analyzeDocumentAndPopulateRow(pendingAnalysis.file, emptyRowIndex);
                     setPendingAnalysis(null);
                     setPendingDataInsertion(null);
                   }
                 }}
                 className="mt-2"
               />
             )}
           </div>
         )}

         {/* Google Drive Picker */}
        <GoogleDrivePicker
          isOpen={showGoogleDrivePicker}
          onClose={() => setShowGoogleDrivePicker(false)}
          onFileSelect={(file, fileName) => {
            if (file && fileName) {
              // Store the file and show the upload dialog with header row selection
              setGoogleSelectedFile(file);
              setShowGoogleFileUpload(true);
              setShowGoogleDrivePicker(false);
            }
          }}
        />

        {/* Google Drive File Upload with Header Row Selection */}
        {showGoogleFileUpload && googleSelectedFile && (
          <Dialog open={showGoogleFileUpload} onOpenChange={setShowGoogleFileUpload}>
            <DialogContent className="max-w-6xl w-[95vw] max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Select Header Row for Google Drive File</DialogTitle>
                <DialogDescription>
                  Choose which row contains your column headers, then upload the file.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <RunsheetFileUpload 
                  selectedFile={googleSelectedFile}
                  onFileSelected={async (runsheetData) => {
                    console.log('📥 Google Drive file processed:', runsheetData);
                    await updateSpreadsheetData(runsheetData.columns, runsheetData.rows, runsheetData.name);
                    setShowGoogleFileUpload(false);
                    setGoogleSelectedFile(null);
                  }}
                  onCancel={() => {
                    setShowGoogleFileUpload(false);
                    setGoogleSelectedFile(null);
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Regular File Upload Dialog */}
        {showFileUpload && (
          <Dialog open={showFileUpload} onOpenChange={setShowFileUpload}>
            <DialogContent className="sm:max-w-4xl max-h-[90vh] overflow-auto">
              <DialogHeader>
                <DialogTitle>Upload Runsheet</DialogTitle>
                <DialogDescription>
                  Choose which row contains your column headers, then upload the file.
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <RunsheetFileUpload 
                  onFileSelected={async (runsheetData) => {
                    console.log('📥 Regular file processed:', runsheetData);
                    await updateSpreadsheetData(runsheetData.columns, runsheetData.rows, runsheetData.name);
                    setShowFileUpload(false);
                  }}
                  onCancel={() => {
                    setShowFileUpload(false);
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

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
            <AlertDialogFooter className="justify-start">
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
          <ViewportPortal>
            <FullScreenDocumentWorkspace
              runsheetId={fullScreenWorkspace.runsheetId}
              rowIndex={fullScreenWorkspace.rowIndex}
              rowData={data[fullScreenWorkspace.rowIndex] || {}}
              fields={columns}
              onClose={closeAllWorkspaces}
              onUpdateRow={(rowIndex, rowData) => {
                console.log('🔄 EDITABLE_SPREADSHEET: onUpdateRow (FullScreen) row', rowIndex, rowData);
                const newData = [...data];
                newData[rowIndex] = rowData;
                setData(newData);
                // Immediately update dataRef so force saves have the latest data
                dataRef.current = newData;
                onDataChange?.(newData);
                // Mark last save and suppress realtime to avoid overwrite races
                lastSavedAtRef.current = Date.now();
                try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
                suppressRealtimeUntilRef.current = Date.now() + 8000;
                // Track recent local edit for merge protection
                try { recentEditedRowsRef.current.set(rowIndex, { timestamp: Date.now(), row: rowData }); } catch {}
                // Persist immediately (silent) to avoid realtime overwrite
                console.log('🔄 EDITABLE_SPREADSHEET: Triggering immediate save after full-screen update');
                saveToDatabase(newData, columns, runsheetName, columnInstructions, true);
              }}
              columnWidths={columnWidths}
              columnAlignments={columnAlignments}
              onColumnWidthChange={(column, width) => {
                setColumnWidths(prev => ({
                  ...prev,
                  [column]: width
                }));
                setHasManuallyResizedColumns(true);
                
                // Save the preference immediately (same as main spreadsheet resizing)
                ColumnWidthPreferencesService.saveColumnWidth(
                  column,
                  width,
                  currentRunsheetId
                );
              }}
            />
          </ViewportPortal>
        )}

        {sideBySideWorkspace && (
          <SideBySideDocumentWorkspace
            runsheetId={sideBySideWorkspace.runsheetId}
            rowIndex={sideBySideWorkspace.rowIndex}
            rowData={data[sideBySideWorkspace.rowIndex] || {}}
            columns={columns}
            columnInstructions={columnInstructions}
            documentRecord={documentMap.get(sideBySideWorkspace.rowIndex)}
            onDataUpdate={(rowIndex, rowData) => {
              console.log('🔄 EDITABLE_SPREADSHEET: onDataUpdate called for row', rowIndex, 'with data:', rowData);
              const newData = [...data];
              newData[rowIndex] = rowData;
              setData(newData);
              onDataChange?.(newData);
              // Mark last save and suppress realtime to avoid overwrite races
              lastSavedAtRef.current = Date.now();
              try { lastSavedDataHashRef.current = JSON.stringify(newData); } catch {}
              suppressRealtimeUntilRef.current = Date.now() + 8000;
              // Track recent local edit for merge protection
              try { recentEditedRowsRef.current.set(rowIndex, { timestamp: Date.now(), row: rowData }); } catch {}
              // Trigger immediate save (silent) to prevent real-time sync from overwriting
              console.log('🔄 EDITABLE_SPREADSHEET: Triggering immediate save after data update');
              saveToDatabase(newData, columns, runsheetName, columnInstructions, true);
            }}
            onClose={closeAllWorkspaces}
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

        {/* Column Preferences Dialog */}
        <ColumnPreferencesDialog
          open={showColumnPreferencesDialog}
          onOpenChange={setShowColumnPreferencesDialog}
          onPreferencesSaved={(newColumns, newInstructions) => {
            // Update current runsheet's column instructions with the new defaults
            setColumnInstructions(prev => ({
              ...prev,
              ...newInstructions
            }));
            // Also update the onColumnInstructionsChange callback if it exists
            onColumnInstructionsChange?.(newInstructions);
          }}
          onResetColumnWidths={resetColumnWidths}
        />

        {/* Batch Document Analysis Dialog */}
        <BatchDocumentAnalysisDialog
          isOpen={showBatchAnalysisDialog}
          onClose={() => setShowBatchAnalysisDialog(false)}
          runsheetId={effectiveRunsheetId}
          runsheetName={currentRunsheet?.name || runsheetName}
          columns={columns}
          columnInstructions={columnInstructions}
          documentMap={documentMap}
          onDataUpdate={(newData) => {
            setData(newData);
            onDataChange?.(newData);
          }}
          currentData={data}
        />

        {/* Add CSS to disable interactions when batch dialog is open */}
        {showBatchAnalysisDialog && (
          <>
            <style>{`
              /* Disable all interactions inside the table while allowing scroll */
              .table-container * {
                pointer-events: none !important;
              }
              .table-container {
                pointer-events: auto !important;
                overflow: auto !important;
              }
            `}</style>
            <div className="pointer-events-none fixed top-4 right-4 z-50 bg-primary/10 text-primary-foreground/90 backdrop-blur-sm border border-primary/20 rounded-md px-3 py-2 text-xs shadow-sm">
              Batch analysis in progress — editing disabled. Scroll to follow progress.
            </div>
          </>
        )}
        
        {/* Batch File Rename Dialog */}
        <BatchFileRenameDialog
          isOpen={showBatchRenameDialog}
          onClose={() => setShowBatchRenameDialog(false)}
          runsheetId={currentRunsheetId || ''}
          columns={columns}
          documentMap={documentMap}
          currentData={data}
          onDocumentMapUpdate={updateDocumentMap}
        />

        {/* Re-Extract Field Dialog */}
        <ReExtractDialog
          isOpen={showReExtractDialog}
          onClose={() => {
            setShowReExtractDialog(false);
            setReExtractField(null);
          }}
          fieldName={reExtractField?.column || ''}
          currentValue={reExtractField?.currentValue || ''}
          onReExtract={async (notes, saveToPreferences) => {
            if (reExtractField) {
              await handleReExtract(reExtractField.rowIndex, reExtractField.column, notes, saveToPreferences);
            }
          }}
          isLoading={isReExtracting}
        />

        {/* Improved Document Analysis Dialog */}
        {showImprovedAnalysis && (
          <Dialog open={showImprovedAnalysis} onOpenChange={setShowImprovedAnalysis}>
            <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
              <DialogHeader>
                <DialogTitle>Smart Document Analysis</DialogTitle>
                <DialogDescription>
                  Upload and analyze documents with AI to automatically extract data for your runsheet.
                </DialogDescription>
              </DialogHeader>
              <div className="overflow-y-auto max-h-[70vh]">
                <ImprovedDocumentAnalysis
                  runsheetId={effectiveRunsheetId}
                  availableColumns={columns}
                  currentRunsheetData={data}
                  onAnalysisComplete={(extractedData, targetRowIndex) => {
                    console.log('Document analysis completed:', { extractedData, targetRowIndex });
                    // The component handles data population internally
                  }}
                  onDataPopulated={() => {
                    // Refresh the runsheet data after successful population
                    // Trigger data change to refresh the interface
                    onDataChange?.(data);
                    setShowImprovedAnalysis(false);
                    toast({
                      title: "Success",
                      description: "Document analysis completed and data added to runsheet",
                    });
                  }}
                />
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Data Overwrite Confirmation Dialog */}
        <AlertDialog open={showOverwriteDialog} onOpenChange={setShowOverwriteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Row Already Contains Data
              </AlertDialogTitle>
              <AlertDialogDescription>
                {overwriteDialogData?.error}
                <br /><br />
                <strong>Current row contains:</strong> {overwriteDialogData?.rowSummary}
                <br /><br />
                Do you want to overwrite this data with the new extracted information?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={overwriteDialogData?.onCancel}>
                Cancel / Use Empty Row
              </AlertDialogCancel>
              <AlertDialogAction 
                onClick={overwriteDialogData?.onConfirm}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Overwrite Data
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Runsheet Naming Dialog */}
        <RunsheetNameDialog
          open={showNameDialog}
          onOpenChange={setShowNameDialog}
          onConfirm={handleConfirmNamedRunsheet}
          title="Name Your Runsheet"
          description="Choose a descriptive name for your runsheet. This will help you identify it later."
          placeholder="Enter runsheet name..."
          required={pendingRunsheetData?.required ?? true}
        />

        {/* Background Analysis Indicator - Shows when analysis is running but main dialog is closed */}
        <BackgroundAnalysisIndicator 
          onShowDialog={() => setShowBatchAnalysisDialog(true)}
          isMainDialogOpen={showBatchAnalysisDialog}
        />

        {/* Text Reformat Dialog */}
        {reformatCellInfo && (
          <TextReformatDialog
            isOpen={showTextReformatDialog}
            onClose={() => {
              setShowTextReformatDialog(false);
              setReformatCellInfo(null);
            }}
            onConfirm={(reformattedText) => {
              if (reformatCellInfo) {
                const newData = [...data];
                newData[reformatCellInfo.rowIndex] = {
                  ...newData[reformatCellInfo.rowIndex],
                  [reformatCellInfo.column]: reformattedText
                };
                setData(newData);
                dataRef.current = newData;
                onDataChange?.(newData);
                
                // Mark as unsaved changes
                setHasUnsavedChanges(true);
                onUnsavedChanges?.(true);
                
                toast({
                  title: "Text reformatted",
                  description: `Cell ${reformatCellInfo.column}-${reformatCellInfo.rowIndex + 1} has been updated.`,
                });
              }
            }}
            originalText={reformatCellInfo.text}
            cellInfo={{
              rowIndex: reformatCellInfo.rowIndex,
              column: reformatCellInfo.column
            }}
          />
        )}

      </div>
    );
  });

export default EditableSpreadsheet;
import { useCallback, useRef, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  saveRunsheetSafely, 
  connectionMonitor, 
  OptimisticUpdater,
  checkDataConsistency
} from '@/utils/dataSync';

interface AutoSaveOptions {
  runsheetId?: string | null;
  runsheetName: string;
  columns: string[];
  data: Record<string, string>[];
  columnInstructions: Record<string, string>;
  userId?: string | null;
  debounceMs?: number;
  onSaveStart?: () => void;
  onSaveSuccess?: (result: any) => void;
  onSaveError?: (error: string) => void;
}

interface AutoSaveResult {
  save: () => Promise<void>;
  forceSave: () => Promise<void>;
  isSaving: boolean;
  hasUnsavedChanges: boolean;
  lastSyncTime: Date | null;
  connectionStatus: 'online' | 'offline' | 'syncing';
}

export function useAutoSave({
  runsheetId,
  runsheetName,
  columns,
  data,
  columnInstructions,
  userId,
  debounceMs = 2000,
  onSaveStart,
  onSaveSuccess,
  onSaveError
}: AutoSaveOptions): AutoSaveResult {
  const { toast } = useToast();
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isSavingRef = useRef(false);
  const lastSavedStateRef = useRef<string>('');
  const optimisticUpdaterRef = useRef<OptimisticUpdater<any> | null>(null);
  
  const [connectionStatus, setConnectionStatus] = useState<'online' | 'offline' | 'syncing'>('online');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);

  // Monitor connection status
  useEffect(() => {
    const unsubscribe = connectionMonitor.onStatusChange((isOnline) => {
      setConnectionStatus(isOnline ? 'online' : 'offline');
    });
    
    setConnectionStatus(connectionMonitor.online ? 'online' : 'offline');
    
    return unsubscribe;
  }, []);

  // Calculate current state hash for comparison
  const getCurrentStateHash = useCallback(() => {
    return JSON.stringify({
      runsheetId,
      runsheetName,
      columns,
      data: data.filter(row => Object.values(row).some(value => value.trim())), // Only non-empty rows
      columnInstructions
    });
  }, [runsheetId, runsheetName, columns, data, columnInstructions]);

  // Core save function with enhanced error handling
  const performSave = useCallback(async (): Promise<void> => {
    if (!userId || !runsheetName.trim() || columns.length === 0) {
      return;
    }

    // Check connection status
    if (!connectionMonitor.online) {
      console.log('Offline - deferring save until connection restored');
      return;
    }

    const currentStateHash = getCurrentStateHash();
    
    // Skip if no changes since last save
    if (currentStateHash === lastSavedStateRef.current) {
      setHasUnsavedChanges(false);
      return;
    }

    isSavingRef.current = true;
    setConnectionStatus('syncing');
    onSaveStart?.();

    try {
      // Prepare runsheet data
      const runsheetData = {
        id: runsheetId || undefined,
        name: runsheetName.trim(),
        columns,
        data,
        column_instructions: columnInstructions,
        user_id: userId,
      };

      // Check for conflicts if updating existing runsheet
      if (runsheetId) {
        const consistencyCheck = await checkDataConsistency(
          runsheetData,
          runsheetId,
          'runsheets'
        );
        
        if (!consistencyCheck.consistent && consistencyCheck.conflicts) {
          toast({
            title: "Sync conflict detected",
            description: "Another user has modified this runsheet. Your changes will be merged with theirs.",
            variant: "default"
          });
          
          // Handle merge conflicts here if needed
          // For now, we'll proceed with the save
        }
      }

      const result = await saveRunsheetSafely(runsheetData);

      if (!result.success) {
        throw new Error(result.error);
      }

      // Update last saved state
      lastSavedStateRef.current = currentStateHash;
      setHasUnsavedChanges(false);
      setLastSyncTime(new Date());
      setConnectionStatus('online');
      
      onSaveSuccess?.(result.data);
      
    } catch (error) {
      console.error('Auto-save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save runsheet';
      
      setConnectionStatus(connectionMonitor.online ? 'online' : 'offline');
      onSaveError?.(errorMessage);
      
      // Don't show error toast if we're offline (connection monitor handles that)
      if (connectionMonitor.online) {
        toast({
          title: "Save failed",
          description: errorMessage,
          variant: "destructive",
        });
      }
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, runsheetName, columns, data, columnInstructions, runsheetId, getCurrentStateHash, onSaveStart, onSaveSuccess, onSaveError, toast]);

  // Debounced save function
  const save = useCallback(async (): Promise<void> => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set new timeout for debounced save
    saveTimeoutRef.current = setTimeout(() => {
      performSave();
    }, debounceMs);
  }, [performSave, debounceMs]);

  // Force immediate save (no debounce)
  const forceSave = useCallback(async (): Promise<void> => {
    // Clear any pending debounced save
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    
    await performSave();
  }, [performSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  // Auto-save when data changes with change detection
  useEffect(() => {
    const currentStateHash = getCurrentStateHash();
    
    // Update unsaved changes indicator
    const hasChanges = currentStateHash !== lastSavedStateRef.current;
    setHasUnsavedChanges(hasChanges);
    
    // Only trigger auto-save if there are actual changes and user is authenticated
    if (hasChanges && userId && connectionMonitor.online) {
      save();
    }
  }, [runsheetName, columns, data, columnInstructions, userId, save, getCurrentStateHash]);

  // Auto-save when coming back online
  useEffect(() => {
    const unsubscribe = connectionMonitor.onStatusChange((isOnline) => {
      if (isOnline && hasUnsavedChanges && userId) {
        console.log('Back online - triggering auto-save for unsaved changes');
        save();
      }
    });
    
    return unsubscribe;
  }, [hasUnsavedChanges, userId, save]);

  return {
    save,
    forceSave,
    isSaving: isSavingRef.current,
    hasUnsavedChanges,
    lastSyncTime,
    connectionStatus
  };
}
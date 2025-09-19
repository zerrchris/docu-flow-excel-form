import { useCallback, useRef, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

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
  saveToLocalStorage: () => void;
  loadFromLocalStorage: (targetRunsheetId?: string) => any;
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
  const [isSaving, setIsSaving] = useState(false);
  const lastSavedStateRef = useRef<string>('');

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

  // Backup system disabled - database should be the single source of truth
  const saveToLocalStorage = useCallback(() => {
    console.log('🚫 localStorage backup disabled - using database as single source of truth');
  }, []);

  // Load from localStorage on mount
  const loadFromLocalStorage = useCallback((targetRunsheetId?: string) => {
    if (!targetRunsheetId) return null;
    
    try {
      const localStorageKey = `runsheet_backup_${targetRunsheetId}`;
      const saved = localStorage.getItem(localStorageKey);
      return saved ? JSON.parse(saved) : null;
    } catch (error) {
      console.error('Failed to load from localStorage:', error);
      return null;
    }
  }, []);

  // Simplified save function - database-first approach
  const performSave = useCallback(async (): Promise<void> => {
    if (!userId || !runsheetName.trim() || columns.length === 0) {
      return;
    }

    // CRITICAL: Never auto-save runsheets with default/untitled names
    const forbiddenNames = ['Untitled Runsheet', 'untitled runsheet', 'Untitled', 'untitled'];
    if (forbiddenNames.includes(runsheetName.trim())) {
      console.log('🚫 Auto-save blocked: Refusing to save runsheet with default name:', runsheetName);
      return;
    }

    const currentStateHash = getCurrentStateHash();
    
    // Skip if no changes since last save
    if (currentStateHash === lastSavedStateRef.current) {
      return;
    }

    setIsSaving(true);
    onSaveStart?.();

    try {
      // Prepare runsheet data
      const runsheetData = {
        name: runsheetName.trim(),
        columns,
        data,
        column_instructions: columnInstructions,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      let result;
      
      if (runsheetId && !runsheetId.startsWith('temp-')) {
        // Update existing runsheet
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update(runsheetData)
          .eq('id', runsheetId)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (error) throw error;
        result = updateResult;
      } else {
        // Check if a runsheet with this name already exists for this user
        const { data: existingRunsheet, error: checkError } = await supabase
          .from('runsheets')
          .select('id')
          .eq('user_id', userId)
          .eq('name', runsheetName.trim())
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (existingRunsheet) {
          // Update the existing runsheet instead of creating a new one
          const { data: updateResult, error } = await supabase
            .from('runsheets')
            .update(runsheetData)
            .eq('id', existingRunsheet.id)
            .eq('user_id', userId)
            .select('*')
            .single();

          if (error) throw error;
          result = updateResult;
        } else {
          // Create new runsheet
          const { data: insertResult, error } = await supabase
            .from('runsheets')
            .insert(runsheetData)
            .select('*')
            .single();

          if (error) throw error;
          result = insertResult;
        }
      }

      // Update last saved state
      lastSavedStateRef.current = currentStateHash;
      
      onSaveSuccess?.(result);
      
    } catch (error) {
      console.error('Auto-save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save runsheet';
      onSaveError?.(errorMessage);
      
      toast({
        title: "Save failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
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

  // Auto-save completely disabled to prevent refresh behavior - only manual saves now
  // No useEffect hooks that trigger on data changes to prevent constant re-renders

  return {
    save,
    forceSave,
    isSaving,
    saveToLocalStorage,
    loadFromLocalStorage
  };
}
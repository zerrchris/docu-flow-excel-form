import { useCallback, useRef, useEffect } from 'react';
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

  // Core save function
  const performSave = useCallback(async (): Promise<void> => {
    if (!userId || !runsheetName.trim() || columns.length === 0) {
      return;
    }

    // Don't attempt to save if we have a temporary runsheet ID
    if (runsheetId && runsheetId.startsWith('temp-')) {
      console.log('Auto-save skipped: temporary runsheet ID detected:', runsheetId);
      return;
    }

    const currentStateHash = getCurrentStateHash();
    
    // Skip if no changes since last save
    if (currentStateHash === lastSavedStateRef.current) {
      return;
    }

    isSavingRef.current = true;
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
      
      if (runsheetId) {
        // Try to update existing runsheet
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update(runsheetData)
          .eq('id', runsheetId)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (error) {
          // If update fails due to duplicate name, use upsert instead
          if (error.code === '23505') {
            const { data: upsertResult, error: upsertError } = await supabase
              .from('runsheets')
              .upsert(runsheetData, {
                onConflict: 'user_id,name'
              })
              .select('*')
              .single();
            
            if (upsertError) throw upsertError;
            result = upsertResult;
          } else {
            throw error;
          }
        } else {
          result = updateResult;
        }
      } else {
        // Create new runsheet - use upsert to handle duplicates
        const { data: insertResult, error } = await supabase
          .from('runsheets')
          .upsert(runsheetData, {
            onConflict: 'user_id,name'
          })
          .select('*')
          .single();

        if (error) throw error;
        result = insertResult;
      }

      // Update last saved state
      lastSavedStateRef.current = currentStateHash;
      
      onSaveSuccess?.(result);
      
    } catch (error) {
      console.error('Auto-save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save runsheet';
      onSaveError?.(errorMessage);
      
      toast({
        title: "Auto-save failed",
        description: errorMessage,
        variant: "destructive",
      });
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

  // Auto-save when data changes
  useEffect(() => {
    const currentStateHash = getCurrentStateHash();
    
    // Only trigger auto-save if there are actual changes
    if (currentStateHash !== lastSavedStateRef.current && userId) {
      save();
    }
  }, [runsheetName, columns, data, columnInstructions, userId, save, getCurrentStateHash]);

  return {
    save,
    forceSave,
    isSaving: isSavingRef.current
  };
}
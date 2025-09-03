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

  // Save to localStorage for immediate persistence (backup)
  const saveToLocalStorage = useCallback(() => {
    if (!runsheetName.trim() || columns.length === 0) return;
    
    try {
      const localStorageKey = `runsheet_backup_${runsheetId || 'temp'}`;
      const backupData = {
        runsheetId,
        runsheetName,
        columns,
        data,
        columnInstructions,
        lastSaved: new Date().toISOString()
      };
      localStorage.setItem(localStorageKey, JSON.stringify(backupData));
    } catch (error) {
      console.error('Failed to save to localStorage:', error);
    }
  }, [runsheetId, runsheetName, columns, data, columnInstructions]);

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

  // Simplified save function - database-first approach with duplicate prevention
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
      
      if (runsheetId && !runsheetId.startsWith('temp-')) {
        // Update existing runsheet
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update(runsheetData)
          .eq('id', runsheetId)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (error) {
          // If it's a duplicate key constraint, try to find the existing runsheet
          if (error.code === '23505') {
            console.log('🔄 Duplicate key constraint, trying to find existing runsheet with name:', runsheetName);
            const { data: existingRunsheet } = await supabase
              .from('runsheets')
              .select('*')
              .eq('user_id', userId)
              .eq('name', runsheetName.trim())
              .single();
            
            if (existingRunsheet) {
              console.log('✅ Found existing runsheet, updating it instead');
              const { data: retryUpdate, error: retryError } = await supabase
                .from('runsheets')
                .update({
                  columns,
                  data,
                  column_instructions: columnInstructions,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', existingRunsheet.id)
                .eq('user_id', userId)
                .select('*')
                .single();
              
              if (retryError) throw retryError;
              result = retryUpdate;
            } else {
              throw error;
            }
          } else {
            throw error;
          }
        } else {
          result = updateResult;
        }
      } else {
        // Check for existing runsheet with same name before creating
        const { data: existingCheck } = await supabase
          .from('runsheets')
          .select('id')
          .eq('user_id', userId)
          .eq('name', runsheetName.trim())
          .maybeSingle();
        
        if (existingCheck) {
          console.log('🔄 Found existing runsheet with same name, updating instead of creating');
          const { data: updateResult, error } = await supabase
            .from('runsheets')
            .update({
              columns,
              data,
              column_instructions: columnInstructions,
              updated_at: new Date().toISOString(),
            })
            .eq('id', existingCheck.id)
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

          if (error) {
            // Handle duplicate key constraint on creation too
            if (error.code === '23505') {
              console.log('🔄 Duplicate key on insert, finding existing and updating');
              const { data: existingRunsheet } = await supabase
                .from('runsheets')
                .select('*')
                .eq('user_id', userId)
                .eq('name', runsheetName.trim())
                .single();
              
              if (existingRunsheet) {
                const { data: retryUpdate, error: retryError } = await supabase
                  .from('runsheets')
                  .update({
                    columns,
                    data,
                    column_instructions: columnInstructions,
                    updated_at: new Date().toISOString(),
                  })
                  .eq('id', existingRunsheet.id)
                  .eq('user_id', userId)
                  .select('*')
                  .single();
                
                if (retryError) throw retryError;
                result = retryUpdate;
              } else {
                throw error;
              }
            } else {
              throw error;
            }
          } else {
            result = insertResult;
          }
        }
      }

      // Update last saved state
      lastSavedStateRef.current = currentStateHash;
      
      onSaveSuccess?.(result);
      
    } catch (error) {
      console.error('Auto-save error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save runsheet';
      onSaveError?.(errorMessage);
      
      // Only show toast for non-duplicate errors
      if (!(error instanceof Error && error.message.includes('duplicate key'))) {
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

  // Auto-save when data changes (simplified - no complex state checking)
  useEffect(() => {
    // CRITICAL: Only auto-save if we have a proper user-defined name
    const forbiddenNames = ['Untitled Runsheet', 'untitled runsheet', 'Untitled', 'untitled'];
    const hasValidName = runsheetName.trim() && !forbiddenNames.includes(runsheetName.trim());
    
    // CRITICAL: Don't auto-save if data is completely empty (prevents overwriting extracted data on load)
    const hasAnyData = data.some(row => 
      Object.values(row).some(value => value && value.trim() !== '')
    );
    
    if (userId && hasValidName && columns.length > 0 && hasAnyData) {
      // Save to localStorage immediately for backup
      saveToLocalStorage();
      // Debounced save to database
      save();
    }
  }, [runsheetName, columns, data, columnInstructions, userId, save, saveToLocalStorage]);

  return {
    save,
    forceSave,
    isSaving: isSavingRef.current,
    saveToLocalStorage,
    loadFromLocalStorage
  };
}
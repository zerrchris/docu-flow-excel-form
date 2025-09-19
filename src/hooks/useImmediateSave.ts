import { useCallback, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface ImmediateSaveOptions {
  runsheetId?: string | null;
  userId?: string | null;
  onSaveStart?: () => void;
  onSaveSuccess?: (result: any) => void;
  onSaveError?: (error: string) => void;
}

interface ImmediateSaveResult {
  saveToDatabase: (
    data: Record<string, string>[], 
    columns: string[], 
    runsheetName: string, 
    columnInstructions: Record<string, string>,
    silent?: boolean  // New parameter for silent saves
  ) => Promise<any>;
  saveAsNewRunsheet: (
    data: Record<string, string>[], 
    columns: string[], 
    runsheetName: string, 
    columnInstructions: Record<string, string>,
    silent?: boolean
  ) => Promise<any>;
  isSaving: boolean;
  isSilentSaving: boolean;  // New state for background saves
}

export function useImmediateSave({
  runsheetId,
  userId,
  onSaveStart,
  onSaveSuccess,
  onSaveError
}: ImmediateSaveOptions): ImmediateSaveResult {
  const { toast } = useToast();
  const isSavingRef = useRef(false);
  const isSilentSavingRef = useRef(false);

  // Immediate database save function
  const saveToDatabase = useCallback(async (
    data: Record<string, string>[], 
    columns: string[], 
    runsheetName: string, 
    columnInstructions: Record<string, string>,
    silent: boolean = false  // Default to false for backwards compatibility
  ): Promise<any> => {
    const trimmedName = runsheetName.trim();

    if (!userId || !trimmedName || columns.length === 0) {
      console.log('⚠️ Skipping save - missing required data');
      return null;
    }

    // Skip save for default/untitled names
    const forbiddenNames = ['Untitled Runsheet', 'untitled runsheet', 'Untitled', 'untitled'];
    if (forbiddenNames.includes(trimmedName)) {
      console.log('🚫 Skipping save - forbidden runsheet name:', trimmedName);
      return null;
    }

    // Check if a save is already in progress (either regular or silent)
    if (isSavingRef.current || isSilentSavingRef.current) {
      console.log('⏳ Save already in progress, skipping...');
      return null;
    }

    // Set the appropriate saving state
    if (silent) {
      isSilentSavingRef.current = true;
    } else {
      isSavingRef.current = true;
      onSaveStart?.();
    }
    
    if (!silent) {
      console.log('💾 Saving immediately to database:', {
        runsheetId,
        dataLength: data.length,
        columnsLength: columns.length,
        runsheetName: trimmedName
      });
    }

    try {
      const runsheetData = {
        name: trimmedName,
        columns,
        data,
        column_instructions: columnInstructions,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      let result;
      
      if (runsheetId && !runsheetId.startsWith('temp-')) {
        // Update existing runsheet - use the provided runsheet ID
        const { data: updateResult, error } = await supabase
          .from('runsheets')
          .update({
            columns,
            data,
            column_instructions: columnInstructions,
            updated_at: new Date().toISOString(),
          })
          .eq('id', runsheetId)
          .eq('user_id', userId)
          .select('*')
          .single();

        if (error) {
          // If name conflict, try updating without changing the name
          if (error.code === '23505' && error.message.includes('runsheets_user_id_name_key')) {
            const { data: retryResult, error: retryError } = await supabase
              .from('runsheets')
              .update({
                columns,
                data,
                column_instructions: columnInstructions,
                updated_at: new Date().toISOString(),
              })
              .eq('id', runsheetId)
              .eq('user_id', userId)
              .select('*')
              .single();
            
            if (retryError) throw retryError;
            result = retryResult;
            if (!silent) console.log('✅ Updated existing runsheet (without name change)');
          } else {
            throw error;
          }
        } else {
          result = updateResult;
          if (!silent) console.log('✅ Updated existing runsheet');
        }
      } else {
        // Check for existing runsheet with same name and generate unique name if needed
        let finalName = runsheetName.trim();
        let attempt = 1;
        const maxAttempts = 10;
        
        while (attempt <= maxAttempts) {
          const { data: existingRunsheet, error: checkError } = await supabase
            .from('runsheets')
            .select('id')
            .eq('user_id', userId)
            .eq('name', finalName)
            .maybeSingle();

          if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
          }

          if (existingRunsheet) {
            // Update existing runsheet
            const { data: updateResult, error } = await supabase
              .from('runsheets')
              .update({
                ...runsheetData,
                name: finalName
              })
              .eq('id', existingRunsheet.id)
              .eq('user_id', userId)
              .select('*')
              .single();

            if (error) throw error;
            result = updateResult;
            if (!silent) console.log('✅ Updated existing runsheet by name');
            break;
          } else {
            // Create new runsheet with unique name
            const { data: insertResult, error } = await supabase
              .from('runsheets')
              .insert({
                ...runsheetData,
                name: finalName
              })
              .select('*')
              .single();

            if (error) throw error;
            result = insertResult;
            if (!silent) console.log('✅ Created new runsheet');
            break;
          }
        }
      }

      // Always call onSaveSuccess, but let the callback know if it was silent
      onSaveSuccess?.(result);
      return result;
      
    } catch (error) {
      console.error('❌ Database save failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save to database';
      
      // Only show toast and call error callback for non-silent saves
      if (!silent) {
        onSaveError?.(errorMessage);
        
        toast({
          title: "Save failed",
          description: "Changes could not be saved. Please check your connection.",
          variant: "destructive"
        });
      }
      
      throw error;
    } finally {
      // Clear the appropriate saving state
      if (silent) {
        isSilentSavingRef.current = false;
      } else {
        isSavingRef.current = false;
      }
    }
  }, [userId, runsheetId, onSaveStart, onSaveSuccess, onSaveError, toast]);

  // Save as a brand-new runsheet, ignoring any existing runsheetId
  const saveAsNewRunsheet = useCallback(async (
    data: Record<string, string>[],
    columns: string[],
    runsheetName: string,
    columnInstructions: Record<string, string>,
    silent: boolean = false
  ): Promise<any> => {
    if (!userId || !runsheetName.trim() || columns.length === 0) {
      console.log('⚠️ Skipping save (new) - missing required data');
      return null;
    }

    if (isSavingRef.current || isSilentSavingRef.current) {
      console.log('⏳ Save already in progress, skipping (new)...');
      return null;
    }

    if (silent) {
      isSilentSavingRef.current = true;
    } else {
      isSavingRef.current = true;
      onSaveStart?.();
      console.log('💾 Saving as NEW runsheet:', { dataLength: data.length, columnsLength: columns.length, runsheetName });
    }

    try {
      const runsheetData = {
        name: runsheetName.trim(),
        columns,
        data,
        column_instructions: columnInstructions,
        user_id: userId,
        updated_at: new Date().toISOString(),
      };

      // Check for existing runsheet with same name and generate unique name if needed
      let finalName = runsheetName.trim();
      let attempt = 1;
      const maxAttempts = 10;
      
      while (attempt <= maxAttempts) {
        const { data: existingRunsheet, error: checkError } = await supabase
          .from('runsheets')
          .select('id')
          .eq('user_id', userId)
          .eq('name', finalName)
          .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
          throw checkError;
        }

        if (existingRunsheet) {
          // Name exists, try with suffix
          finalName = `${runsheetName.trim()} (${attempt})`;
          attempt++;
        } else {
          // Name is available, break out of loop
          break;
        }
      }

      if (attempt > maxAttempts) {
        throw new Error('Could not generate a unique runsheet name');
      }

      
      const { data: insertResult, error } = await supabase
        .from('runsheets')
        .insert({
          ...runsheetData,
          name: finalName
        })
        .select('*')
        .single();
      if (error) throw error;
      const result = insertResult;
      if (!silent) console.log('✅ Created new runsheet (new save)');

      if (!silent) {
        onSaveSuccess?.(result);
      }
      return result;
    } catch (error) {
      console.error('❌ Database save (new) failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save to database';
      if (!silent) {
        onSaveError?.(errorMessage);
        toast({
          title: 'Save failed',
          description: 'Changes could not be saved. Please check your connection.',
          variant: 'destructive'
        });
      }
      throw error;
    } finally {
      if (silent) {
        isSilentSavingRef.current = false;
      } else {
        isSavingRef.current = false;
      }
    }
  }, [userId, onSaveStart, onSaveSuccess, onSaveError, toast]);

  return {
    saveToDatabase,
    saveAsNewRunsheet,
    isSaving: isSavingRef.current,
    isSilentSaving: isSilentSavingRef.current
  };
}

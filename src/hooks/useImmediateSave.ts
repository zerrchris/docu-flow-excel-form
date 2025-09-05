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
    columnInstructions: Record<string, string>
  ) => Promise<any>;
  isSaving: boolean;
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

  // Immediate database save function
  const saveToDatabase = useCallback(async (
    data: Record<string, string>[], 
    columns: string[], 
    runsheetName: string, 
    columnInstructions: Record<string, string>
  ): Promise<any> => {
    if (!userId || !runsheetName.trim() || columns.length === 0) {
      console.log('⚠️ Skipping save - missing required data');
      return null;
    }

    // Skip save for default/untitled names
    const forbiddenNames = ['Untitled Runsheet', 'untitled runsheet', 'Untitled', 'untitled'];
    if (forbiddenNames.includes(runsheetName.trim())) {
      console.log('🚫 Skipping save - forbidden runsheet name:', runsheetName);
      return null;
    }

    if (isSavingRef.current) {
      console.log('⏳ Save already in progress, skipping...');
      return null;
    }

    isSavingRef.current = true;
    onSaveStart?.();
    
    console.log('💾 Saving immediately to database:', {
      runsheetId,
      dataLength: data.length,
      columnsLength: columns.length,
      runsheetName
    });

    try {
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
        console.log('✅ Updated existing runsheet');
      } else {
        // Check for existing runsheet with same name
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
          // Update existing runsheet
          const { data: updateResult, error } = await supabase
            .from('runsheets')
            .update(runsheetData)
            .eq('id', existingRunsheet.id)
            .eq('user_id', userId)
            .select('*')
            .single();

          if (error) throw error;
          result = updateResult;
          console.log('✅ Updated existing runsheet by name');
        } else {
          // Create new runsheet
          const { data: insertResult, error } = await supabase
            .from('runsheets')
            .insert(runsheetData)
            .select('*')
            .single();

          if (error) throw error;
          result = insertResult;
          console.log('✅ Created new runsheet');
        }
      }

      onSaveSuccess?.(result);
      return result;
      
    } catch (error) {
      console.error('❌ Database save failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to save to database';
      onSaveError?.(errorMessage);
      
      toast({
        title: "Save failed",
        description: "Changes could not be saved. Please check your connection.",
        variant: "destructive"
      });
      
      throw error;
    } finally {
      isSavingRef.current = false;
    }
  }, [userId, runsheetId, onSaveStart, onSaveSuccess, onSaveError, toast]);

  return {
    saveToDatabase,
    isSaving: isSavingRef.current
  };
}
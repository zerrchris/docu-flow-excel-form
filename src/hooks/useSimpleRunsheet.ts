import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface RunsheetData {
  id: string;
  name: string;
  columns: string[];
  data: Record<string, string>[];
  columnInstructions: Record<string, string>;
  userId: string;
}

interface UseSimpleRunsheetOptions {
  initialName?: string;
  initialColumns?: string[];
  initialData?: Record<string, string>[];
  initialColumnInstructions?: Record<string, string>;
  userId?: string;
}

export function useSimpleRunsheet({
  initialName = 'Untitled Runsheet',
  initialColumns = [],
  initialData = [],
  initialColumnInstructions = {},
  userId
}: UseSimpleRunsheetOptions) {
  const { toast } = useToast();
  const [runsheet, setRunsheet] = useState<RunsheetData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Create new runsheet immediately when initialized
  const createRunsheet = useCallback(async () => {
    if (!userId) return null;

    try {
      const newRunsheet = {
        name: initialName,
        columns: initialColumns,
        data: initialData.length > 0 ? initialData : Array.from({ length: 20 }, () => {
          const row: Record<string, string> = {};
          initialColumns.forEach(col => row[col] = '');
          return row;
        }),
        column_instructions: initialColumnInstructions,
        user_id: userId
      };

      const { data, error } = await supabase
        .from('runsheets')
        .insert(newRunsheet)
        .select('*')
        .single();

      if (error) throw error;

      const runsheetData: RunsheetData = {
        id: data.id,
        name: data.name,
        columns: data.columns as string[],
        data: data.data as Record<string, string>[],
        columnInstructions: data.column_instructions as Record<string, string>,
        userId: data.user_id
      };

      setRunsheet(runsheetData);
      setLastSaved(new Date());
      
      console.log('✅ Created new runsheet with ID:', data.id);
      return runsheetData;
    } catch (error) {
      console.error('Failed to create runsheet:', error);
      toast({
        title: "Error creating runsheet",
        description: "Failed to create a new runsheet. Please try again.",
        variant: "destructive"
      });
      return null;
    }
  }, [userId, initialName, initialColumns, initialData, initialColumnInstructions, toast]);

  // Load existing runsheet by ID
  const loadRunsheet = useCallback(async (runsheetId: string) => {
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheetId)
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      const runsheetData: RunsheetData = {
        id: data.id,
        name: data.name,
        columns: data.columns as string[],
        data: data.data as Record<string, string>[],
        columnInstructions: data.column_instructions as Record<string, string>,
        userId: data.user_id
      };

      setRunsheet(runsheetData);
      setLastSaved(new Date());
      
      console.log('✅ Loaded runsheet:', data.name);
      return runsheetData;
    } catch (error) {
      console.error('Failed to load runsheet:', error);
      toast({
        title: "Error loading runsheet",
        description: "Failed to load the runsheet. Please try again.",
        variant: "destructive"
      });
      return null;
    }
  }, [userId, toast]);

  // Save current runsheet data
  const saveRunsheet = useCallback(async () => {
    if (!runsheet || !userId) return;

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('runsheets')
        .update({
          name: runsheet.name,
          columns: runsheet.columns,
          data: runsheet.data,
          column_instructions: runsheet.columnInstructions,
          updated_at: new Date().toISOString()
        })
        .eq('id', runsheet.id)
        .eq('user_id', userId);

      if (error) throw error;

      setLastSaved(new Date());
      console.log('✅ Saved runsheet:', runsheet.name);
    } catch (error) {
      console.error('Failed to save runsheet:', error);
      toast({
        title: "Auto-save failed",
        description: "Your changes couldn't be saved. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  }, [runsheet, userId, toast]);

  // Debounced save
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    
    saveTimeoutRef.current = setTimeout(() => {
      saveRunsheet();
    }, 1000);
  }, [saveRunsheet]);

  // Update runsheet data and trigger save
  const updateRunsheet = useCallback((updates: Partial<Omit<RunsheetData, 'id' | 'userId'>>) => {
    if (!runsheet) return;

    setRunsheet(prev => {
      if (!prev) return prev;
      return { ...prev, ...updates };
    });
    
    debouncedSave();
  }, [runsheet, debouncedSave]);

  // Initialize runsheet
  useEffect(() => {
    if (!runsheet && userId) {
      createRunsheet();
    }
  }, [runsheet, userId, createRunsheet]);

  // Cleanup
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    runsheet,
    isSaving,
    lastSaved,
    createRunsheet,
    loadRunsheet,
    updateRunsheet,
    saveRunsheet: () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      return saveRunsheet();
    }
  };
}
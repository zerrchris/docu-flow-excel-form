import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface SimpleRunsheet {
  id: string;
  name: string;
  columns: string[];
  data: Record<string, string>[];
  columnInstructions: Record<string, string>;
  userId: string;
}

interface UseSimpleRunsheetReturn {
  runsheet: SimpleRunsheet | null;
  isLoading: boolean;
  isSaving: boolean;
  createRunsheet: (name: string, columns: string[], instructions?: Record<string, string>) => Promise<string>;
  loadRunsheet: (runsheetId: string) => Promise<void>;
  updateData: (newData: Record<string, string>[]) => void;
  updateColumns: (newColumns: string[]) => void;
  updateColumnInstructions: (newInstructions: Record<string, string>) => void;
  updateName: (newName: string) => void;
  save: () => Promise<void>;
  lastSavedAt: Date | null;
}

export function useSimpleRunsheet(): UseSimpleRunsheetReturn {
  const { toast } = useToast();
  const [runsheet, setRunsheet] = useState<SimpleRunsheet | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [saveTimeoutRef, setSaveTimeoutRef] = useState<NodeJS.Timeout | null>(null);

  // Auto-save when data changes
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef) {
      clearTimeout(saveTimeoutRef);
    }
    
    const timeout = setTimeout(async () => {
      if (runsheet) {
        await save();
      }
    }, 1000); // 1 second debounce
    
    setSaveTimeoutRef(timeout);
  }, [runsheet]);

  // Save to database
  const save = useCallback(async (): Promise<void> => {
    if (!runsheet || isSaving) return;

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
        .eq('user_id', runsheet.userId);

      if (error) throw error;
      
      setLastSavedAt(new Date());
      console.log('✅ Runsheet saved successfully');
    } catch (error) {
      console.error('❌ Failed to save runsheet:', error);
      toast({
        title: "Save failed",
        description: "Failed to save runsheet changes",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
    }
  }, [runsheet, isSaving, toast]);

  // Create new runsheet
  const createRunsheet = useCallback(async (
    name: string, 
    columns: string[], 
    instructions: Record<string, string> = {}
  ): Promise<string> => {
    setIsLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('User not authenticated');

      // Add timestamp to name to ensure uniqueness
      const timestamp = Date.now();
      const uniqueName = `${name}_${timestamp}`;

      const initialData = Array.from({ length: 20 }, () => {
        const row: Record<string, string> = {};
        columns.forEach(col => row[col] = '');
        return row;
      });

      const { data, error } = await supabase
        .from('runsheets')
        .insert({
          name: uniqueName,
          columns,
          data: initialData,
          column_instructions: instructions,
          user_id: user.id
        })
        .select('*')
        .single();

      if (error) throw error;

      const newRunsheet: SimpleRunsheet = {
        id: data.id,
        name: data.name,
        columns: data.columns,
        data: data.data as Record<string, string>[],
        columnInstructions: (data.column_instructions as Record<string, string>) || {},
        userId: data.user_id
      };

      setRunsheet(newRunsheet);
      setLastSavedAt(new Date());
      
      toast({
        title: "Runsheet created",
        description: `Created runsheet "${name}"`,
        variant: "default"
      });

      return data.id;
    } catch (error) {
      console.error('❌ Failed to create runsheet:', error);
      toast({
        title: "Creation failed",
        description: "Failed to create new runsheet",
        variant: "destructive"
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Load existing runsheet
  const loadRunsheet = useCallback(async (runsheetId: string): Promise<void> => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheetId)
        .single();

      if (error) throw error;

      const loadedRunsheet: SimpleRunsheet = {
        id: data.id,
        name: data.name,
        columns: data.columns,
        data: data.data as Record<string, string>[],
        columnInstructions: (data.column_instructions as Record<string, string>) || {},
        userId: data.user_id
      };

      setRunsheet(loadedRunsheet);
      setLastSavedAt(new Date(data.updated_at));
      
      console.log('✅ Runsheet loaded successfully:', data.name);
    } catch (error) {
      console.error('❌ Failed to load runsheet:', error);
      toast({
        title: "Load failed",
        description: "Failed to load runsheet",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  // Update functions that trigger auto-save
  const updateData = useCallback((newData: Record<string, string>[]) => {
    if (!runsheet) return;
    setRunsheet(prev => prev ? { ...prev, data: newData } : null);
    debouncedSave();
  }, [runsheet, debouncedSave]);

  const updateColumns = useCallback((newColumns: string[]) => {
    if (!runsheet) return;
    setRunsheet(prev => prev ? { ...prev, columns: newColumns } : null);
    debouncedSave();
  }, [runsheet, debouncedSave]);

  const updateColumnInstructions = useCallback((newInstructions: Record<string, string>) => {
    if (!runsheet) return;
    setRunsheet(prev => prev ? { ...prev, columnInstructions: newInstructions } : null);
    debouncedSave();
  }, [runsheet, debouncedSave]);

  const updateName = useCallback((newName: string) => {
    if (!runsheet) return;
    setRunsheet(prev => prev ? { ...prev, name: newName } : null);
    debouncedSave();
  }, [runsheet, debouncedSave]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef) {
        clearTimeout(saveTimeoutRef);
      }
    };
  }, [saveTimeoutRef]);

  return {
    runsheet,
    isLoading,
    isSaving,
    createRunsheet,
    loadRunsheet,
    updateData,
    updateColumns,
    updateColumnInstructions,
    updateName,
    save,
    lastSavedAt
  };
}
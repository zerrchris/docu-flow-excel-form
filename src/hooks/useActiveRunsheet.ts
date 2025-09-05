import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveRunsheet {
  id: string;
  name: string;
  data: Record<string, string>[];
  columns: string[];
  columnInstructions: Record<string, string>;
  created_at?: string;
  updated_at?: string;
}

const CURRENT_RUNSHEET_ID_KEY = 'currentRunsheetId';

// Simple global state for current runsheet ID only
let globalCurrentRunsheetId: string | null = null;
let listeners: Set<(runsheetId: string | null) => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(listener => listener(globalCurrentRunsheetId));
};

const saveCurrentIdToLocalStorage = () => {
  try {
    if (globalCurrentRunsheetId) {
      localStorage.setItem(CURRENT_RUNSHEET_ID_KEY, globalCurrentRunsheetId);
    } else {
      localStorage.removeItem(CURRENT_RUNSHEET_ID_KEY);
    }
  } catch (error) {
    console.error('Error saving current runsheet ID to localStorage:', error);
  }
};

const loadCurrentIdFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(CURRENT_RUNSHEET_ID_KEY);
    if (stored) {
      globalCurrentRunsheetId = stored;
      console.log('📋 Loaded current runsheet ID from localStorage:', stored);
    }
  } catch (error) {
    console.error('Error loading current runsheet ID from localStorage:', error);
    localStorage.removeItem(CURRENT_RUNSHEET_ID_KEY);
    globalCurrentRunsheetId = null;
  }
};

export const useActiveRunsheet = () => {
  const [currentRunsheetId, setCurrentRunsheetIdState] = useState<string | null>(globalCurrentRunsheetId);
  const [activeRunsheet, setActiveRunsheet] = useState<ActiveRunsheet | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Add this component as a listener
    const listener = (runsheetId: string | null) => {
      setCurrentRunsheetIdState(runsheetId);
    };
    listeners.add(listener);
    
    // Load from localStorage on mount if not already loaded
    if (!globalCurrentRunsheetId) {
      // Check if we're in the middle of creating a new runsheet
      const creatingNew = sessionStorage.getItem('creating_new_runsheet');
      if (creatingNew) {
        const createdTime = parseInt(creatingNew);
        if (Date.now() - createdTime < 3000) { // 3 seconds
          console.log('🚫 Skipping localStorage load - new runsheet being created');
          return;
        } else {
          // Clean up old flag
          sessionStorage.removeItem('creating_new_runsheet');
        }
      }
      
      loadCurrentIdFromLocalStorage();
      notifyListeners();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  // Load runsheet data when ID changes
  useEffect(() => {
    const loadRunsheet = async () => {
      if (!currentRunsheetId) {
        setActiveRunsheet(null);
        return;
      }

      setIsLoading(true);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setActiveRunsheet(null);
          return;
        }

        const { data, error } = await supabase
          .from('runsheets')
          .select('*')
          .eq('id', currentRunsheetId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          console.error('Error loading runsheet:', error);
          // Clear invalid runsheet ID
          clearActiveRunsheet();
          return;
        }

        if (!data) {
          console.log('Runsheet not found, clearing current ID');
          clearActiveRunsheet();
          return;
        }

        setActiveRunsheet({
          id: data.id,
          name: data.name,
          data: Array.isArray(data.data) ? data.data as Record<string, string>[] : [],
          columns: Array.isArray(data.columns) ? data.columns : [],
          columnInstructions: typeof data.column_instructions === 'object' && data.column_instructions ? data.column_instructions as Record<string, string> : {},
          created_at: data.created_at,
          updated_at: data.updated_at
        });
        
        console.log('🔧 ACTIVE_RUNSHEET: Loaded runsheet data from DB:', {
          id: data.id,
          name: data.name,
          columns: data.columns,
          columnsLength: Array.isArray(data.columns) ? data.columns.length : 0,
          dataLength: Array.isArray(data.data) ? data.data.length : 0,
          columnInstructions: data.column_instructions
        });
      } catch (error) {
        console.error('Error loading runsheet:', error);
        setActiveRunsheet(null);
      } finally {
        setIsLoading(false);
      }
    };

    loadRunsheet();
  }, [currentRunsheetId]);

  const setCurrentRunsheet = (runsheetId: string) => {
    if (!runsheetId) {
      console.error('⚠️ Attempted to set invalid runsheet ID');
      return;
    }
    
    globalCurrentRunsheetId = runsheetId;
    saveCurrentIdToLocalStorage();
    notifyListeners();
  };

  const clearActiveRunsheet = () => {
    globalCurrentRunsheetId = null;
    localStorage.removeItem(CURRENT_RUNSHEET_ID_KEY);
    notifyListeners();
  };

  const refreshActiveRunsheet = async () => {
    console.log('🚫 refreshActiveRunsheet called but disabled to prevent unwanted refreshes');
    // DISABLED: This was causing data corruption by refreshing when not needed
    // The database already auto-syncs, no need to force refresh the component
    // if (currentRunsheetId) {
    //   // Force reload by temporarily clearing and resetting
    //   const id = currentRunsheetId;
    //   setCurrentRunsheetIdState(null);
    //   setTimeout(() => setCurrentRunsheetIdState(id), 0);
    // }
  };

  return {
    activeRunsheet,
    currentRunsheetId,
    isLoading,
    setCurrentRunsheet,
    clearActiveRunsheet,
    refreshActiveRunsheet,
    hasActiveRunsheet: !!activeRunsheet,
    // Legacy compatibility
    currentRunsheet: activeRunsheet,
    setActiveRunsheet: (runsheet: ActiveRunsheet) => setCurrentRunsheet(runsheet.id),
    updateRunsheet: refreshActiveRunsheet
  };
};
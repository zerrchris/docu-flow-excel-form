import { useState, useEffect } from 'react';

export interface ActiveRunsheet {
  id: string;
  name: string;
  data?: Record<string, string>[];
  columns?: string[];
  columnInstructions?: Record<string, string>;
  lastSaveTime?: Date;
  hasUnsavedChanges?: boolean;
}

const ACTIVE_RUNSHEET_KEY = 'activeRunsheet';

// Global state for single active runsheet
let globalActiveRunsheet: ActiveRunsheet | null = null;
let listeners: Set<(runsheet: ActiveRunsheet | null) => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(listener => listener(globalActiveRunsheet));
};

const saveToLocalStorage = () => {
  try {
    if (globalActiveRunsheet) {
      localStorage.setItem(ACTIVE_RUNSHEET_KEY, JSON.stringify(globalActiveRunsheet));
    } else {
      localStorage.removeItem(ACTIVE_RUNSHEET_KEY);
    }
  } catch (error) {
    console.error('Error saving active runsheet to localStorage:', error);
  }
};

const loadFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ACTIVE_RUNSHEET_KEY);
    if (stored) {
      const parsedRunsheet = JSON.parse(stored);
      
      // Ensure we have a valid runsheet with required properties
      if (parsedRunsheet && parsedRunsheet.id && parsedRunsheet.name) {
        globalActiveRunsheet = parsedRunsheet;
        console.log('📋 Successfully loaded active runsheet from localStorage:', parsedRunsheet.name, parsedRunsheet.id);
      } else {
        console.warn('⚠️ Invalid active runsheet data in localStorage, clearing it');
        localStorage.removeItem(ACTIVE_RUNSHEET_KEY);
        globalActiveRunsheet = null;
      }
    }
  } catch (error) {
    console.error('Error loading active runsheet from localStorage:', error);
    localStorage.removeItem(ACTIVE_RUNSHEET_KEY);
    globalActiveRunsheet = null;
  }
};

export const useActiveRunsheet = () => {
  const [activeRunsheet, setActiveRunsheetState] = useState<ActiveRunsheet | null>(globalActiveRunsheet);

  useEffect(() => {
    // Add this component as a listener
    const listener = (runsheet: ActiveRunsheet | null) => {
      setActiveRunsheetState(runsheet);
    };
    listeners.add(listener);
    
    // Load from localStorage on mount if not already loaded
    if (!globalActiveRunsheet) {
      loadFromLocalStorage();
      notifyListeners();
    }

    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setActiveRunsheet = (runsheet: ActiveRunsheet) => {
    // Ensure we have valid runsheet data before setting
    if (!runsheet || !runsheet.id || !runsheet.name) {
      console.error('⚠️ Attempted to set invalid active runsheet:', runsheet);
      return;
    }
    
    globalActiveRunsheet = runsheet;
    // console.log('📋 Setting active runsheet:', runsheet.name, runsheet.id); // Commented out to reduce log noise
    saveToLocalStorage();
    notifyListeners();
  };

  const updateRunsheet = (runsheetId: string, updates: Partial<ActiveRunsheet>) => {
    if (globalActiveRunsheet && globalActiveRunsheet.id === runsheetId) {
      globalActiveRunsheet = { ...globalActiveRunsheet, ...updates };
      saveToLocalStorage();
      notifyListeners();
    }
  };

  const clearActiveRunsheet = () => {
    globalActiveRunsheet = null;
    localStorage.removeItem(ACTIVE_RUNSHEET_KEY);
    saveToLocalStorage();
    notifyListeners();
  };

  return {
    activeRunsheet,
    setActiveRunsheet,
    clearActiveRunsheet,
    updateRunsheet,
    hasActiveRunsheet: !!activeRunsheet,
    currentRunsheet: activeRunsheet // For compatibility
  };
};
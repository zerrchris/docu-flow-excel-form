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

const ACTIVE_RUNSHEETS_KEY = 'activeRunsheets';
const CURRENT_TAB_KEY = 'currentRunsheetTab';

// Global state for multiple active runsheets
let globalActiveRunsheets: ActiveRunsheet[] = [];
let globalCurrentTabId: string | null = null;
let listeners: Set<(runsheets: ActiveRunsheet[], currentTabId: string | null) => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(listener => listener(globalActiveRunsheets, globalCurrentTabId));
};

const saveToLocalStorage = () => {
  try {
    localStorage.setItem(ACTIVE_RUNSHEETS_KEY, JSON.stringify(globalActiveRunsheets));
    if (globalCurrentTabId) {
      localStorage.setItem(CURRENT_TAB_KEY, globalCurrentTabId);
    } else {
      localStorage.removeItem(CURRENT_TAB_KEY);
    }
  } catch (error) {
    console.error('Error saving active runsheets to localStorage:', error);
  }
};

const loadFromLocalStorage = () => {
  try {
    const stored = localStorage.getItem(ACTIVE_RUNSHEETS_KEY);
    const currentTab = localStorage.getItem(CURRENT_TAB_KEY);
    
    if (stored) {
      globalActiveRunsheets = JSON.parse(stored);
      globalCurrentTabId = currentTab;
    }
  } catch (error) {
    console.error('Error loading active runsheets from localStorage:', error);
    globalActiveRunsheets = [];
    globalCurrentTabId = null;
  }
};

export const useMultipleRunsheets = () => {
  const [activeRunsheets, setActiveRunsheets] = useState<ActiveRunsheet[]>(globalActiveRunsheets);
  const [currentTabId, setCurrentTabId] = useState<string | null>(globalCurrentTabId);

  useEffect(() => {
    // Add this component as a listener
    listeners.add((runsheets, tabId) => {
      setActiveRunsheets([...runsheets]);
      setCurrentTabId(tabId);
    });
    
    // Load from localStorage on mount if not already loaded
    if (globalActiveRunsheets.length === 0) {
      loadFromLocalStorage();
      notifyListeners();
    }

    return () => {
      // Remove this component as a listener
      listeners.delete((runsheets, tabId) => {
        setActiveRunsheets([...runsheets]);
        setCurrentTabId(tabId);
      });
    };
  }, []);

  const addRunsheet = (runsheet: ActiveRunsheet) => {
    // Check if runsheet is already open
    const existingIndex = globalActiveRunsheets.findIndex(r => r.id === runsheet.id);
    
    if (existingIndex >= 0) {
      // Switch to existing tab
      globalCurrentTabId = runsheet.id;
    } else {
      // Add new runsheet
      globalActiveRunsheets.push(runsheet);
      globalCurrentTabId = runsheet.id;
    }
    
    saveToLocalStorage();
    notifyListeners();
  };

  const removeRunsheet = (runsheetId: string) => {
    globalActiveRunsheets = globalActiveRunsheets.filter(r => r.id !== runsheetId);
    
    // If we're removing the current tab, switch to another tab
    if (globalCurrentTabId === runsheetId) {
      globalCurrentTabId = globalActiveRunsheets.length > 0 ? globalActiveRunsheets[0].id : null;
    }
    
    saveToLocalStorage();
    notifyListeners();
  };

  const updateRunsheet = (runsheetId: string, updates: Partial<ActiveRunsheet>) => {
    const index = globalActiveRunsheets.findIndex(r => r.id === runsheetId);
    if (index >= 0) {
      globalActiveRunsheets[index] = { ...globalActiveRunsheets[index], ...updates };
      saveToLocalStorage();
      notifyListeners();
    }
  };

  const switchToTab = (runsheetId: string) => {
    globalCurrentTabId = runsheetId;
    saveToLocalStorage();
    notifyListeners();
  };

  const clearAllRunsheets = () => {
    globalActiveRunsheets = [];
    globalCurrentTabId = null;
    // Also clear localStorage
    localStorage.removeItem(ACTIVE_RUNSHEETS_KEY);
    localStorage.removeItem(CURRENT_TAB_KEY);
    saveToLocalStorage();
    notifyListeners();
  };

  const getCurrentRunsheet = (): ActiveRunsheet | null => {
    if (!globalCurrentTabId) return null;
    return globalActiveRunsheets.find(r => r.id === globalCurrentTabId) || null;
  };

  return {
    activeRunsheets,
    currentTabId,
    currentRunsheet: getCurrentRunsheet(),
    addRunsheet,
    removeRunsheet,
    updateRunsheet,
    switchToTab,
    clearAllRunsheets,
    hasActiveRunsheets: activeRunsheets.length > 0
  };
};
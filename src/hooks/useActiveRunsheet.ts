import { useState, useEffect } from 'react';

interface ActiveRunsheet {
  name: string;
  id?: string;
}

const ACTIVE_RUNSHEET_KEY = 'activeRunsheet';

// Global state for active runsheet
let globalActiveRunsheet: ActiveRunsheet | null = null;
let listeners: Set<(runsheet: ActiveRunsheet | null) => void> = new Set();

const notifyListeners = () => {
  listeners.forEach(listener => listener(globalActiveRunsheet));
};

export const useActiveRunsheet = () => {
  const [activeRunsheet, setActiveRunsheet] = useState<ActiveRunsheet | null>(globalActiveRunsheet);

  useEffect(() => {
    // Add this component as a listener
    listeners.add(setActiveRunsheet);
    
    // Load from localStorage on mount
    try {
      const stored = localStorage.getItem(ACTIVE_RUNSHEET_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        globalActiveRunsheet = parsed;
        notifyListeners();
      }
    } catch (error) {
      console.error('Error loading active runsheet from localStorage:', error);
    }

    return () => {
      // Remove this component as a listener
      listeners.delete(setActiveRunsheet);
    };
  }, []);

  const setActive = (runsheet: ActiveRunsheet | null) => {
    globalActiveRunsheet = runsheet;
    
    // Save to localStorage
    try {
      if (runsheet) {
        localStorage.setItem(ACTIVE_RUNSHEET_KEY, JSON.stringify(runsheet));
      } else {
        localStorage.removeItem(ACTIVE_RUNSHEET_KEY);
      }
    } catch (error) {
      console.error('Error saving active runsheet to localStorage:', error);
    }
    
    notifyListeners();
  };

  const clearActive = () => {
    setActive(null);
  };

  return {
    activeRunsheet,
    setActiveRunsheet: setActive,
    clearActiveRunsheet: clearActive
  };
};
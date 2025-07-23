import { useState, useEffect } from 'react';
import { useMultipleRunsheets, ActiveRunsheet } from './useMultipleRunsheets';

interface LegacyActiveRunsheet {
  name: string;
  id?: string;
}

// Legacy hook for backward compatibility
export const useActiveRunsheet = () => {
  const { currentRunsheet, addRunsheet, updateRunsheet, clearAllRunsheets, hasActiveRunsheets } = useMultipleRunsheets();

  const setActiveRunsheet = (runsheet: LegacyActiveRunsheet) => {
    const newRunsheet: ActiveRunsheet = {
      id: runsheet.id || `legacy-${Date.now()}`,
      name: runsheet.name,
      data: [],
      columns: [],
      columnInstructions: {},
      hasUnsavedChanges: false
    };
    addRunsheet(newRunsheet);
  };

  const clearActiveRunsheet = () => {
    clearAllRunsheets();
  };

  // Convert current runsheet to legacy format
  const activeRunsheet: LegacyActiveRunsheet | null = currentRunsheet ? {
    name: currentRunsheet.name,
    id: currentRunsheet.id
  } : null;

  return {
    activeRunsheet,
    setActiveRunsheet,
    clearActiveRunsheet,
    updateRunsheet,
    hasActiveRunsheet: hasActiveRunsheets,
    currentRunsheet
  };
};
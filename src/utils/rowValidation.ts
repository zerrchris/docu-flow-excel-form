/**
 * Utility functions for validating spreadsheet row operations
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * Check if a row is completely empty
 */
export const isRowEmpty = (row: Record<string, string>): boolean => {
  return Object.values(row).every(value => 
    !value || 
    value.toString().trim() === '' || 
    value.toString().trim().toLowerCase() === 'n/a'
  );
};

/**
 * Check if a row has any meaningful data
 */
export const hasRowData = (row: Record<string, string>): boolean => {
  return Object.values(row).some(value => 
    value && 
    value.toString().trim() !== '' && 
    value.toString().trim().toLowerCase() !== 'n/a'
  );
};

/**
 * Find the first empty row in a dataset
 */
export const findFirstEmptyRow = (data: Record<string, string>[]): number => {
  for (let i = 0; i < data.length; i++) {
    if (isRowEmpty(data[i])) {
      return i;
    }
  }
  return -1; // No empty row found
};

/**
 * Validate data before insertion to ensure it's safe to add
 */
export const validateDataForInsertion = (
  data: Record<string, string>, 
  availableColumns: string[]
): ValidationResult => {
  const warnings: string[] = [];
  
  // Check if we have any valid data
  const validEntries = Object.entries(data).filter(([key, value]) => {
    const hasValidColumn = availableColumns.includes(key);
    const hasValidValue = value && value.toString().trim() !== '';
    
    if (!hasValidColumn && hasValidValue) {
      warnings.push(`Column "${key}" is not available in the spreadsheet`);
    }
    
    return hasValidColumn && hasValidValue;
  });

  if (validEntries.length === 0) {
    return {
      isValid: false,
      error: 'No valid data provided for any available columns',
      warnings
    };
  }

  return {
    isValid: true,
    warnings: warnings.length > 0 ? warnings : undefined
  };
};

/**
 * Validate that target row is safe for data insertion
 */
export const validateRowForInsertion = (
  row: Record<string, string>, 
  rowIndex: number,
  allowOverwrite: boolean = false
): ValidationResult => {
  if (!allowOverwrite && hasRowData(row)) {
    return {
      isValid: false,
      error: `Row ${rowIndex + 1} already contains data. To prevent overwriting, please select an empty row or explicitly allow overwriting.`
    };
  }

  return { isValid: true };
};

/**
 * Get user-friendly description of what data exists in a row
 */
export const getRowDataSummary = (row: Record<string, string>): string => {
  const nonEmptyFields = Object.entries(row)
    .filter(([_, value]) => value && value.toString().trim() !== '')
    .map(([key, _]) => key);
  
  if (nonEmptyFields.length === 0) {
    return 'Row is empty';
  }
  
  if (nonEmptyFields.length <= 3) {
    return `Contains data in: ${nonEmptyFields.join(', ')}`;
  }
  
  return `Contains data in ${nonEmptyFields.length} fields: ${nonEmptyFields.slice(0, 3).join(', ')}, and ${nonEmptyFields.length - 3} more`;
};

/**
 * Prepare data for safe insertion by cleaning and validating values
 */
export const prepareDataForInsertion = (
  data: Record<string, string>,
  availableColumns: string[]
): Record<string, string> => {
  const cleanData: Record<string, string> = {};
  
  Object.entries(data).forEach(([key, value]) => {
    if (availableColumns.includes(key) && value && value.toString().trim() !== '') {
      cleanData[key] = value.toString().trim();
    }
  });
  
  return cleanData;
};
/**
 * Utility functions for validating spreadsheet row operations
 */

export interface ValidationResult {
  isValid: boolean;
  error?: string;
  warnings?: string[];
}

/**
 * List of columns that should be ignored when checking if a row has data
 * These are metadata/reference columns, not actual runsheet data
 */
const METADATA_COLUMNS = ['Document File Name'];

/**
 * Filter out metadata columns when checking row data
 */
const getDataColumns = (row: Record<string, string>): Record<string, string> => {
  const filteredRow: Record<string, string> = {};
  Object.entries(row).forEach(([key, value]) => {
    if (!METADATA_COLUMNS.includes(key)) {
      filteredRow[key] = value;
    }
  });
  return filteredRow;
};

/**
 * Check if a row is completely empty (ignoring metadata columns)
 */
export const isRowEmpty = (row: Record<string, string>, hasLinkedDocument?: boolean): boolean => {
  // If there's a linked document, the row is not empty
  if (hasLinkedDocument) {
    return false;
  }
  
  // Only check data columns, not metadata columns
  const dataRow = getDataColumns(row);
  return Object.values(dataRow).every(value => 
    !value || 
    value.toString().trim() === '' || 
    value.toString().trim().toLowerCase() === 'n/a'
  );
};

/**
 * Check if a row has any meaningful data (ignoring metadata columns)
 */
export const hasRowData = (row: Record<string, string>, hasLinkedDocument?: boolean): boolean => {
  // If there's a linked document, the row has data
  if (hasLinkedDocument) {
    return true;
  }
  
  // Only check data columns, not metadata columns
  const dataRow = getDataColumns(row);
  return Object.values(dataRow).some(value => 
    value && 
    value.toString().trim() !== '' && 
    value.toString().trim().toLowerCase() !== 'n/a'
  );
};

/**
 * Find the first empty row in a dataset
 */
export const findFirstEmptyRow = (
  data: Record<string, string>[], 
  documentMap?: Map<number, any>
): number => {
  for (let i = 0; i < data.length; i++) {
    const hasLinkedDocument = documentMap?.has(i) || false;
    if (isRowEmpty(data[i], hasLinkedDocument)) {
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
  allowOverwrite: boolean = false,
  hasLinkedDocument?: boolean
): ValidationResult => {
  if (!allowOverwrite && hasRowData(row, hasLinkedDocument)) {
    return {
      isValid: false,
      error: `Row ${rowIndex + 1} already contains data${hasLinkedDocument ? ' and has a linked document' : ''}. To prevent overwriting, please select an empty row or explicitly allow overwriting.`
    };
  }

  return { isValid: true };
};

/**
 * Get user-friendly description of what data exists in a row (ignoring metadata columns)
 */
export const getRowDataSummary = (row: Record<string, string>): string => {
  // Only check data columns for the summary
  const dataRow = getDataColumns(row);
  const nonEmptyFields = Object.entries(dataRow)
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
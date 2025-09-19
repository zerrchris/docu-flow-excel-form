import { describe, it, expect } from 'vitest';
import { 
  isRowEmpty, 
  hasRowData, 
  findFirstEmptyRow, 
  validateRowForInsertion,
  validateDataForInsertion 
} from '../rowValidation';

describe('Row Validation Utilities', () => {
  describe('isRowEmpty', () => {
    it('should return true for completely empty row', () => {
      const row = {};
      expect(isRowEmpty(row)).toBe(true);
    });

    it('should return true for row with only empty strings', () => {
      const row = { name: '', email: '', phone: '' };
      expect(isRowEmpty(row)).toBe(true);
    });

    it('should return true for row with only whitespace', () => {
      const row = { name: '   ', email: '\t', phone: '\n' };
      expect(isRowEmpty(row)).toBe(true);
    });

    it('should return false for row with actual data', () => {
      const row = { name: 'John Doe', email: '', phone: '' };
      expect(isRowEmpty(row)).toBe(false);
    });

    it('should return true for row with only metadata columns', () => {
      const row = { 'Document File Name': 'doc.pdf', name: '', email: '' };
      expect(isRowEmpty(row)).toBe(true);
    });

    it('should return true for row with N/A placeholders', () => {
      const row = { name: 'N/A', email: 'n/a', phone: 'N/A' };
      expect(isRowEmpty(row)).toBe(true);
    });

    it('should return false when has linked document', () => {
      const row = { name: '', email: '' };
      expect(isRowEmpty(row, true)).toBe(false);
    });

    it('should handle mixed metadata and real data', () => {
      const row = { 
        'Document File Name': 'doc.pdf', 
        name: 'John Doe', 
        email: '' 
      };
      expect(isRowEmpty(row)).toBe(false);
    });
  });

  describe('hasRowData', () => {
    it('should return false for empty row', () => {
      const row = {};
      expect(hasRowData(row)).toBe(false);
    });

    it('should return true for row with data', () => {
      const row = { name: 'John Doe' };
      expect(hasRowData(row)).toBe(true);
    });

    it('should return true when has linked document', () => {
      const row = { name: '' };
      expect(hasRowData(row, true)).toBe(true);
    });

    it('should ignore metadata columns for data check', () => {
      const row = { 'Document File Name': 'doc.pdf', name: '' };
      expect(hasRowData(row, false)).toBe(false);
    });
  });

  describe('findFirstEmptyRow', () => {
    it('should find first empty row in data array', () => {
      const data = [
        { name: 'John', email: 'john@test.com' },
        { name: '', email: '' },
        { name: 'Jane', email: 'jane@test.com' }
      ];
      expect(findFirstEmptyRow(data)).toBe(1);
    });

    it('should return -1 when no empty rows found', () => {
      const data = [
        { name: 'John', email: 'john@test.com' },
        { name: 'Jane', email: 'jane@test.com' }
      ];
      expect(findFirstEmptyRow(data)).toBe(-1);
    });

    it('should consider document map when finding empty rows', () => {
      const data = [
        { name: '', email: '' },
        { name: '', email: '' }
      ];
      const documentMap = new Map([[0, { id: '1', stored_filename: 'doc.pdf' } as any]]);
      expect(findFirstEmptyRow(data, documentMap)).toBe(1);
    });

    it('should handle empty data array', () => {
      const data: Record<string, string>[] = [];
      expect(findFirstEmptyRow(data)).toBe(-1);
    });
  });

  describe('validateRowForInsertion', () => {
    it('should allow insertion into empty row', () => {
      const row = { name: '', email: '' };
      const result = validateRowForInsertion(row, 0, false, false);
      expect(result.isValid).toBe(true);
    });

    it('should prevent overwriting existing data', () => {
      const row = { name: 'John Doe', email: 'john@test.com' };
      const result = validateRowForInsertion(row, 0, false, false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('already contains data');
    });

    it('should allow overwrite when explicitly allowed', () => {
      const row = { name: 'John Doe', email: 'john@test.com' };
      const result = validateRowForInsertion(row, 0, true, false);
      expect(result.isValid).toBe(true);
    });

    it('should handle linked document scenario', () => {
      const row = { name: '', email: '' };
      const result = validateRowForInsertion(row, 0, false, true);
      expect(result.isValid).toBe(true);
    });

    it('should handle data with linked document', () => {
      const row = { name: 'John Doe', email: 'john@test.com' };
      const result = validateRowForInsertion(row, 0, false, true);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('has a linked document');
    });
  });

  describe('validateDataForInsertion', () => {
    it('should validate complete data insertion', () => {
      const data = { name: 'John Doe', email: 'john@test.com' };
      const columns = ['name', 'email', 'phone'];
      const result = validateDataForInsertion(data, columns);
      
      expect(result.isValid).toBe(true);
    });

    it('should detect empty data', () => {
      const data = {};
      const columns = ['name', 'email'];
      const result = validateDataForInsertion(data, columns);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No valid data provided');
    });

    it('should handle data with only empty values', () => {
      const data = { name: '', email: '   ' };
      const columns = ['name', 'email'];
      const result = validateDataForInsertion(data, columns);
      
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('No valid data provided');
    });

    it('should warn about invalid columns', () => {
      const data = { 
        name: 'John Doe',
        invalidColumn: 'some value'
      };
      const columns = ['name', 'email'];
      const result = validateDataForInsertion(data, columns);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings).toContain('Column "invalidColumn" is not available in the spreadsheet');
    });

    it('should handle mixed valid and invalid data', () => {
      const data = { 
        name: 'John Doe',
        email: '',
        invalidField: 'test'
      };
      const columns = ['name', 'email', 'phone'];
      const result = validateDataForInsertion(data, columns);
      
      expect(result.isValid).toBe(true);
      expect(result.warnings?.length).toBeGreaterThan(0);
    });
  });
});
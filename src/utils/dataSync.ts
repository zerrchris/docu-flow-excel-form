/**
 * Enhanced data synchronization utilities for robust frontend-backend communication
 */

import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';

interface SyncResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  retryable?: boolean;
}

interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
}

/**
 * Enhanced error handling with user-friendly messages
 */
export class DataSyncError extends Error {
  public readonly isRetryable: boolean;
  public readonly userMessage: string;
  public readonly originalError?: any;

  constructor(
    message: string,
    userMessage: string,
    isRetryable: boolean = true,
    originalError?: any
  ) {
    super(message);
    this.name = 'DataSyncError';
    this.userMessage = userMessage;
    this.isRetryable = isRetryable;
    this.originalError = originalError;
  }
}

/**
 * Connection status monitor
 */
class ConnectionMonitor {
  private isOnline = navigator.onLine;
  private listeners: ((isOnline: boolean) => void)[] = [];

  constructor() {
    window.addEventListener('online', () => this.updateStatus(true));
    window.addEventListener('offline', () => this.updateStatus(false));
  }

  private updateStatus(isOnline: boolean) {
    if (this.isOnline !== isOnline) {
      this.isOnline = isOnline;
      this.listeners.forEach(listener => listener(isOnline));
      
      if (isOnline) {
        toast({
          title: "Connection restored",
          description: "You're back online. Data will sync automatically.",
          variant: "default"
        });
      } else {
        toast({
          title: "Connection lost", 
          description: "You're offline. Changes will be saved locally and synced when reconnected.",
          variant: "default"
        });
      }
    }
  }

  public get online() {
    return this.isOnline;
  }

  public onStatusChange(listener: (isOnline: boolean) => void) {
    this.listeners.push(listener);
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) this.listeners.splice(index, 1);
    };
  }
}

export const connectionMonitor = new ConnectionMonitor();

/**
 * Retry mechanism with exponential backoff
 */
export async function withRetry<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<SyncResult<T>> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 10000,
    backoffFactor = 2
  } = options;

  let lastError: Error;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      if (attempt > 0) {
        // Check if we're still offline
        if (!connectionMonitor.online) {
          throw new DataSyncError(
            'No internet connection',
            'Unable to sync data. Please check your internet connection.',
            true
          );
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt - 1), maxDelay);
        await new Promise(resolve => setTimeout(resolve, delay));
        
        console.log(`Retrying operation, attempt ${attempt + 1}/${maxRetries + 1}`);
      }
      
      const result = await operation();
      
      if (attempt > 0) {
        toast({
          title: "Operation succeeded",
          description: `Sync completed successfully after ${attempt} ${attempt === 1 ? 'retry' : 'retries'}.`,
          variant: "default"
        });
      }
      
      return { success: true, data: result };
      
    } catch (error) {
      lastError = error as Error;
      console.error(`Operation failed, attempt ${attempt + 1}:`, error);
      
      // Don't retry non-retryable errors
      if (error instanceof DataSyncError && !error.isRetryable) {
        break;
      }
      
      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break;
      }
    }
  }
  
  // All retries failed
  const errorMessage = lastError instanceof DataSyncError 
    ? lastError.userMessage
    : 'An unexpected error occurred. Please try again.';
    
  return {
    success: false,
    error: errorMessage,
    retryable: !(lastError instanceof DataSyncError) || lastError.isRetryable
  };
}

/**
 * Data validation utilities
 */
export function validateRunsheetData(data: {
  name: string;
  columns: string[];
  data: Record<string, string>[];
  column_instructions?: Record<string, string>;
}): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate name
  if (!data.name || data.name.trim().length === 0) {
    errors.push('Runsheet name is required');
  }
  
  if (data.name && data.name.length > 100) {
    errors.push('Runsheet name must be less than 100 characters');
  }
  
  // Validate columns
  if (!data.columns || data.columns.length === 0) {
    errors.push('At least one column is required');
  }
  
  if (data.columns && data.columns.some(col => !col || col.trim().length === 0)) {
    errors.push('All columns must have names');
  }
  
  // Check for duplicate columns
  if (data.columns) {
    const duplicates = data.columns.filter((col, index) => 
      data.columns.indexOf(col) !== index
    );
    if (duplicates.length > 0) {
      errors.push(`Duplicate column names found: ${duplicates.join(', ')}`);
    }
  }
  
  // Validate data structure
  if (data.data && Array.isArray(data.data)) {
    data.data.forEach((row, index) => {
      if (typeof row !== 'object' || row === null) {
        errors.push(`Row ${index + 1} has invalid structure`);
        return;
      }
      
      // Check for invalid column references
      const invalidColumns = Object.keys(row).filter(key => 
        !data.columns.includes(key)
      );
      if (invalidColumns.length > 0) {
        errors.push(`Row ${index + 1} contains invalid columns: ${invalidColumns.join(', ')}`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors
  };
}

/**
 * Enhanced save operation with validation and error handling
 */
export async function saveRunsheetSafely(
  runsheetData: {
    id?: string;
    name: string;
    columns: string[];
    data: Record<string, string>[];
    column_instructions: Record<string, string>;
    user_id: string;
  }
): Promise<SyncResult> {
  // Validate data first
  const validation = validateRunsheetData(runsheetData);
  if (!validation.isValid) {
    throw new DataSyncError(
      'Validation failed',
      `Data validation failed: ${validation.errors.join(', ')}`,
      false // Not retryable
    );
  }
  
  return withRetry(async () => {
    const payload = {
      ...runsheetData,
      updated_at: new Date().toISOString()
    };
    
    let result;
    
    if (runsheetData.id) {
      // Update existing
      const { data, error } = await supabase
        .from('runsheets')
        .update(payload)
        .eq('id', runsheetData.id)
        .eq('user_id', runsheetData.user_id)
        .select('*')
        .single();
        
      if (error) {
        if (error.code === 'PGRST116') {
          throw new DataSyncError(
            'Runsheet not found',
            'The runsheet no longer exists or you no longer have access to it.',
            false
          );
        }
        throw new DataSyncError(
          'Update failed',
          'Failed to save changes. Please try again.',
          true,
          error
        );
      }
      
      result = data;
    } else {
      // Create new
      const { data, error } = await supabase
        .from('runsheets')
        .insert(payload)
        .select('*')
        .single();
        
      if (error) {
        if (error.code === '23505') {
          throw new DataSyncError(
            'Duplicate name',
            'A runsheet with this name already exists. Please choose a different name.',
            false
          );
        }
        throw new DataSyncError(
          'Creation failed',
          'Failed to create runsheet. Please try again.',
          true,
          error
        );
      }
      
      result = data;
    }
    
    return result;
  });
}

/**
 * Enhanced document retrieval with error handling
 */
export async function getDocumentsForRunsheet(runsheetId: string): Promise<SyncResult> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('runsheet_id', runsheetId)
      .order('row_index')
      .order('created_at', { ascending: false });
      
    if (error) {
      throw new DataSyncError(
        'Fetch failed',
        'Failed to load documents. Please refresh the page.',
        true,
        error
      );
    }
    
    return data || [];
  });
}

/**
 * Optimistic update helper
 */
export class OptimisticUpdater<T> {
  private originalData: T;
  private currentData: T;
  private pendingUpdates: Set<string> = new Set();
  
  constructor(initialData: T) {
    this.originalData = structuredClone(initialData);
    this.currentData = structuredClone(initialData);
  }
  
  /**
   * Apply optimistic update
   */
  public update(updateId: string, updater: (data: T) => T): T {
    this.pendingUpdates.add(updateId);
    this.currentData = updater(this.currentData);
    return this.currentData;
  }
  
  /**
   * Confirm update succeeded
   */
  public confirm(updateId: string, newData?: T): T {
    this.pendingUpdates.delete(updateId);
    if (newData) {
      this.originalData = structuredClone(newData);
      this.currentData = structuredClone(newData);
    }
    return this.currentData;
  }
  
  /**
   * Rollback failed update
   */
  public rollback(updateId: string): T {
    this.pendingUpdates.delete(updateId);
    // Revert to original and reapply remaining pending updates
    this.currentData = structuredClone(this.originalData);
    return this.currentData;
  }
  
  /**
   * Get current data
   */
  public getData(): T {
    return this.currentData;
  }
  
  /**
   * Check if there are pending updates
   */
  public hasPendingUpdates(): boolean {
    return this.pendingUpdates.size > 0;
  }
}

/**
 * Enhanced real-time subscription with error handling
 */
export function createRealTimeSubscription(
  table: string,
  filter?: string,
  onUpdate?: (payload: any) => void,
  onError?: (error: any) => void
) {
  let retryCount = 0;
  const maxRetries = 5;
  
  const createSubscription = () => {
    const channel = supabase
      .channel(`${table}_changes_${Date.now()}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter
        },
        (payload) => {
          retryCount = 0; // Reset on successful message
          onUpdate?.(payload);
        }
      )
      .subscribe((status, error) => {
        if (status === 'SUBSCRIBED') {
          console.log(`Subscribed to ${table} changes`);
          retryCount = 0;
        } else if (status === 'CLOSED' || status === 'CHANNEL_ERROR') {
          console.error(`Subscription ${status}:`, error);
          
          if (retryCount < maxRetries) {
            retryCount++;
            const delay = Math.min(1000 * Math.pow(2, retryCount - 1), 30000);
            
            setTimeout(() => {
              console.log(`Retrying subscription to ${table}, attempt ${retryCount}`);
              supabase.removeChannel(channel);
              createSubscription();
            }, delay);
          } else {
            onError?.(new Error(`Failed to maintain subscription to ${table} after ${maxRetries} attempts`));
            toast({
              title: "Connection issue",
              description: "Lost connection to real-time updates. Please refresh the page.",
              variant: "destructive"
            });
          }
        }
      });
      
    return channel;
  };
  
  return createSubscription();
}

/**
 * Data consistency checker
 */
export async function checkDataConsistency(
  localData: any,
  remoteId: string,
  table: 'runsheets' | 'documents'
): Promise<{ consistent: boolean; conflicts?: any[] }> {
  try {
    const { data: remoteData, error } = await supabase
      .from(table as any)
      .select('*')
      .eq('id', remoteId)
      .single();
      
    if (error || !remoteData) {
      return { consistent: false };
    }
    
    // Simple timestamp-based consistency check for tables that have updated_at
    if (table === 'runsheets' || table === 'documents') {
      const localTimestamp = new Date(localData.updated_at || 0);
      const remoteTimestamp = new Date((remoteData as any).updated_at || 0);
      
      if (remoteTimestamp > localTimestamp) {
        return {
          consistent: false,
          conflicts: [{
            field: 'updated_at',
            local: localData.updated_at,
            remote: (remoteData as any).updated_at,
            remoteData
          }]
        };
      }
    }
    
    return { consistent: true };
  } catch (error) {
    console.error('Consistency check failed:', error);
    return { consistent: false };
  }
}
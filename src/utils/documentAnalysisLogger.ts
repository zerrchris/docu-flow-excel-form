import { supabase } from '@/integrations/supabase/client';

interface AnalysisLogEntry {
  session_id: string;
  operation_type: 'document_upload' | 'ai_analysis' | 'data_extraction' | 'data_population' | 'error';
  status: 'started' | 'completed' | 'failed';
  document_info?: {
    filename: string;
    file_size: number;
    content_type: string;
  };
  analysis_results?: {
    extracted_fields: number;
    confidence_scores: Record<string, number>;
    document_type: string;
  };
  error_details?: {
    error_code: string;
    error_message: string;
    stack_trace?: string;
  };
  performance_metrics?: {
    processing_time_ms: number;
    api_calls: number;
    memory_usage?: number;
  };
  metadata?: Record<string, any>;
  timestamp: string;
}

class DocumentAnalysisLogger {
  private logEntries: AnalysisLogEntry[] = [];
  private sessionId: string;
  private sessionStartTime: number;

  constructor() {
    this.sessionId = this.generateSessionId();
    this.sessionStartTime = Date.now();
    console.log('📊 Document Analysis Logger initialized with session:', this.sessionId);
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  logOperation(
    operationType: AnalysisLogEntry['operation_type'],
    status: AnalysisLogEntry['status'],
    data?: Partial<Omit<AnalysisLogEntry, 'session_id' | 'operation_type' | 'status' | 'timestamp'>>
  ) {
    const entry: AnalysisLogEntry = {
      session_id: this.sessionId,
      operation_type: operationType,
      status,
      timestamp: new Date().toISOString(),
      ...data
    };

    this.logEntries.push(entry);
    
    console.log(`📊 Logged ${operationType} - ${status}:`, {
      session: this.sessionId,
      operation: operationType,
      status,
      timestamp: entry.timestamp
    });

    // Log critical errors immediately
    if (status === 'failed' && data?.error_details) {
      console.error(`❌ Document Analysis Error [${operationType}]:`, data.error_details);
    }

    // Auto-flush if we have too many entries
    if (this.logEntries.length >= 50) {
      this.flushLogs();
    }
  }

  logDocumentUpload(filename: string, fileSize: number, contentType: string, status: 'started' | 'completed' | 'failed', error?: string) {
    const startTime = Date.now();
    
    this.logOperation('document_upload', status, {
      document_info: {
        filename,
        file_size: fileSize,
        content_type: contentType
      },
      performance_metrics: {
        processing_time_ms: Date.now() - startTime,
        api_calls: 1
      },
      error_details: error ? {
        error_code: 'UPLOAD_ERROR',
        error_message: error
      } : undefined
    });
  }

  logAIAnalysis(
    status: 'started' | 'completed' | 'failed',
    processingTimeMs: number,
    extractedFields?: number,
    confidenceScores?: Record<string, number>,
    documentType?: string,
    error?: string
  ) {
    this.logOperation('ai_analysis', status, {
      analysis_results: extractedFields !== undefined ? {
        extracted_fields: extractedFields,
        confidence_scores: confidenceScores || {},
        document_type: documentType || 'unknown'
      } : undefined,
      performance_metrics: {
        processing_time_ms: processingTimeMs,
        api_calls: 1
      },
      error_details: error ? {
        error_code: 'AI_ANALYSIS_ERROR',
        error_message: error
      } : undefined
    });
  }

  logDataExtraction(
    status: 'started' | 'completed' | 'failed',
    processingTimeMs: number,
    extractedFields?: number,
    error?: string
  ) {
    this.logOperation('data_extraction', status, {
      analysis_results: extractedFields !== undefined ? {
        extracted_fields: extractedFields,
        confidence_scores: {},
        document_type: 'extracted'
      } : undefined,
      performance_metrics: {
        processing_time_ms: processingTimeMs,
        api_calls: 0
      },
      error_details: error ? {
        error_code: 'EXTRACTION_ERROR',
        error_message: error
      } : undefined
    });
  }

  logDataPopulation(
    status: 'started' | 'completed' | 'failed',
    processingTimeMs: number,
    targetRowIndex?: number,
    populatedFields?: number,
    error?: string
  ) {
    this.logOperation('data_population', status, {
      metadata: {
        target_row_index: targetRowIndex,
        populated_fields: populatedFields
      },
      performance_metrics: {
        processing_time_ms: processingTimeMs,
        api_calls: 1
      },
      error_details: error ? {
        error_code: 'POPULATION_ERROR',
        error_message: error
      } : undefined
    });
  }

  logError(error: Error, context: string, metadata?: Record<string, any>) {
    this.logOperation('error', 'failed', {
      error_details: {
        error_code: 'GENERAL_ERROR',
        error_message: error.message,
        stack_trace: error.stack
      },
      metadata: {
        context,
        ...metadata
      }
    });
  }

  getSessionSummary() {
    const sessionDuration = Date.now() - this.sessionStartTime;
    const operations = this.logEntries.reduce((acc, entry) => {
      const op = entry.operation_type;
      if (!acc[op]) {
        acc[op] = { total: 0, completed: 0, failed: 0 };
      }
      acc[op].total++;
      if (entry.status === 'completed') acc[op].completed++;
      if (entry.status === 'failed') acc[op].failed++;
      return acc;
    }, {} as Record<string, any>);

    const errors = this.logEntries.filter(e => e.status === 'failed');
    const avgProcessingTime = this.logEntries
      .filter(e => e.performance_metrics?.processing_time_ms)
      .reduce((acc, e) => acc + (e.performance_metrics?.processing_time_ms || 0), 0) /
      Math.max(1, this.logEntries.filter(e => e.performance_metrics).length);

    return {
      session_id: this.sessionId,
      session_duration_ms: sessionDuration,
      total_operations: this.logEntries.length,
      operations_summary: operations,
      error_count: errors.length,
      success_rate: this.logEntries.length > 0
        ? (this.logEntries.filter(e => e.status === 'completed').length / this.logEntries.length) * 100
        : 0,
      avg_processing_time_ms: avgProcessingTime,
      recent_errors: errors.slice(-5).map(e => ({
        operation: e.operation_type,
        error: e.error_details?.error_message,
        timestamp: e.timestamp
      }))
    };
  }

  async flushLogs() {
    if (this.logEntries.length === 0) return;

    try {
      console.log(`📊 Flushing ${this.logEntries.length} log entries to backend`);
      
      const { data, error } = await supabase.functions.invoke('document-analysis-logger', {
        body: {
          log_entries: this.logEntries
        }
      });

      if (error) {
        console.error('❌ Failed to flush logs:', error);
        throw error;
      }

      console.log('✅ Successfully flushed logs:', data);
      
      // Clear logged entries after successful flush
      this.logEntries = [];
      
      return data;
    } catch (error) {
      console.error('❌ Error flushing logs:', error);
      // Keep the logs for retry later
      throw error;
    }
  }

  // Auto-flush logs when page unloads
  setupAutoFlush() {
    window.addEventListener('beforeunload', () => {
      if (this.logEntries.length > 0) {
        // Use sendBeacon for reliable delivery during page unload
        navigator.sendBeacon('/api/document-analysis-logs', JSON.stringify({
          log_entries: this.logEntries
        }));
      }
    });

    // Periodic flush every 5 minutes
    setInterval(() => {
      if (this.logEntries.length > 0) {
        this.flushLogs().catch(console.error);
      }
    }, 5 * 60 * 1000);
  }
}

// Global logger instance
export const documentAnalysisLogger = new DocumentAnalysisLogger();

// Setup auto-flush on initialization
if (typeof window !== 'undefined') {
  documentAnalysisLogger.setupAutoFlush();
}

export default documentAnalysisLogger;

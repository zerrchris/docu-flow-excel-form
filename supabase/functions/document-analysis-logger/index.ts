import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AnalysisLogEntry {
  user_id: string;
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

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from request
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      throw new Error('No authorization header');
    }

    const jwt = authorization.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { log_entries } = await req.json();

    if (!log_entries || !Array.isArray(log_entries)) {
      throw new Error('Invalid log entries format');
    }

    console.log(`📊 Document Analysis Logger: Received ${log_entries.length} log entries from user ${user.id}`);

    // Process and store log entries
    const processedEntries = log_entries.map((entry: any) => ({
      ...entry,
      user_id: user.id,
      timestamp: entry.timestamp || new Date().toISOString(),
      created_at: new Date().toISOString()
    }));

    // Store in function_logs table for analysis and debugging
    const { data: logData, error: logError } = await supabaseClient
      .from('function_logs')
      .insert(processedEntries.map(entry => ({
        user_id: entry.user_id,
        function_name: 'document-analysis-logger',
        input: {
          operation_type: entry.operation_type,
          status: entry.status,
          document_info: entry.document_info,
          session_id: entry.session_id
        },
        output: {
          analysis_results: entry.analysis_results,
          performance_metrics: entry.performance_metrics,
          metadata: entry.metadata
        },
        status_code: entry.status === 'completed' ? 200 : entry.status === 'failed' ? 500 : 102,
        execution_time_ms: entry.performance_metrics?.processing_time_ms || 0,
        error_message: entry.error_details?.error_message || null
      })));

    if (logError) {
      console.error('❌ Error storing log entries:', logError);
      throw new Error(`Failed to store log entries: ${logError.message}`);
    }

    // Generate analysis summary for performance monitoring
    const operationSummary = processedEntries.reduce((acc, entry) => {
      const opType = entry.operation_type;
      if (!acc[opType]) {
        acc[opType] = {
          total: 0,
          completed: 0,
          failed: 0,
          avg_processing_time: 0,
          total_processing_time: 0
        };
      }
      
      acc[opType].total++;
      if (entry.status === 'completed') acc[opType].completed++;
      if (entry.status === 'failed') acc[opType].failed++;
      
      if (entry.performance_metrics?.processing_time_ms) {
        acc[opType].total_processing_time += entry.performance_metrics.processing_time_ms;
        acc[opType].avg_processing_time = acc[opType].total_processing_time / acc[opType].total;
      }
      
      return acc;
    }, {} as Record<string, any>);

    // Check for error patterns that need attention
    const errorPatterns = processedEntries
      .filter(entry => entry.status === 'failed')
      .map(entry => ({
        operation: entry.operation_type,
        error: entry.error_details?.error_message,
        timestamp: entry.timestamp
      }));

    // Log critical errors for immediate attention
    if (errorPatterns.length > 0) {
      console.warn(`⚠️ Found ${errorPatterns.length} errors in this session:`, errorPatterns);
      
      // Check for repeated failures that might indicate systemic issues
      const errorCounts = errorPatterns.reduce((acc, error) => {
        const key = `${error.operation}:${error.error?.substring(0, 50)}`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      const repeatedErrors = Object.entries(errorCounts).filter(([_, count]) => count >= 3);
      if (repeatedErrors.length > 0) {
        console.error('🚨 Repeated errors detected:', repeatedErrors);
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        entries_processed: processedEntries.length,
        operation_summary: operationSummary,
        error_patterns: errorPatterns,
        session_health: {
          total_operations: processedEntries.length,
          success_rate: processedEntries.length > 0 
            ? (processedEntries.filter(e => e.status === 'completed').length / processedEntries.length) * 100 
            : 0,
          avg_processing_time: operationSummary.ai_analysis?.avg_processing_time || 0
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Document Analysis Logger error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to process log entries'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
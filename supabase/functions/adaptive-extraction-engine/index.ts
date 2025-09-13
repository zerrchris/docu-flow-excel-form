import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ExtractionFeedback {
  original_extraction: Record<string, any>;
  user_corrections: Record<string, any>;
  document_type: string;
  confidence_scores: Record<string, number>;
  extraction_prompt: string;
  success_score: number; // 0-1 based on how many fields needed correction
}

interface LearningInsight {
  pattern_type: 'field_pattern' | 'document_type' | 'prompt_improvement';
  pattern_data: Record<string, any>;
  improvement_suggestion: string;
  confidence: number;
  usage_count: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      throw new Error('No authorization header');
    }

    const jwt = authorization.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { action, data } = await req.json();

    console.log(`🧠 Adaptive Extraction Engine: Processing ${action} for user ${user.id}`);

    switch (action) {
      case 'record_feedback':
        return await recordUserFeedback(supabaseClient, user.id, data);
      
      case 'get_improved_prompt':
        return await getImprovedPrompt(supabaseClient, data);
      
      case 'analyze_patterns':
        return await analyzeExtractionPatterns(supabaseClient);
      
      case 'get_field_suggestions':
        return await getFieldSuggestions(supabaseClient, data);
      
      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    console.error('Adaptive Extraction Engine error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to process request'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

async function recordUserFeedback(supabaseClient: any, userId: string, feedbackData: ExtractionFeedback) {
  console.log('📝 Recording extraction feedback for learning');
  
  // Calculate success metrics
  const totalFields = Object.keys(feedbackData.original_extraction).length;
  const correctedFields = Object.keys(feedbackData.user_corrections).length;
  const successRate = totalFields > 0 ? (totalFields - correctedFields) / totalFields : 0;

  // Store feedback for learning
  const { error: feedbackError } = await supabaseClient
    .from('extraction_feedback')
    .insert({
      user_id: userId,
      original_extraction: feedbackData.original_extraction,
      user_corrections: feedbackData.user_corrections,
      document_type: feedbackData.document_type,
      confidence_scores: feedbackData.confidence_scores,
      extraction_prompt: feedbackData.extraction_prompt,
      success_rate: successRate,
      field_count: totalFields,
      correction_count: correctedFields,
      created_at: new Date().toISOString()
    });

  if (feedbackError) {
    throw new Error(`Failed to store feedback: ${feedbackError.message}`);
  }

  // Analyze patterns in real-time
  const insights = await generateLearningInsights(supabaseClient, feedbackData);

  return new Response(
    JSON.stringify({ 
      success: true,
      feedback_recorded: true,
      success_rate: successRate,
      insights_generated: insights.length,
      recommendations: insights.slice(0, 3) // Top 3 recommendations
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getImprovedPrompt(supabaseClient: any, requestData: { document_type: string, current_prompt: string, target_fields: string[] }) {
  console.log('🎯 Generating improved extraction prompt based on learning data');

  // Get successful extraction patterns for this document type
  const { data: successfulExtractions } = await supabaseClient
    .from('extraction_feedback')
    .select('*')
    .eq('document_type', requestData.document_type)
    .gte('success_rate', 0.8)
    .order('created_at', { ascending: false })
    .limit(50);

  if (!successfulExtractions || successfulExtractions.length === 0) {
    return new Response(
      JSON.stringify({ 
        success: true,
        improved_prompt: requestData.current_prompt,
        improvement_applied: false,
        reason: 'Insufficient learning data for this document type'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Analyze common patterns in successful extractions
  const fieldPatterns = analyzeFieldPatterns(successfulExtractions, requestData.target_fields);
  const improvedPrompt = enhancePromptWithPatterns(requestData.current_prompt, fieldPatterns);

  // Store the prompt improvement for tracking
  await supabaseClient
    .from('prompt_improvements')
    .insert({
      document_type: requestData.document_type,
      original_prompt: requestData.current_prompt,
      improved_prompt: improvedPrompt,
      learning_data_count: successfulExtractions.length,
      field_patterns: fieldPatterns,
      created_at: new Date().toISOString()
    });

  return new Response(
    JSON.stringify({ 
      success: true,
      improved_prompt: improvedPrompt,
      improvement_applied: true,
      learning_data_points: successfulExtractions.length,
      key_improvements: Object.keys(fieldPatterns)
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function analyzeExtractionPatterns(supabaseClient: any) {
  console.log('📊 Analyzing extraction patterns across all users');

  // Get aggregated data (anonymized)
  const { data: allFeedback } = await supabaseClient
    .from('extraction_feedback')
    .select('document_type, success_rate, field_count, correction_count, confidence_scores, user_corrections')
    .gte('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()); // Last 30 days

  if (!allFeedback || allFeedback.length === 0) {
    return new Response(
      JSON.stringify({ 
        success: true,
        patterns: [],
        message: 'Insufficient data for pattern analysis'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Analyze patterns
  const documentTypePerformance = analyzeDocumentTypePerformance(allFeedback);
  const commonFailurePatterns = analyzeCommonFailures(allFeedback);
  const fieldAccuracyPatterns = analyzeFieldAccuracy(allFeedback);

  return new Response(
    JSON.stringify({ 
      success: true,
      analysis_period: '30 days',
      total_extractions: allFeedback.length,
      patterns: {
        document_type_performance: documentTypePerformance,
        common_failures: commonFailurePatterns,
        field_accuracy: fieldAccuracyPatterns
      },
      recommendations: generateSystemRecommendations(documentTypePerformance, commonFailurePatterns)
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function getFieldSuggestions(supabaseClient: any, requestData: { document_type: string, context: string }) {
  console.log('💡 Getting field suggestions based on learning data');

  // Get successful extractions for similar document types
  const { data: similarExtractions } = await supabaseClient
    .from('extraction_feedback')
    .select('original_extraction, user_corrections, document_type')
    .or(`document_type.eq.${requestData.document_type},document_type.ilike.%${requestData.document_type}%`)
    .gte('success_rate', 0.7)
    .limit(100);

  if (!similarExtractions || similarExtractions.length === 0) {
    return new Response(
      JSON.stringify({ 
        success: true,
        suggested_fields: [],
        message: 'No learning data available for similar document types'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Extract commonly successful fields
  const fieldFrequency: Record<string, number> = {};
  const fieldExamples: Record<string, string[]> = {};

  similarExtractions.forEach(extraction => {
    const allFields = { ...extraction.original_extraction, ...extraction.user_corrections };
    Object.entries(allFields).forEach(([field, value]) => {
      if (value && typeof value === 'string' && value.trim() !== '') {
        fieldFrequency[field] = (fieldFrequency[field] || 0) + 1;
        if (!fieldExamples[field]) fieldExamples[field] = [];
        if (fieldExamples[field].length < 3) {
          fieldExamples[field].push(value.toString().substring(0, 50));
        }
      }
    });
  });

  // Sort by frequency and return top suggestions
  const suggestedFields = Object.entries(fieldFrequency)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([field, frequency]) => ({
      field_name: field,
      usage_frequency: frequency,
      confidence: frequency / similarExtractions.length,
      examples: fieldExamples[field] || []
    }));

  return new Response(
    JSON.stringify({ 
      success: true,
      suggested_fields: suggestedFields,
      learning_data_points: similarExtractions.length,
      document_type: requestData.document_type
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

// Helper functions
function analyzeFieldPatterns(extractions: any[], targetFields: string[]) {
  const patterns: Record<string, any> = {};
  
  extractions.forEach(extraction => {
    targetFields.forEach(field => {
      if (!patterns[field]) patterns[field] = { success_indicators: [], common_formats: [] };
      
      // Analyze successful extraction patterns
      if (extraction.original_extraction[field] && !extraction.user_corrections[field]) {
        patterns[field].success_indicators.push(extraction.original_extraction[field]);
      }
    });
  });

  return patterns;
}

function enhancePromptWithPatterns(originalPrompt: string, patterns: Record<string, any>) {
  let enhancedPrompt = originalPrompt;
  
  // Add specific guidance based on learned patterns
  const patternGuidance = Object.entries(patterns)
    .map(([field, data]) => {
      if (data.success_indicators.length > 0) {
        return `For ${field}: Look for patterns similar to these successful examples: ${data.success_indicators.slice(0, 2).join(', ')}`;
      }
      return '';
    })
    .filter(guidance => guidance !== '')
    .join('\n');

  if (patternGuidance) {
    enhancedPrompt += '\n\nBased on learning from successful extractions:\n' + patternGuidance;
  }

  return enhancedPrompt;
}

function analyzeDocumentTypePerformance(feedback: any[]) {
  const performance: Record<string, any> = {};
  
  feedback.forEach(item => {
    if (!performance[item.document_type]) {
      performance[item.document_type] = {
        total_extractions: 0,
        avg_success_rate: 0,
        total_success_rate: 0
      };
    }
    
    performance[item.document_type].total_extractions++;
    performance[item.document_type].total_success_rate += item.success_rate;
    performance[item.document_type].avg_success_rate = 
      performance[item.document_type].total_success_rate / performance[item.document_type].total_extractions;
  });

  return performance;
}

function analyzeCommonFailures(feedback: any[]) {
  const failures: Record<string, number> = {};
  
  feedback.forEach(item => {
    if (item.user_corrections && typeof item.user_corrections === 'object') {
      Object.keys(item.user_corrections).forEach(field => {
        failures[field] = (failures[field] || 0) + 1;
      });
    }
  });

  return Object.entries(failures)
    .sort(([,a], [,b]) => b - a)
    .slice(0, 10)
    .map(([field, count]) => ({ field, failure_count: count }));
}

function analyzeFieldAccuracy(feedback: any[]) {
  const fieldStats: Record<string, { total: number, failures: number }> = {};
  
  feedback.forEach(item => {
    if (item.original_extraction && typeof item.original_extraction === 'object') {
      Object.keys(item.original_extraction).forEach(field => {
        if (!fieldStats[field]) fieldStats[field] = { total: 0, failures: 0 };
        fieldStats[field].total++;
        
        if (item.user_corrections && item.user_corrections[field]) {
          fieldStats[field].failures++;
        }
      });
    }
  });

  return Object.entries(fieldStats)
    .map(([field, stats]) => ({
      field,
      accuracy: stats.total > 0 ? (stats.total - stats.failures) / stats.total : 0,
      total_extractions: stats.total
    }))
    .sort((a, b) => b.accuracy - a.accuracy);
}

function generateSystemRecommendations(docPerformance: any, failures: any[]) {
  const recommendations = [];
  
  // Find document types with low performance
  const lowPerformingDocs = Object.entries(docPerformance)
    .filter(([, perf]: [string, any]) => perf.avg_success_rate < 0.7)
    .map(([docType]) => docType);

  if (lowPerformingDocs.length > 0) {
    recommendations.push({
      type: 'prompt_improvement',
      message: `Consider improving prompts for: ${lowPerformingDocs.join(', ')}`,
      priority: 'high'
    });
  }

  // Find frequently failing fields
  const topFailures = failures.slice(0, 3);
  if (topFailures.length > 0) {
    recommendations.push({
      type: 'field_training',
      message: `Focus extraction training on frequently failing fields: ${topFailures.map(f => f.field).join(', ')}`,
      priority: 'medium'
    });
  }

  return recommendations;
}

async function generateLearningInsights(supabaseClient: any, feedbackData: ExtractionFeedback) {
  // This could be expanded to generate real-time insights
  // For now, return basic insights based on the feedback
  return [
    {
      type: 'correction_pattern',
      insight: `User corrected ${Object.keys(feedbackData.user_corrections).length} fields`,
      confidence: 0.8
    }
  ];
}
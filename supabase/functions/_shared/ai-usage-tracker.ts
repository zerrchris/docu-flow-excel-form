import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// OpenAI pricing per 1K tokens (as of 2024)
const MODEL_PRICING = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1-2025-04-14': { input: 0.003, output: 0.012 },
  'gpt-5-2025-08-07': { input: 0.005, output: 0.015 },
  'gpt-5-mini-2025-08-07': { input: 0.0002, output: 0.0008 },
  'gpt-5-nano-2025-08-07': { input: 0.0001, output: 0.0004 },
} as const;

interface AIUsageData {
  user_id?: string;
  function_name: string;
  model_used: string;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  request_payload?: any;
  response_payload?: any;
  success: boolean;
  error_message?: string;
}

export async function trackAIUsage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  data: AIUsageData
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Calculate estimated cost
    let estimatedCost = 0;
    if (data.input_tokens && data.output_tokens && data.model_used in MODEL_PRICING) {
      const pricing = MODEL_PRICING[data.model_used as keyof typeof MODEL_PRICING];
      estimatedCost = (data.input_tokens / 1000 * pricing.input) + (data.output_tokens / 1000 * pricing.output);
    }

    // Ensure total_tokens is calculated
    const totalTokens = data.total_tokens || (data.input_tokens || 0) + (data.output_tokens || 0);

    const { error } = await supabase
      .from('ai_usage_analytics')
      .insert({
        user_id: data.user_id,
        function_name: data.function_name,
        model_used: data.model_used,
        input_tokens: data.input_tokens,
        output_tokens: data.output_tokens,
        total_tokens: totalTokens,
        estimated_cost_usd: estimatedCost,
        request_payload: data.request_payload,
        response_payload: data.response_payload,
        success: data.success,
        error_message: data.error_message
      });

    if (error) {
      console.error('Failed to track AI usage:', error);
    } else {
      console.log('AI usage tracked successfully');
    }
  } catch (error) {
    console.error('Error tracking AI usage:', error);
  }
}

export function extractTokensFromResponse(response: any): { input_tokens?: number; output_tokens?: number; total_tokens?: number } {
  try {
    if (response?.usage) {
      return {
        input_tokens: response.usage.prompt_tokens,
        output_tokens: response.usage.completion_tokens,
        total_tokens: response.usage.total_tokens
      };
    }
  } catch (error) {
    console.error('Error extracting tokens from response:', error);
  }
  return {};
}
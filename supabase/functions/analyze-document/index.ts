import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

// Inline AI usage tracking to avoid import issues
const MODEL_PRICING = {
  'gpt-4o': { input: 0.005, output: 0.015 },
  'gpt-4o-mini': { input: 0.00015, output: 0.0006 },
  'gpt-4.1-2025-04-14': { input: 0.003, output: 0.012 },
  'gpt-5-2025-08-07': { input: 0.005, output: 0.015 },
  'gpt-5-mini-2025-08-07': { input: 0.0002, output: 0.0008 },
  'gpt-5-nano-2025-08-07': { input: 0.0001, output: 0.0004 },
} as const;

async function trackAIUsage(
  supabaseUrl: string,
  supabaseServiceKey: string,
  data: {
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
) {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    let estimatedCost = 0;
    if (data.input_tokens && data.output_tokens && data.model_used in MODEL_PRICING) {
      const pricing = MODEL_PRICING[data.model_used as keyof typeof MODEL_PRICING];
      estimatedCost = (data.input_tokens / 1000 * pricing.input) + (data.output_tokens / 1000 * pricing.output);
    }

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
    }
  } catch (error) {
    console.error('Error tracking AI usage:', error);
  }
}

function extractTokensFromResponse(response: any): { input_tokens?: number; output_tokens?: number; total_tokens?: number } {
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

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  console.log('analyze-document function called with method:', req.method);
  console.log('Request headers:', JSON.stringify(Object.fromEntries(req.headers.entries())));
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Check if OpenAI API key is configured
  if (!openAIApiKey) {
    console.error('OpenAI API key is not configured');
    return new Response(
      JSON.stringify({ 
        error: 'OpenAI API key is not configured. Please add OPENAI_API_KEY to Edge Function secrets.',
        details: 'Missing OPENAI_API_KEY environment variable'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const { prompt, imageData, systemMessage } = await req.json();
    
    // Fetch global extraction instructions from admin settings
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    let globalInstructions = '';
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'global_extraction_instructions')
        .maybeSingle();
      
      if (!error && data?.setting_value) {
        globalInstructions = data.setting_value;
      }
    } catch (error) {
      console.error('Error fetching global instructions:', error);
    }
    
    // Use the provided system message (which includes column instructions from frontend)
    // or build a comprehensive one
    let finalSystemMessage;
    if (systemMessage) {
      // If system message is provided, append global instructions to it
      finalSystemMessage = globalInstructions ? 
        `${systemMessage}\n\nAdditional Global Instructions: ${globalInstructions}` : 
        systemMessage;
    } else {
      // Fallback system message with global instructions
      const defaultSystemMessage = "You are a precise document analysis assistant specializing in real estate and legal documents. Extract information that is clearly visible and readable in the document. Pay special attention to mineral rights, mineral reservations, mineral exceptions, surface vs subsurface rights, oil/gas/water rights, and any language about 'reserving' or 'excepting' minerals. Include ALL mineral-related information in your extraction, even if it seems minor. If information is not clearly present, use empty string ''. Return ONLY valid JSON with field names as keys and extracted text as values. No markdown, no explanations, no additional text - just clean JSON.";
      finalSystemMessage = globalInstructions ? 
        `${defaultSystemMessage}\n\nAdditional Global Instructions: ${globalInstructions}` : 
        defaultSystemMessage;
    }
    
    // Extract user_id from auth header for usage tracking
    const authHeader = req.headers.get('authorization');
    let user_id: string | undefined;

    if (!prompt || !imageData) {
      return new Response(
        JSON.stringify({ error: 'Prompt and imageData are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Analyzing document with vision API');
    console.log('Image data prefix:', imageData.substring(0, 100));

    // Validate base64 data URL format
    if (!imageData.startsWith('data:')) {
      console.error('Invalid data URL format - missing data: prefix');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid image data format. Expected data URL format.',
          details: 'Image data must be in data URL format (data:image/type;base64,...)'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if the data is a PDF - note that OpenAI vision API doesn't support PDFs directly
    const base64Content = imageData.split(',')[1];
    let processedImageData = imageData;
    
    if ((base64Content && base64Content.startsWith('JVBERi0')) || imageData.includes('data:application/pdf')) {
      console.log('PDF detected - PDF analysis not supported with OpenAI Vision API');
      
      return new Response(
        JSON.stringify({ 
          error: 'PDF files are not supported with OpenAI Vision API. Please convert your PDF to an image format (PNG, JPEG) or use a different analysis method.',
          details: 'OpenAI Vision API only supports image formats. Consider using OCR services or converting PDF pages to images first.'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if it's a valid image format
    const supportedFormats = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const mimeType = imageData.split(';')[0].replace('data:', '');
    
    // Handle octet-stream by checking if it's actually an image
    if (!supportedFormats.includes(mimeType)) {
      // If it's octet-stream, try to detect if it's actually an image by checking base64 headers
      if (mimeType === 'application/octet-stream') {
        const base64Content = imageData.split(',')[1];
        if (base64Content) {
          // Check for image file signatures in base64
          if (base64Content.startsWith('/9j/') || base64Content.startsWith('iVBOR') || 
              base64Content.startsWith('R0lGOD') || base64Content.startsWith('UklGR')) {
            console.log('Detected image content in octet-stream, proceeding with analysis');
          } else {
            console.error('Unsupported file format:', mimeType);
            return new Response(
              JSON.stringify({ 
                error: `Unsupported file format: ${mimeType}. Please use PNG, JPEG, GIF, or WebP images.`,
                details: 'File appears to be octet-stream but not a recognizable image format'
              }),
              { 
                status: 400, 
                headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
              }
            );
          }
        }
      } else {
        console.error('Unsupported file format:', mimeType);
        return new Response(
          JSON.stringify({ 
            error: `Unsupported file format: ${mimeType}. Please use PNG, JPEG, GIF, or WebP images.`,
            details: 'OpenAI vision API only supports image formats'
          }),
          { 
            status: 400, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }
    }

    // Validate base64 content
    const base64Part = imageData.split(',')[1];
    if (!base64Part) {
      console.error('Invalid data URL - missing base64 content');
      return new Response(
        JSON.stringify({ 
          error: 'Invalid image data format. Missing base64 content.',
          details: 'Data URL must contain base64 encoded image data'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Test base64 decoding
    try {
      atob(base64Part);
    } catch (e) {
      console.error('Invalid base64 encoding:', e.message);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid base64 encoding in image data.',
          details: 'The base64 content cannot be decoded'
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: finalSystemMessage },
          { 
            role: 'user', 
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: processedImageData,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error response:', response.status, response.statusText);
      console.error('OpenAI API error details:', error);
      
      // Try to parse error for more specific message
      let errorMessage = 'Failed to analyze document';
      try {
        const errorData = JSON.parse(error);
        errorMessage = errorData.error?.message || errorData.message || errorMessage;
      } catch (e) {
        errorMessage = error || errorMessage;
      }
      
      return new Response(
        JSON.stringify({ error: errorMessage, details: error }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    console.log('Document analysis completed successfully');

    // Track AI usage
    const tokens = extractTokensFromResponse(data);
    await trackAIUsage(supabaseUrl, supabaseServiceKey, {
      user_id,
      function_name: 'analyze-document',
      model_used: 'gpt-4o-mini',
      ...tokens,
      request_payload: { prompt_length: prompt.length, has_image: !!imageData },
      response_payload: { response_length: generatedText.length },
      success: true
    });

    return new Response(
      JSON.stringify({ generatedText, usage: data.usage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in analyze-document function:', error);
    
    // Track failed AI usage
    await trackAIUsage(supabaseUrl, supabaseServiceKey, {
      user_id,
      function_name: 'analyze-document',
      model_used: 'gpt-4o-mini',
      success: false,
      error_message: error.message
    });
    
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
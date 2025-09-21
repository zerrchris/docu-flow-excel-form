import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { trackAIUsage, extractTokensFromResponse } from '../_shared/ai-usage-tracker.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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
    
    // Fetch global extraction instructions from admin settings
    let globalInstructions = '';
    try {
      const { data, error } = await supabaseClient
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

    const { document_data, runsheet_id, document_name, extraction_preferences } = await req.json();
    
    console.log('📋 Extraction preferences received:', {
      columns: extraction_preferences?.columns?.length || 0,
      hasInstructions: !!extraction_preferences?.column_instructions,
      instructionsKeys: extraction_preferences?.column_instructions ? Object.keys(extraction_preferences.column_instructions) : []
    });

    // Comprehensive document format validation
    const validateDocumentData = (data: string): { isValid: boolean; error?: string; fileType?: string } => {
      if (!data || typeof data !== 'string') {
        return { isValid: false, error: 'No document data provided' };
      }

      // Supported formats for AI analysis
      const supportedImageFormats = [
        'data:image/jpeg', 'data:image/jpg', 'data:image/png', 
        'data:image/gif', 'data:image/webp', 'data:image/bmp'
      ];

      // Check for supported formats
      const detectedFormat = supportedImageFormats.find(format => data.startsWith(format));
      if (detectedFormat) {
        const fileType = detectedFormat.split('/')[1];
        console.log('✅ Enhanced analysis: Valid format detected:', fileType);
        return { isValid: true, fileType };
      }

      // Specific error messages for common unsupported formats
      if (data.includes('data:application/pdf')) {
        return { 
          isValid: false, 
          error: 'PDF format detected. Please convert PDF pages to image format (PNG/JPEG) for enhanced AI analysis.',
          fileType: 'pdf'
        };
      }

      if (data.includes('data:image/svg')) {
        return { 
          isValid: false, 
          error: 'SVG format is not supported for AI document analysis. Please convert to raster format (PNG/JPEG).',
          fileType: 'svg'
        };
      }

      if (data.includes('data:application/') || data.includes('data:text/')) {
        return { 
          isValid: false, 
          error: 'Document files require image conversion. Please screenshot the document or export as PNG/JPEG.',
          fileType: 'document'
        };
      }

      // Check for valid base64 structure
      if (!data.startsWith('data:')) {
        return { 
          isValid: false, 
          error: 'Invalid document format. Expected base64-encoded image data.',
          fileType: 'invalid'
        };
      }

      return { 
        isValid: false, 
        error: 'Unsupported document format for AI analysis. Please provide PNG, JPEG, GIF, WebP, or BMP image.',
        fileType: 'unsupported'
      };
    };

    // Validate document data
    const validation = validateDocumentData(document_data);
    if (!validation.isValid) {
      console.error('❌ Enhanced analysis validation failed:', validation.error);
      
      return new Response(
        JSON.stringify({ 
          success: false,
          error: validation.error,
          fileType: validation.fileType,
          supportedFormats: ['PNG', 'JPEG', 'GIF', 'WebP', 'BMP'],
          recommendations: {
            pdf: 'Use a PDF to image converter or screenshot each page',
            document: 'Take a screenshot of the document or export as image',
            svg: 'Convert SVG to PNG or JPEG using an image editor'
          }
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    // Enhanced document analysis using OpenAI GPT-4 Vision
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o-mini", // Use same model as analyze-document for consistency
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst specializing in real estate and legal documents. You MUST extract structured data and return ONLY valid JSON format.

🔍 ANALYSIS REQUIREMENTS:
- Scan the document carefully and extract all visible information
- Focus on consistency - extract the same information the same way every time
- Be deterministic - same document should produce identical results

⚠️ CRITICAL RULES:
- ALWAYS return valid JSON - never refuse or return text explanations
- Extract information that is clearly visible in the document
- For missing fields, use empty string "" (not null)
- Be consistent with address formats and legal descriptions
- Extract complete addresses including building numbers and suite details

EXTRACTION REQUIREMENTS:
${extraction_preferences?.columns ? `- Extract these specific fields:
${extraction_preferences.columns.map(col => {
  const instruction = extraction_preferences?.column_instructions?.[col];
  return instruction ? `  * ${col}: ${instruction}` : `  * ${col}: Extract this field value`;
}).join('\n')}` : '- Extract common document fields like dates, names, addresses, amounts, document types, etc.'}

CONSISTENCY GUIDELINES:
- Always extract full addresses with all visible components (street, building, suite, city, state, zip)
- Legal descriptions should include all fractions and section details exactly as written
- Dates should be in MM/DD/YYYY format consistently
- Names should include all visible name variations (a/k/a, etc.)

${globalInstructions ? `\nGlobal Admin Instructions: ${globalInstructions}\n` : ''}

RESPONSE FORMAT: Return ONLY a valid JSON object with:
{
  "extracted_data": {
    "field_name": "extracted_value_or_empty_string_if_not_found"
  },
  "confidence_scores": {
    "field_name": 0.95
  },
  "document_type": "detected document type",
  "instruments_detected": "number and types of instruments found on page",
  "target_instrument": "which instrument was selected for analysis and why",
  "extraction_summary": "brief summary of what was extracted from the target instrument",
  "processing_notes": "any notes about extraction quality or issues"
}`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please analyze this document and extract the relevant data according to the requirements."
              },
              {
                type: "image_url",
                image_url: {
                  url: document_data
                }
              }
            ]
          }
        ],
        max_tokens: 2000,
        temperature: 0.0,  // Zero temperature for deterministic results
        seed: 12345,       // Fixed seed for reproducibility
        response_format: { type: "json_object" }
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const aiResult = await openaiResponse.json();
    
    // Track AI usage for billing
    const tokenData = extractTokensFromResponse(aiResult);
    await trackAIUsage(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        user_id: user.id,
        function_name: 'enhanced-document-analysis',
        model_used: 'gpt-4o',
        input_tokens: tokenData.input_tokens,
        output_tokens: tokenData.output_tokens,
        total_tokens: tokenData.total_tokens,
        request_payload: { document_name, extraction_preferences },
        response_payload: aiResult,
        success: true
      }
    );
    
    let analysisResult;
    
    try {
      const content = aiResult.choices[0]?.message?.content;
      if (!content) {
        throw new Error('No content in AI response');
      }
      
      // Parse JSON from AI response
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        analysisResult = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      } else {
        analysisResult = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      // Track failed usage
      await trackAIUsage(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
          user_id: user.id,
          function_name: 'enhanced-document-analysis',
          model_used: 'gpt-4o',
          input_tokens: tokenData.input_tokens,
          output_tokens: tokenData.output_tokens,
          total_tokens: tokenData.total_tokens,
          success: false,
          error_message: `Parse error: ${parseError.message}`
        }
      );
      
      throw new Error('Failed to parse document analysis results');
    }

    // Store document analysis in database if runsheet_id is provided
    let document_record = null;
    if (runsheet_id) {
      const { data: docData, error: docError } = await supabaseClient
        .from('documents')
        .insert({
          user_id: user.id,
          runsheet_id: runsheet_id,
          original_filename: document_name || 'analyzed_document.png',
          stored_filename: `analyzed_${Date.now()}.png`,
          file_path: document_data, // Store the data URL for now
          row_index: analysisResult.row_index || 0,
          content_type: 'image/png'
        })
        .select()
        .single();

      if (docError) {
        console.warn('Failed to store document record:', docError);
      } else {
        document_record = docData;
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        analysis: analysisResult,
        document_record: document_record
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Enhanced document analysis error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to analyze document'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
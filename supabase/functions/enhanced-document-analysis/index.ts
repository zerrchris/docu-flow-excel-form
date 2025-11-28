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

    const { document_data, runsheet_id, document_name, extraction_preferences, selected_instrument } = await req.json();
    
    console.log('📋 Extraction preferences received:', {
      columns: extraction_preferences?.columns?.length || 0,
      hasInstructions: !!extraction_preferences?.column_instructions,
      instructionsKeys: extraction_preferences?.column_instructions ? Object.keys(extraction_preferences.column_instructions) : [],
      selectedInstrument: selected_instrument
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

🚨 CRITICAL ANTI-HALLUCINATION RULES:
- NEVER make up, infer, or fabricate information that is not explicitly visible in the document
- If a field's information is not clearly present in the document, you MUST return "Not found" as the value
- Do NOT use example data, placeholder data, or generic data (like "John Doe", "123 Main St", etc.)
- Do NOT infer values based on document type - only extract what is actually written
- Better to return "Not found" than to guess or make assumptions
- If text is unclear or partially visible, return "Not found" rather than guessing

🔍 MULTI-INSTRUMENT DETECTION:
${selected_instrument ? `
- THIS IS A FOCUSED EXTRACTION: Extract data ONLY from the following specific instrument:
  * Instrument ID: ${selected_instrument.id}
  * Type: ${selected_instrument.type}
  * Description: ${selected_instrument.description}
  * Legal Description Snippet: ${selected_instrument.snippet || 'N/A'}
- Ignore all other instruments on the page
- Focus exclusively on this instrument - match it by its type, description, and legal description
- Extract data ONLY from this specific instrument
` : `
- FIRST, count how many separate legal instruments appear on this page
- Each instrument is a distinct legal document (deed, mortgage, assignment, etc.)
- If multiple instruments exist, identify each one clearly
- For each instrument, extract a brief legal description snippet (first 100-150 characters) to help users identify which instrument they need
- Return instrument details so the user can choose which to extract
`}

🔍 ANALYSIS REQUIREMENTS:
- Scan the document carefully and extract all visible information
- Focus on consistency - extract the same information the same way every time
- Be deterministic - same document should produce identical results

⚠️ CRITICAL EXTRACTION RULES:
- ALWAYS return valid JSON - never refuse or return text explanations
- ONLY extract information that is CLEARLY VISIBLE and READABLE in the document
- For missing or not found fields, use the exact string "Not found" (not empty string, not null)
- NEVER fabricate, infer, or make up data - if you cannot see it clearly, return "Not found"
- If text is blurry, cut off, or unclear, return "Not found" for that field
- Do NOT use placeholder names like "John Doe", "Jane Smith", or generic addresses
- Read exactly what is written - do not paraphrase or interpret creatively

EXTRACTION REQUIREMENTS:
${extraction_preferences?.columns ? `- Extract these specific fields, returning "Not found" if not visible:
${extraction_preferences.columns.map(col => {
  const instruction = extraction_preferences?.column_instructions?.[col];
  return instruction ? `  * ${col}: ${instruction}. Return "Not found" if this information is not clearly visible.` : `  * ${col}: Extract this field value. Return "Not found" if not present.`;
}).join('\n')}` : '- Extract common document fields like dates, names, addresses, amounts, document types, etc.'}

EXTRACTION ACCURACY GUIDELINES:
- Copy text EXACTLY as it appears - do not modernize spelling or formatting
- For addresses: Extract only if complete and clearly visible, otherwise "Not found"
- For legal descriptions: Include all fractions and section details exactly as written, or "Not found"
- For dates: Use format shown in document, convert to MM/DD/YYYY only if date is clearly visible
- For names: Include all visible variations (a/k/a, etc.), but never invent names
- For amounts: Include currency symbols and decimals exactly as shown, or "Not found"

${globalInstructions ? `\nGlobal Admin Instructions: ${globalInstructions}\n` : ''}

RESPONSE FORMAT: Return ONLY a valid JSON object with:
${selected_instrument ? `
{
  "extracted_data": {
    "field_name": "extracted_value_OR_Not_found_if_not_clearly_visible"
  },
  "confidence_scores": {
    "field_name": 0.95
  },
  "document_type": "detected document type",
  "selected_instrument_id": ${selected_instrument.id},
  "selected_instrument_type": "${selected_instrument.type}",
  "extraction_summary": "brief summary of what was extracted from the selected instrument",
  "processing_notes": "any notes about extraction quality or issues"
}` : `
{
  "multiple_instruments": true/false,
  "instrument_count": number,
  "instruments": [
    {
      "id": 1,
      "type": "instrument type (e.g., Warranty Deed, Mortgage, Assignment)",
      "description": "brief description of this instrument",
      "snippet": "first 100-150 characters of the legal description from this instrument to help user identify it"
    }
  ],
  "extracted_data": {
    "field_name": "if only 1 instrument, extract visible data; otherwise use Not_found"
  },
  "confidence_scores": {
    "field_name": 0.95
  },
  "document_type": "detected document type",
  "extraction_summary": "brief summary",
  "processing_notes": "any notes about extraction quality or issues"
}`}
`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `Analyze this document and extract ONLY information that is clearly visible and readable. 

CRITICAL: If you cannot clearly see a field's value in the document, you MUST return "Not found" for that field. Do NOT make up, infer, or fabricate any information. Do NOT use placeholder names like "John Doe" or generic addresses.

Extract the requested data according to the requirements.`
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
          stored_filename: document_name || 'analyzed_document.png',
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
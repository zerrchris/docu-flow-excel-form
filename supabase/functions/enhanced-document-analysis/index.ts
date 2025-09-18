import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: `You are an expert document analyst specializing in real estate and legal documents. Analyze the provided document and extract structured data in JSON format.

⚠️ CRITICAL ANTI-HALLUCINATION RULES:
- NEVER make up, assume, or infer information that is not clearly visible in the document
- If a field is not present or not clearly readable, mark it as null or empty string
- If text is unclear or partially obscured, set confidence score to 0.3 or lower
- ONLY extract information that you can see with high certainty
- When unsure, err on the side of caution and leave fields empty
- Document any uncertainty in processing_notes

EXTRACTION REQUIREMENTS:
${extraction_preferences?.columns ? `- Extract these specific fields with their detailed instructions:
${extraction_preferences.columns.map(col => {
  const instruction = extraction_preferences?.column_instructions?.[col];
  return instruction ? `  * ${col}: ${instruction}` : `  * ${col}: Extract this field value`;
}).join('\n')}` : '- Extract common document fields like dates, names, addresses, amounts, document types, etc.'}

CRITICAL FOCUS AREAS:
- Mineral rights, mineral reservations, or mineral exceptions
- Surface rights vs subsurface rights distinctions  
- Oil, gas, and water rights
- Any language about "reserving" or "excepting" minerals
- Phrases like "subject to mineral reservation" or "minerals reserved"

Include ALL mineral-related information in your notes field, even if it seems minor.

${globalInstructions ? `\nGlobal Admin Instructions: ${globalInstructions}\n` : ''}

RESPONSE FORMAT: Return ONLY a valid JSON object with:
{
  "extracted_data": {
    "field_name": "extracted_value_or_null_if_not_found",
    // ... more fields
  },
  "confidence_scores": {
    "field_name": 0.95,
    // confidence values from 0-1 for each field (0.3 or lower if uncertain)
  },
  "document_type": "detected document type",
  "extraction_summary": "brief summary of what was extracted",
  "processing_notes": "any notes about extraction quality, mineral rights found, issues, or fields that were unclear/not found"
}

CRITICAL RULES: 
- Only include fields that CLEARLY exist and are READABLE in the document
- Use exact field names from the requirements
- Set confidence scores below 0.3 for any uncertain extractions
- Be thorough with mineral rights detection but only if actually present
- Include document type classification
- If information is not visible or clear, do NOT guess or make assumptions`
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
        temperature: 0.1
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const aiResult = await openaiResponse.json();
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
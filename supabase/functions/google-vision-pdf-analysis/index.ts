import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { trackAIUsage } from '../_shared/ai-usage-tracker.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface GoogleVisionResponse {
  responses: Array<{
    fullTextAnnotation?: {
      text: string;
      pages: Array<{
        blocks: Array<{
          boundingBox: any;
          paragraphs: Array<{
            words: Array<{
              symbols: Array<{
                text: string;
                boundingBox: any;
              }>;
            }>;
          }>;
        }>;
      }>;
    };
    textAnnotations?: Array<{
      description: string;
      boundingBox: any;
    }>;
  }>;
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

    const { document_data, runsheet_id, document_name, extraction_preferences } = await req.json();
    
    console.log('🔍 Starting Google Vision PDF analysis for:', document_name);
    console.log('📋 Extraction preferences:', {
      columns: extraction_preferences?.columns?.length || 0,
      hasInstructions: !!extraction_preferences?.column_instructions
    });

    // Validate document data
    if (!document_data || typeof document_data !== 'string') {
      throw new Error('No document data provided');
    }

    // Extract base64 content from data URL
    let base64Content: string;
    if (document_data.startsWith('data:')) {
      const base64Index = document_data.indexOf(',');
      if (base64Index === -1) {
        throw new Error('Invalid data URL format');
      }
      base64Content = document_data.substring(base64Index + 1);
    } else {
      base64Content = document_data;
    }

    console.log('📄 Processing document with Google Cloud Vision API...');

    // Call Google Cloud Vision API for document text detection
    const visionApiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
    if (!visionApiKey) {
      throw new Error('Google Cloud Vision API key not configured');
    }

    const visionResponse = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${visionApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              image: {
                content: base64Content,
              },
              features: [
                { type: 'DOCUMENT_TEXT_DETECTION', maxResults: 1 },
                { type: 'TEXT_DETECTION', maxResults: 50 }
              ],
              imageContext: {
                languageHints: ['en'],
              },
            },
          ],
        }),
      }
    );

    if (!visionResponse.ok) {
      const errorText = await visionResponse.text();
      throw new Error(`Google Vision API error: ${visionResponse.status} - ${errorText}`);
    }

    const visionResult: GoogleVisionResponse = await visionResponse.json();
    const detection = visionResult.responses[0];

    if (!detection.fullTextAnnotation?.text) {
      throw new Error('No text detected in the document');
    }

    const extractedText = detection.fullTextAnnotation.text;
    console.log('✅ Google Vision extracted text length:', extractedText.length);

    // Now use OpenAI to structure the extracted text according to extraction preferences
    console.log('🤖 Using AI to structure extracted data...');

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          {
            role: "system",
            content: `You are an expert at structuring OCR text into organized data. You will receive raw text extracted from a document and must organize it according to specific field requirements.

🎯 EXTRACTION REQUIREMENTS:
${extraction_preferences?.columns ? `Extract these specific fields:
${extraction_preferences.columns.map(col => {
  const instruction = extraction_preferences?.column_instructions?.[col];
  return instruction ? `• ${col}: ${instruction}` : `• ${col}: Extract this field value`;
}).join('\n')}` : '• Extract common document fields like dates, names, addresses, amounts, document types, etc.'}

📋 FORMATTING RULES:
- Extract information exactly as it appears in the text
- For missing fields, use empty string ""
- Be consistent with date formats (MM/DD/YYYY)
- Include full addresses with all components
- Legal descriptions should be complete and exact
- Numbers should maintain original formatting

RESPONSE FORMAT: Return ONLY valid JSON:
{
  "extracted_data": {
    "field_name": "extracted_value_or_empty_string"
  },
  "confidence_scores": {
    "field_name": 0.95
  },
  "document_type": "detected document type",
  "extraction_summary": "brief summary of extraction",
  "processing_notes": "notes about data quality from OCR"
}`
          },
          {
            role: "user",
            content: `Please extract structured data from this OCR text:\n\n${extractedText}`
          }
        ],
        max_tokens: 2000,
        temperature: 0.0,
        response_format: { type: "json_object" }
      }),
    });

    if (!openaiResponse.ok) {
      const errorText = await openaiResponse.text();
      throw new Error(`OpenAI API error: ${openaiResponse.status} - ${errorText}`);
    }

    const aiResult = await openaiResponse.json();
    
    // Track AI usage for billing
    const inputTokens = aiResult.usage?.prompt_tokens || 0;
    const outputTokens = aiResult.usage?.completion_tokens || 0;
    const totalTokens = aiResult.usage?.total_tokens || 0;
    
    await trackAIUsage(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        user_id: user.id,
        function_name: 'google-vision-pdf-analysis',
        model_used: 'gpt-4o-mini + google-vision',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
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
      
      analysisResult = JSON.parse(content);
      
      // Add OCR-specific metadata
      analysisResult.ocr_text_length = extractedText.length;
      analysisResult.processing_method = 'google_vision_ocr + ai_structuring';
      analysisResult.confidence_note = 'High OCR accuracy with Google Vision API';
      
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      
      // Track failed usage
      await trackAIUsage(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
        {
          user_id: user.id,
          function_name: 'google-vision-pdf-analysis',
          model_used: 'gpt-4o-mini + google-vision',
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          success: false,
          error_message: `Parse error: ${parseError.message}`
        }
      );
      
      throw new Error('Failed to parse structured data results');
    }

    // Store OCR data in database if runsheet_id is provided
    if (runsheet_id) {
      try {
        await supabaseClient
          .from('document_ocr_data')
          .insert({
            runsheet_id: runsheet_id,
            extracted_text: extractedText,
            structured_data: analysisResult,
            confidence_score: 0.95, // Google Vision typically has high confidence
            processing_method: 'google_cloud_vision',
            row_index: 0 // Will be updated when added to runsheet
          });
        
        console.log('✅ OCR data stored in database');
      } catch (ocrError) {
        console.warn('Failed to store OCR data:', ocrError);
      }
    }

    console.log('🎉 Google Vision analysis completed successfully');

    return new Response(
      JSON.stringify({ 
        success: true,
        analysis: analysisResult,
        raw_ocr_text: extractedText.substring(0, 1000) + (extractedText.length > 1000 ? '...' : ''), // Truncated for response
        processing_stats: {
          ocr_text_length: extractedText.length,
          processing_method: 'google_vision_ocr + ai_structuring',
          ai_tokens_used: totalTokens
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Google Vision PDF analysis error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Failed to analyze document with Google Vision'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
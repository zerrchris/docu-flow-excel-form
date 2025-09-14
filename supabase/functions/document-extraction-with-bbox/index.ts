import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

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

    const { 
      document_data, 
      runsheet_id, 
      row_index = 0, 
      columns = [], 
      column_instructions = {} 
    } = await req.json();

    if (!document_data) {
      throw new Error('No document data provided');
    }

    console.log('🔍 Starting enhanced extraction with bbox detection');
    console.log('📊 Columns requested:', columns);
    console.log('📋 Row index:', row_index);

    // Create detailed extraction prompt with bounding box requirements
    const extractionPrompt = `You are an expert document analyst that extracts data AND provides precise location information.

EXTRACTION REQUIREMENTS:
${columns.length > 0 ? `Extract these specific fields: ${columns.join(', ')}` : 'Extract key document information'}

COLUMN INSTRUCTIONS:
${Object.entries(column_instructions).map(([col, inst]) => `- ${col}: ${inst}`).join('\n')}

BOUNDING BOX REQUIREMENTS:
For each extracted field, you MUST provide the exact pixel coordinates where the text was found:
- x1, y1: top-left corner coordinates  
- x2, y2: bottom-right corner coordinates
- Coordinates should be relative to the image dimensions (0 to image_width, 0 to image_height)

RESPONSE FORMAT:
Return ONLY a valid JSON object:
{
  "extracted_data": {
    "field_name": "extracted_value"
  },
  "extraction_metadata": [
    {
      "field_name": "field_name",
      "extracted_value": "extracted_value", 
      "page_number": 1,
      "bbox": {
        "x1": 123,
        "y1": 456,
        "x2": 789,
        "y2": 512
      },
      "confidence_score": 0.95
    }
  ],
  "document_analysis": {
    "document_type": "detected type",
    "total_fields_found": 5,
    "image_dimensions": {
      "width": 1024,
      "height": 768
    }
  }
}

CRITICAL INSTRUCTIONS:
- Provide exact pixel coordinates for EVERY extracted field
- If text spans multiple lines, use coordinates that encompass the entire text block
- Confidence scores should reflect both text clarity and location accuracy (0.0 to 1.0)
- Only extract data that actually exists in the document
- Be precise with bounding box coordinates - they will be used for highlighting`;

    // Call OpenAI with enhanced extraction
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-2025-08-07',
        messages: [
          {
            role: 'system',
            content: extractionPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analyze this document and extract data with precise bounding box coordinates for each field.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: document_data
                }
              }
            ]
          }
        ],
        max_completion_tokens: 3000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const aiResult = await response.json();
    console.log('🤖 AI Response received');

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
      
      console.log('✅ Successfully parsed AI response');
      console.log('📊 Fields extracted:', Object.keys(analysisResult.extracted_data || {}));
      console.log('📍 Metadata entries:', analysisResult.extraction_metadata?.length || 0);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content:', aiResult.choices[0]?.message?.content);
      throw new Error('Failed to parse document analysis results');
    }

    // Store extraction metadata in database
    const metadataEntries = [];
    if (analysisResult.extraction_metadata && Array.isArray(analysisResult.extraction_metadata)) {
      for (const metadata of analysisResult.extraction_metadata) {
        if (metadata.bbox && metadata.field_name) {
          try {
            const { data: metadataRecord, error: metadataError } = await supabaseClient
              .from('document_extraction_metadata')
              .insert({
                user_id: user.id,
                runsheet_id: runsheet_id,
                row_index: row_index,
                field_name: metadata.field_name,
                extracted_value: metadata.extracted_value,
                page_number: metadata.page_number || 1,
                bbox_x1: metadata.bbox.x1,
                bbox_y1: metadata.bbox.y1,
                bbox_x2: metadata.bbox.x2,
                bbox_y2: metadata.bbox.y2,
                bbox_width: metadata.bbox.x2 - metadata.bbox.x1,
                bbox_height: metadata.bbox.y2 - metadata.bbox.y1,
                confidence_score: metadata.confidence_score || 0.0,
                extraction_method: 'ai_vision_bbox'
              })
              .select()
              .single();

            if (metadataError) {
              console.error('Error storing metadata:', metadataError);
            } else {
              metadataEntries.push(metadataRecord);
              console.log(`✅ Stored metadata for field: ${metadata.field_name}`);
            }
          } catch (error) {
            console.error(`Error processing metadata for ${metadata.field_name}:`, error);
          }
        }
      }
    }

    console.log(`📝 Successfully stored ${metadataEntries.length} metadata entries`);

    return new Response(
      JSON.stringify({
        success: true,
        extracted_data: analysisResult.extracted_data || {},
        extraction_metadata: analysisResult.extraction_metadata || [],
        document_analysis: analysisResult.document_analysis || {},
        stored_metadata_count: metadataEntries.length,
        database_metadata: metadataEntries
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Document extraction error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to extract document with bounding boxes'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
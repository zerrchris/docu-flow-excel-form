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
            content: `You are an expert document analyst. Analyze the provided document and extract structured data in JSON format. Focus on:
            
            ${extraction_preferences?.columns ? `Extract these specific fields: ${extraction_preferences.columns.join(', ')}` : 'Extract common document fields like dates, names, addresses, amounts, document types, etc.'}
            
            Provide confidence scores (0-1) for each extracted field based on text clarity and extraction certainty.
            
            Return a JSON object with:
            - extracted_data: object with field names as keys and extracted values
            - confidence_scores: object with same field names and confidence values (0-1)
            - document_type: detected document type
            - extraction_summary: brief summary of what was extracted
            - processing_notes: any notes about extraction quality or issues`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please analyze this document and extract the relevant data."
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
        max_tokens: 1500
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
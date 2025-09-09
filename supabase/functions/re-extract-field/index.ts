import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Helper function to log function calls
async function logFunction(supabase: any, userId: string | null, functionName: string, input: any, output: any, errorMessage: string | null, statusCode: number, executionTimeMs: number) {
  try {
    await supabase
      .from('function_logs')
      .insert({
        user_id: userId,
        function_name: functionName,
        input: input,
        output: output,
        error_message: errorMessage,
        status_code: statusCode,
        execution_time_ms: executionTimeMs
      });
  } catch (logError) {
    console.error('Failed to log function call:', logError);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  const startTime = Date.now();
  console.log('=== RE-EXTRACT-FIELD FUNCTION STARTED ===');
  console.log('Method:', req.method);
  console.log('Timestamp:', new Date().toISOString());
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request');
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('=== STARTING FUNCTION LOGIC ===');
    
    // Test if we have the required API keys
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    console.log('Anthropic API key exists:', !!anthropicApiKey);
    console.log('OpenAI API key exists:', !!openaiApiKey);
    
    if (!anthropicApiKey) {
      console.error('❌ ANTHROPIC_API_KEY not configured');
      await logFunction(supabase, null, 're-extract-field', null, null, 'ANTHROPIC_API_KEY not configured', 500, Date.now() - startTime);
      return new Response(JSON.stringify({ 
        error: 'ANTHROPIC_API_KEY not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!openaiApiKey) {
      console.error('❌ OPENAI_API_KEY not configured');
      await logFunction(supabase, null, 're-extract-field', null, null, 'OPENAI_API_KEY not configured', 500, Date.now() - startTime);
      return new Response(JSON.stringify({ 
        error: 'OPENAI_API_KEY not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body first for logging
    let requestBody;
    try {
      requestBody = await req.json();
      console.log('📝 Input received:', {
        hasImageData: !!requestBody.imageData,
        hasFileUrl: !!requestBody.fileUrl,
        hasFieldName: !!requestBody.fieldName,
        hasFieldInstructions: !!requestBody.fieldInstructions,
        fieldName: requestBody.fieldName
      });
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError);
      await logFunction(supabase, null, 're-extract-field', null, null, 'Invalid JSON in request body', 400, Date.now() - startTime);
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { imageData, fileName, fieldName, fieldInstructions, userNotes, currentValue, fileUrl } = requestBody;

    // Validate required inputs
    if (!imageData || !fieldName || !fieldInstructions) {
      const errorMsg = 'Missing required fields: imageData, fieldName, and fieldInstructions are required';
      console.error('❌', errorMsg);
      await logFunction(supabase, null, 're-extract-field', requestBody, null, errorMsg, 400, Date.now() - startTime);
      return new Response(JSON.stringify({ 
        error: errorMsg 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Re-extracting field "${fieldName}" with user notes:`, userNotes);

    // Detect if this is a PDF or image based on the imageData or fileName
    const isPdf = fileName?.toLowerCase().endsWith('.pdf') || imageData?.includes('application/pdf');
    console.log('Document type detected:', isPdf ? 'PDF' : 'Image');

    let extractedValue: string;

    if (isPdf) {
      // Use Claude API for PDFs
      console.log('Using Claude API for PDF re-extraction');
      
      const prompt = `Re-extract the "${fieldName}" field from this document using these instructions: ${fieldInstructions}. 

Current value: ${currentValue || 'None'}
User notes: ${userNotes || 'None'}

Important guidelines:
- Focus only on extracting the "${fieldName}" field
- Consider the user's feedback to correct any previous extraction errors
- If the user indicates the information is not present, respond with "Not found"
- If the user indicates a specific location or correction, prioritize that information
- Return only the extracted value as a string, not explanations or additional text
- Be precise and accurate based on what you can see in the document`;

      const model = 'claude-sonnet-4-20250514';
      console.log('Calling Claude API with model:', model);

      const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anthropicApiKey}`,
          'anthropic-version': '2024-04-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: 200,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'application/pdf',
                  data: imageData.replace(/^data:[^;]+;base64,/, '') // Remove data URL prefix if present
                }
              },
              {
                type: 'text',
                text: prompt
              }
            ]
          }]
        })
      });

      console.log('Claude API response status:', claudeResponse.status);

      if (!claudeResponse.ok) {
        const errorText = await claudeResponse.text();
        const errorMsg = `Claude API error: ${claudeResponse.status} - ${errorText}`;
        console.error('❌ Claude API error:', errorMsg);
        await logFunction(supabase, null, 're-extract-field', requestBody, null, errorMsg, 500, Date.now() - startTime);
        return new Response(JSON.stringify({ 
          error: errorMsg
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const claudeData = await claudeResponse.json();
      
      if (!claudeData.content || !claudeData.content[0]) {
        console.error('No content returned from Claude:', claudeData);
        return new Response(JSON.stringify({ 
          error: 'No content returned from Claude' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      extractedValue = claudeData.content[0].text.trim();
      
    } else {
      // Use OpenAI API for images
      console.log('Using OpenAI API for image re-extraction');
      
      const prompt = `Re-extract the "${fieldName}" field from this document using these instructions: ${fieldInstructions}. 

Current value: ${currentValue || 'None'}
User notes: ${userNotes || 'None'}

Important guidelines:
- Focus only on extracting the "${fieldName}" field
- Consider the user's feedback to correct any previous extraction errors
- If the user indicates the information is not present, respond with "Not found"
- If the user indicates a specific location or correction, prioritize that information
- Return only the extracted value as a string, not explanations or additional text
- Be precise and accurate based on what you can see in the document`;

      const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiApiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 200,
          messages: [
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
                    url: imageData
                  }
                }
              ]
            }
          ]
        })
      });

      console.log('OpenAI API response status:', openaiResponse.status);

      if (!openaiResponse.ok) {
        const errorText = await openaiResponse.text();
        const errorMsg = `OpenAI API error: ${openaiResponse.status} - ${errorText}`;
        console.error('❌ OpenAI API error:', errorMsg);
        await logFunction(supabase, null, 're-extract-field', requestBody, null, errorMsg, 500, Date.now() - startTime);
        return new Response(JSON.stringify({ 
          error: errorMsg
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const openaiData = await openaiResponse.json();
      
      if (!openaiData.choices || !openaiData.choices[0] || !openaiData.choices[0].message) {
        console.error('No content returned from OpenAI:', openaiData);
        return new Response(JSON.stringify({ 
          error: 'No content returned from OpenAI' 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      extractedValue = openaiData.choices[0].message.content.trim();
    }
    
    // Clean up markdown formatting (remove code blocks, backticks, quotes)
    let cleanedValue = extractedValue
      .replace(/^```[\s\S]*?\n/, '') // Remove opening code block
      .replace(/\n```$/, '') // Remove closing code block
      .replace(/^["']/, '') // Remove opening quote
      .replace(/["']$/, '') // Remove closing quote
      .replace(/^`+/, '') // Remove opening backticks
      .replace(/`+$/, '') // Remove closing backticks
      .trim();
    
    console.log(`Successfully re-extracted "${fieldName}":`, cleanedValue);

    const result = { 
      success: true, 
      fieldName,
      extractedValue: cleanedValue,
      userNotes,
      apiUsed: isPdf ? 'Claude' : 'OpenAI'
    };
    
    console.log('✅ Re-extraction completed successfully');
    await logFunction(supabase, null, 're-extract-field', requestBody, result, null, 200, Date.now() - startTime);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const errorMsg = error.message || 'Unknown error occurred';
    console.error('=== FUNCTION ERROR ===');
    console.error('❌ Error:', error);
    console.error('❌ Error message:', errorMsg);
    console.error('❌ Error stack:', error.stack);
    
    // Try to log the error (but don't fail if logging fails)
    try {
      await logFunction(supabase, null, 're-extract-field', null, null, errorMsg, 500, Date.now() - startTime);
    } catch (logError) {
      console.error('Failed to log error:', logError);
    }
    
    return new Response(JSON.stringify({ 
      error: `Re-extraction failed: ${errorMsg}`
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
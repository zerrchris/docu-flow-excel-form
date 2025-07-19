import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

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
    const { prompt, imageData, systemMessage = "You are a document analysis assistant.", includePositions = false } = await req.json();

    if (!prompt || !imageData) {
      return new Response(
        JSON.stringify({ error: 'Prompt and imageData are required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Analyzing document with vision API', { includePositions });

    // Enhance prompt with position information if requested
    const enhancedPrompt = includePositions 
      ? `${prompt}\n\nIMPORTANT: For each extracted field, also provide the approximate position coordinates where the text was found in the document. Return the response as JSON with this structure:
{
  "extractedData": {
    "field1": "value1",
    "field2": "value2"
  },
  "positions": {
    "field1": {"x": percentage_from_left, "y": percentage_from_top, "width": percentage_width, "height": percentage_height},
    "field2": {"x": percentage_from_left, "y": percentage_from_top, "width": percentage_width, "height": percentage_height}
  }
}

Use percentage values (0-100) for coordinates relative to the document dimensions. If you cannot determine the position for a field, omit it from the positions object.`
      : prompt;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          { role: 'system', content: systemMessage },
          { 
            role: 'user', 
            content: [
              {
                type: 'text',
                text: enhancedPrompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        temperature: 0.1,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('OpenAI API error:', error);
      return new Response(
        JSON.stringify({ error: 'Failed to analyze document', details: error }),
        { 
          status: response.status, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    const generatedText = data.choices[0].message.content;

    console.log('Document analysis completed successfully');

    return new Response(
      JSON.stringify({ generatedText, usage: data.usage }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in analyze-document function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
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
    const { prompt, imageData, systemMessage = "You are a document analysis assistant. CRITICAL: Only extract information that is clearly visible and readable in the document image. If information is not present, missing, illegible, or unclear, respond with 'N/A' or leave blank. Do not infer, guess, or hallucinate any information. Only use what you can actually see." } = await req.json();

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

    // Check if the data is a PDF (PDFs can't be processed by vision API)
    if (imageData.includes('data:application/pdf')) {
      console.error('PDF files are not supported by OpenAI vision API');
      return new Response(
        JSON.stringify({ 
          error: 'PDF files are not currently supported for analysis. Please convert your PDF to an image format (PNG, JPEG) and try again.',
          details: 'OpenAI vision API only supports image formats'
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
    
    if (!supportedFormats.includes(mimeType)) {
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
          { role: 'system', content: systemMessage },
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
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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
    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      console.error('OpenAI API key not found');
      return new Response(
        JSON.stringify({ error: 'OpenAI API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { fileUrl, fileName, fieldName, fieldInstructions, userNotes, currentValue, imageData } = await req.json();

    if ((!fileUrl && !imageData) || !fieldName || !userNotes) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: (fileUrl or imageData), fieldName, and userNotes are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Re-extracting field "${fieldName}" with user notes:`, userNotes);

    // Create a focused prompt for the specific field with user feedback
    const systemPrompt = `You are a document analysis expert specializing in extracting specific information from documents.

Your task is to re-extract the "${fieldName}" field from the document based on the user's feedback.

Field Instructions: ${fieldInstructions || `Extract the ${fieldName} field accurately`}

Current Extracted Value: ${currentValue || 'None'}

User Feedback: ${userNotes}

Important guidelines:
- Focus only on extracting the "${fieldName}" field
- Consider the user's feedback to correct any previous extraction errors
- If the user indicates the information is not present, respond with "Not found"
- If the user indicates a specific location or correction, prioritize that information
- Return only the corrected value, not explanations or additional text
- Be precise and accurate based on what you can see in the document`;

    // Call OpenAI API with vision model to re-analyze the specific field
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',  // Using vision-capable model
        messages: [
          {
            role: 'system',
            content: systemPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Please re-extract the "${fieldName}" field from this document, taking into account the user's feedback: "${userNotes}"`
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageData || fileUrl,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        temperature: 0.1  // Low temperature for consistent extraction
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      return new Response(
        JSON.stringify({ error: `OpenAI API error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('OpenAI API response:', data);

    if (!data.choices || data.choices.length === 0) {
      console.error('No choices in OpenAI response');
      return new Response(
        JSON.stringify({ error: 'No response from OpenAI' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const reExtractedValue = data.choices[0].message.content.trim();
    
    // Clean up markdown formatting (remove code blocks, backticks, quotes)
    let cleanedValue = reExtractedValue
      .replace(/^```[\s\S]*?\n/, '') // Remove opening code block
      .replace(/\n```$/, '') // Remove closing code block
      .replace(/^["']/, '') // Remove opening quote
      .replace(/["']$/, '') // Remove closing quote
      .replace(/^`+/, '') // Remove opening backticks
      .replace(/`+$/, '') // Remove closing backticks
      .trim();
    
    console.log(`Successfully re-extracted "${fieldName}":`, cleanedValue);

    return new Response(
      JSON.stringify({ 
        success: true, 
        fieldName,
        extractedValue: cleanedValue,
        userNotes
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in re-extract-field function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
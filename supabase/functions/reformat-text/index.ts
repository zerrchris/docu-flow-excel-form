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

  if (!openAIApiKey) {
    return new Response(
      JSON.stringify({ error: 'OpenAI API key not configured' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }

  try {
    const { originalText, formatInstructions, examples } = await req.json();

    if (!originalText || !formatInstructions) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: originalText and formatInstructions' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Create a prompt for reformatting the text
    const systemPrompt = `You are a text formatting assistant. Your job is to reformat existing text according to specific instructions while preserving all the original information exactly. Do not add, remove, or change any data - only reformat the structure and presentation.

Rules:
1. Keep all original numbers, names, and values exactly as they appear
2. Only change the format/structure according to the instructions
3. Do not interpret or analyze the content
4. Return only the reformatted text, no explanations
5. If line breaks are requested, use actual line breaks (\\n)
6. Preserve all punctuation and special characters unless specifically instructed otherwise`;

    let userPrompt = `Please reformat this text according to the instructions:

Original Text: "${originalText}"

Format Instructions: ${formatInstructions}`;

    if (examples) {
      userPrompt += `\n\nExamples of the desired format:\n${examples}`;
    }

    userPrompt += `\n\nReformatted text:`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1, // Low temperature for consistent formatting
        max_tokens: 500,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error('OpenAI API error:', errorData);
      return new Response(
        JSON.stringify({ error: 'Failed to process text reformatting' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    const data = await response.json();
    const reformattedText = data.choices[0].message.content.trim();

    return new Response(
      JSON.stringify({ 
        reformattedText,
        originalText,
        success: true 
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in reformat-text function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
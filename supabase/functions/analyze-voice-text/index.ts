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
    const { text, fields, columnInstructions } = await req.json();
    
    if (!text) {
      throw new Error('No text provided for analysis');
    }
    
    if (!fields || !Array.isArray(fields)) {
      throw new Error('No fields provided for extraction');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Processing voice text for fields:', fields);
    console.log('Text length:', text.length);

    // Build the extraction prompt based on the fields and instructions
    const fieldInstructions = fields.map(field => {
      const instruction = columnInstructions?.[field] || `Extract the ${field} information`;
      return `- ${field}: ${instruction}`;
    }).join('\n');

    const extractionPrompt = `You are a data extraction assistant. Extract specific information from the following spoken text and return it as a JSON object with the exact field names provided.

FIELDS TO EXTRACT:
${fieldInstructions}

SPOKEN TEXT:
"${text}"

INSTRUCTIONS:
1. Extract information for each field based on the spoken content
2. If information for a field is not available in the text, use "N/A"
3. Be as accurate and specific as possible
4. Return ONLY a valid JSON object with the field names as keys
5. Do not include any explanation or additional text

Expected JSON format:
{
${fields.map(field => `  "${field}": "extracted_value_or_N/A"`).join(',\n')}
}`;

    console.log('Sending request to OpenAI...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          {
            role: 'system',
            content: 'You are a precise data extraction assistant. Extract information from spoken text and return only valid JSON with the specified fields.'
          },
          {
            role: 'user',
            content: extractionPrompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const extractedText = data.choices[0].message.content;
    
    console.log('OpenAI response:', extractedText);

    // Parse the JSON response
    let extractedData;
    try {
      // Clean the response - remove any markdown formatting
      const cleanedText = extractedText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      extractedData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('JSON parse error:', parseError);
      console.error('Raw response:', extractedText);
      
      // Fallback: create a basic object with the original text
      extractedData = {};
      fields.forEach(field => {
        extractedData[field] = 'N/A';
      });
      extractedData['Notes'] = text; // Store original text in notes if available
    }

    // Ensure all required fields are present
    fields.forEach(field => {
      if (!(field in extractedData)) {
        extractedData[field] = 'N/A';
      }
    });

    console.log('Extracted data:', extractedData);

    return new Response(JSON.stringify({
      success: true,
      extractedData,
      originalText: text
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in voice analysis function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      extractedData: null
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
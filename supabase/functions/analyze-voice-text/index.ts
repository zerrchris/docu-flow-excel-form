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

    const extractionPrompt = `You are a specialized data extraction assistant for processing SPOKEN voice input. You excel at understanding natural speech patterns and extracting structured data from conversational descriptions.

IMPORTANT: This is SPOKEN TEXT, so expect:
- Natural speech patterns with "um", "uh", filler words
- Information may be stated in any order
- Numbers might be spelled out (e.g., "twenty twelve" = "2012")
- Dates in conversational format (e.g., "June third twenty twelve" = "06/03/2012")
- Legal descriptions with directional terms (e.g., "northwest quarter", "section three")

FIELDS TO EXTRACT:
${fieldInstructions}

SPOKEN TEXT:
"${text}"

CRITICAL INSTRUCTIONS:
1. Listen carefully for ANY mention of the target information, even if buried in conversational speech
2. Convert spoken numbers/dates to proper format (e.g., "twenty twelve" → "2012", "June third" → "06/03")
3. Extract partial information even if incomplete (e.g., if they say "section 3" put that in Legal Description)
4. Look for legal terms: deed, warranty deed, quit claim, easement, etc. for document types
5. Names mentioned are likely Grantor/Grantee even if not explicitly stated as such
6. If someone mentions recording information, book/page numbers, or instrument numbers, capture them
7. Any property descriptions, lot numbers, section references go in Legal Description
8. Conversational notes or observations go in Notes field
9. Only use "N/A" if the information is truly not mentioned anywhere in the speech
10. Return ONLY valid JSON - no explanations

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
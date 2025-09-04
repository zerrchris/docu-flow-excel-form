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
    return new Response(JSON.stringify({ error: 'OpenAI API key not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { columns, mode = 'single', columnName } = await req.json();

    if (!columns || !Array.isArray(columns)) {
      return new Response(JSON.stringify({ error: 'Columns array is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let prompt = '';
    
    if (mode === 'single' && columnName) {
      prompt = `Generate detailed extraction instructions for the column "${columnName}" in a document processing system. 

The instruction should help AI extract accurate information from legal documents, real estate documents, financial records, and other business documents.

Requirements:
- Be very specific about what to look for
- Include examples of formats or patterns when applicable
- Mention common label variations the field might have
- Specify the expected output format
- Be 2-3 sentences maximum
- Focus on accuracy and precision

Return only the instruction text, no additional formatting or explanation.`;
    } else {
      prompt = `Generate comprehensive extraction instructions for these columns in a document processing system: ${columns.join(', ')}

The instructions should help AI extract accurate information from legal documents, real estate documents, financial records, and other business documents.

For each column, provide:
- Very specific guidance on what to look for
- Examples of formats or patterns when applicable
- Common label variations the field might have
- Expected output format
- 2-3 sentences maximum per instruction
- Focus on accuracy and precision

Return the response as a JSON object where keys are the column names and values are the instruction text. Example format:
{
  "Column Name": "Detailed instruction text here...",
  "Another Column": "Another instruction..."
}`;
    }

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
            content: 'You are an expert in document processing and data extraction. You create precise, actionable instructions for AI systems to extract specific information from documents.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.7,
        max_completion_tokens: mode === 'single' ? 300 : 2000,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      return new Response(JSON.stringify({ error: 'Failed to generate suggestions' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const data = await response.json();
    const content = data.choices[0].message.content;

    let result;
    if (mode === 'single') {
      result = { [columnName]: content.trim() };
    } else {
      try {
        // Try to parse as JSON first
        result = JSON.parse(content);
      } catch (e) {
        // If JSON parsing fails, return raw content
        console.error('Failed to parse JSON response:', e);
        return new Response(JSON.stringify({ error: 'Invalid response format from AI' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    return new Response(JSON.stringify({ suggestions: result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in suggest-column-instructions function:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
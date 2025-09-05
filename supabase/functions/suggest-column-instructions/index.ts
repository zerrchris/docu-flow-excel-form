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
      prompt = `As an expert in landman work, oil & gas title examination, real estate transactions, and mineral rights documentation, generate detailed extraction instructions for the column "${columnName}".

Context: This is for processing legal documents including:
- Oil and gas leases (primary and secondary terms, royalty rates, bonus payments, drilling obligations)
- Mineral deeds and reservations (surface vs mineral rights, fractional interests)
- Real estate deeds (warranty, quitclaim, special warranty)
- Easements and right-of-way agreements
- Court records and probate documents
- Assignment and conveyance records
- Lease amendments and modifications
- Division orders and ownership records

The instruction should help AI extract accurate information with focus on:
- Legal precision and exact terminology
- Understanding of oil & gas industry standards
- Proper handling of fractional interests and legal descriptions
- Recognition of key lease clauses and provisions
- Awareness of common document formats in title work

Requirements:
- Be very specific about what to look for in oil & gas and real estate documents
- Include examples of formats or patterns specific to landman work
- Mention industry-specific label variations
- Specify expected output format for legal accuracy
- Be 2-3 sentences maximum focused on landman/title examination needs

Return only the instruction text, no additional formatting.`;
    } else {
      prompt = `As an expert in landman work, oil & gas title examination, real estate transactions, and mineral rights documentation, generate comprehensive extraction instructions for these columns: ${columns.join(', ')}

Context: This is for processing legal documents in oil & gas title work including:
- Oil and gas leases (primary/secondary terms, royalty rates, bonus payments, drilling obligations, Pugh clauses)
- Mineral deeds and reservations (surface vs mineral rights, fractional interests, depth limitations)
- Real estate deeds (warranty, quitclaim, special warranty deeds)
- Easements, right-of-way, and surface use agreements
- Court records, probate documents, and heirship determinations
- Assignment and conveyance records with effective dates
- Lease amendments, ratifications, and modifications
- Division orders and ownership records
- Pooling and unitization agreements

For each column, provide landman-focused instructions covering:
- Legal precision with oil & gas industry terminology
- Understanding of lease clauses and mineral rights concepts
- Proper handling of fractional interests and legal descriptions
- Recognition of key provisions in oil & gas agreements
- Awareness of title examination standards and practices

Requirements per instruction:
- Very specific guidance for oil & gas and real estate documents
- Examples of formats specific to landman work
- Industry-specific label variations and terminology
- Expected output format for legal accuracy
- 2-3 sentences maximum per instruction
- Focus on title examination and landman workflow needs

Return as JSON object with column names as keys and specialized landman instructions as values.`;
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
            content: 'You are an expert landman and oil & gas title examiner with deep knowledge of mineral rights, real estate law, and oil & gas lease provisions. You specialize in creating precise extraction instructions for legal document processing systems used in title examination and landman work.'
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
        let jsonContent = content.trim();
        
        // Handle JSON wrapped in markdown code blocks
        const jsonMatch = jsonContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
        if (jsonMatch) {
          jsonContent = jsonMatch[1].trim();
        }
        
        result = JSON.parse(jsonContent);
      } catch (e) {
        // If JSON parsing fails, try to extract JSON from the content
        console.error('Failed to parse JSON response:', e);
        console.error('Raw content:', content);
        
        // Try to find JSON object in the text
        const jsonObjectMatch = content.match(/\{[\s\S]*\}/);
        if (jsonObjectMatch) {
          try {
            result = JSON.parse(jsonObjectMatch[0]);
          } catch (e2) {
            console.error('Failed to parse extracted JSON:', e2);
            return new Response(JSON.stringify({ error: 'Invalid response format from AI' }), {
              status: 500,
              headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
          }
        } else {
          return new Response(JSON.stringify({ error: 'Invalid response format from AI' }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
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
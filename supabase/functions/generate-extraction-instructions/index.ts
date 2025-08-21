import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { 
      columns, 
      documentType, 
      industryContext, 
      existingData,
      userId 
    } = await req.json();

    console.log('Generating extraction instructions for columns:', columns);
    console.log('Document type:', documentType);
    console.log('Industry context:', industryContext);

    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user's existing preferences for context
    const { data: existingPreferences } = await supabase
      .from('user_extraction_preferences')
      .select('column_instructions')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(3);

    // Build context for AI
    let contextPrompt = `Generate specific, actionable extraction instructions for document processing. 

COLUMNS TO GENERATE INSTRUCTIONS FOR:
${columns.map(col => `- ${col}`).join('\n')}`;

    if (documentType) {
      contextPrompt += `\n\nDOCUMENT TYPE: ${documentType}`;
    }

    if (industryContext) {
      contextPrompt += `\n\nINDUSTRY/USE CASE: ${industryContext}`;
    }

    if (existingData && existingData.length > 0) {
      contextPrompt += `\n\nEXAMPLE DATA FOR CONTEXT:
${JSON.stringify(existingData.slice(0, 3), null, 2)}`;
    }

    if (existingPreferences && existingPreferences.length > 0) {
      contextPrompt += `\n\nUSER'S PREVIOUS INSTRUCTION PATTERNS:
${existingPreferences.map(pref => JSON.stringify(pref.column_instructions, null, 2)).join('\n\n')}`;
    }

    const systemPrompt = `You are an expert at creating precise document extraction instructions. Generate specific, actionable instructions for each column that will help AI accurately extract the right information from documents.

REQUIREMENTS:
1. Each instruction should be specific and unambiguous
2. Include format requirements (dates, numbers, text)
3. Specify what to do if information is missing or unclear
4. Consider the document type and industry context
5. Make instructions that work well with AI vision models
6. Be concise but comprehensive

RESPONSE FORMAT:
Return a JSON object where each key is a column name and each value is the extraction instruction string.

EXAMPLE FORMAT:
{
  "Invoice Number": "Extract the unique invoice identification number, typically found in the header. Look for labels like 'Invoice #', 'Invoice No.', or 'Inv#'. Return only the alphanumeric identifier.",
  "Amount": "Extract the total amount due in decimal format (e.g., 1234.56). Look for 'Total', 'Amount Due', or 'Balance'. Include currency if specified, otherwise assume USD."
}`;

    // Call OpenAI API
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4.1-2025-04-14',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: contextPrompt }
        ],
        max_tokens: 2000,
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      console.error('OpenAI API error:', errorData);
      throw new Error(`OpenAI API error: ${response.status} ${errorData}`);
    }

    const data = await response.json();
    const generatedInstructions = data.choices[0].message.content;

    console.log('Generated instructions:', generatedInstructions);

    // Parse the JSON response
    let instructions;
    try {
      instructions = JSON.parse(generatedInstructions);
    } catch (parseError) {
      console.error('Failed to parse AI response as JSON:', parseError);
      // Fallback: try to extract JSON from the response
      const jsonMatch = generatedInstructions.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        instructions = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Could not parse AI response as valid JSON');
      }
    }

    // Validate that we have instructions for all requested columns
    const missingColumns = columns.filter(col => !instructions[col]);
    if (missingColumns.length > 0) {
      console.log('Missing instructions for columns:', missingColumns);
      // Generate fallback instructions for missing columns
      for (const col of missingColumns) {
        instructions[col] = `Extract the ${col.toLowerCase()} from the document. Look for relevant text, numbers, or dates that correspond to this field. Return the exact value found, or leave empty if not present.`;
      }
    }

    // Store the generated instructions in user preferences
    const preferenceName = documentType ? 
      `AI-Generated for ${documentType}` : 
      `AI-Generated ${new Date().toLocaleDateString()}`;

    const { error: insertError } = await supabase
      .from('user_extraction_preferences')
      .insert({
        user_id: userId,
        name: preferenceName,
        columns: columns,
        column_instructions: instructions,
        is_default: false
      });

    if (insertError) {
      console.error('Error saving preferences:', insertError);
      // Don't fail the request if we can't save preferences
    }

    return new Response(
      JSON.stringify({ 
        instructions,
        preferenceName,
        saved: !insertError
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error generating extraction instructions:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Failed to generate extraction instructions',
        details: error.message 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
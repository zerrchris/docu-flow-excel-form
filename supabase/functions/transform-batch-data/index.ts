import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // Authenticate user
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseService.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { 
      columnName, 
      transformInstruction, 
      sampleData, 
      allData 
    } = await req.json();

    console.log('🔄 Starting batch data transformation');
    console.log('📊 Column:', columnName);
    console.log('📝 Instruction:', transformInstruction);
    console.log('📋 Sample data length:', sampleData?.length);
    console.log('📋 All data length:', allData?.length);

    if (!columnName || !transformInstruction || !allData || allData.length === 0) {
      throw new Error('Missing required parameters: columnName, transformInstruction, and allData are required');
    }

    // Create examples from sample data for better AI understanding
    const examples = sampleData && sampleData.length > 0 
      ? sampleData.slice(0, 3).map((item: string) => `"${item}"`).join(', ')
      : allData.slice(0, 3).map((item: string) => `"${item}"`).join(', ');

    const prompt = `You are a data transformation specialist. Transform the provided data according to the user's instructions.

COLUMN: ${columnName}
TRANSFORMATION INSTRUCTION: ${transformInstruction}

EXAMPLES OF CURRENT DATA: ${examples}

IMPORTANT RULES:
1. Transform each value according to the instruction
2. Maintain the exact same number of items in the same order
3. If a value cannot be transformed or is invalid, return it unchanged
4. Return ONLY a JSON array of the transformed values
5. Do not include any explanations or additional text
6. Handle edge cases gracefully (empty values, null, etc.)

DATA TO TRANSFORM:
${JSON.stringify(allData)}

Return the transformed data as a JSON array:`;

    console.log('🤖 Calling OpenAI for data transformation...');

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-5-mini-2025-08-07',
        messages: [
          {
            role: 'system',
            content: 'You are a precise data transformation specialist. Always return valid JSON arrays with the exact same number of items as the input.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_completion_tokens: 4000,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('🚨 OpenAI API error:', response.status, errorText);
      throw new Error(`OpenAI API error: ${response.status} ${errorText}`);
    }

    const aiResponse = await response.json();
    console.log('✅ OpenAI response received');

    if (!aiResponse.choices || !aiResponse.choices[0] || !aiResponse.choices[0].message) {
      throw new Error('Invalid response from OpenAI');
    }

    const transformedDataText = aiResponse.choices[0].message.content.trim();
    console.log('📄 Raw AI response:', transformedDataText.substring(0, 200) + '...');

    // Parse the JSON response
    let transformedData;
    try {
      // Clean up the response - remove any markdown formatting
      const cleanedResponse = transformedDataText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      
      transformedData = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error('🚨 Failed to parse AI response as JSON:', parseError);
      console.error('🚨 Raw response:', transformedDataText);
      throw new Error('AI returned invalid JSON format');
    }

    // Validate the response
    if (!Array.isArray(transformedData)) {
      throw new Error('AI response is not an array');
    }

    if (transformedData.length !== allData.length) {
      console.warn(`⚠️ Length mismatch: expected ${allData.length}, got ${transformedData.length}`);
      // Pad or trim to match original length
      while (transformedData.length < allData.length) {
        transformedData.push(allData[transformedData.length]);
      }
      transformedData = transformedData.slice(0, allData.length);
    }

    console.log('✅ Data transformation completed successfully');
    console.log('📊 Transformed', transformedData.length, 'items');

    return new Response(JSON.stringify({
      success: true,
      transformedData,
      originalCount: allData.length,
      transformedCount: transformedData.length
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('❌ Error in transform-batch-data function:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';
import { trackAIUsage, extractTokensFromResponse } from '../_shared/ai-usage-tracker.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstrumentBoundary {
  instrumentType: string;
  instrumentName: string;
  pageStart: number;
  pageEnd: number;
  confidence: number;
  keyIdentifiers: string[];
  extractedData: Record<string, any>;
}

interface MultiInstrumentAnalysis {
  success: boolean;
  instrumentsDetected: number;
  instruments: InstrumentBoundary[];
  processingNotes: string[];
  totalPages: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY')!;
  
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Invalid authentication token');
    }

    const requestBody = await req.json();
    const { 
      documentData, 
      fileName, 
      runsheetId, 
      availableColumns = [],
      columnInstructions = {},
      documentId 
    } = requestBody;

    console.log('📄 Starting multi-instrument analysis for:', fileName);

    // Comprehensive prompt for multi-instrument detection
    const analysisPrompt = `You are an expert document analyst specializing in detecting multiple legal instruments within a single PDF document. Your task is to analyze this document and identify all separate instruments it contains.

ANALYSIS REQUIREMENTS:

1. INSTRUMENT DETECTION:
   - Identify each distinct legal instrument (contracts, leases, agreements, amendments, exhibits, etc.)
   - Determine page boundaries for each instrument
   - Classify the type of each instrument
   - Assign confidence scores (0-100) for each detection

2. BOUNDARY DETECTION CRITERIA:
   - Look for instrument headers, titles, or signature pages
   - Identify page breaks between different instruments
   - Notice changes in formatting, letterhead, or document structure
   - Detect "Exhibit A", "Attachment B", or similar separators
   - Find signature pages that indicate end of one instrument

3. INSTRUMENT CLASSIFICATION:
   - Contract types: Purchase Agreement, Service Contract, Employment Agreement
   - Real Estate: Lease Agreement, Purchase Agreement, Easement
   - Corporate: Articles of Incorporation, Bylaws, Operating Agreement
   - Financial: Loan Agreement, Promissory Note, Security Agreement
   - Legal: Power of Attorney, Will, Trust Agreement
   - Other: Amendment, Addendum, Exhibit, Schedule

4. DATA EXTRACTION:
   For each instrument, extract these standard fields:
   ${availableColumns.map(col => `   - ${col}: ${columnInstructions[col] || 'Extract relevant information'}`).join('\n')}

5. CONFIDENCE SCORING:
   - 90-100: Clear instrument boundaries with distinct headers/signatures
   - 70-89: Probable boundaries based on formatting changes
   - 50-69: Possible boundaries requiring human review
   - Below 50: Uncertain, recommend manual review

RESPONSE FORMAT:
Return a JSON object with this exact structure:

{
  "success": true,
  "instrumentsDetected": <number>,
  "totalPages": <number>,
  "instruments": [
    {
      "instrumentType": "<type classification>",
      "instrumentName": "<descriptive name>",
      "pageStart": <first page number>,
      "pageEnd": <last page number>,
      "confidence": <0-100>,
      "keyIdentifiers": ["<text that helped identify this instrument>"],
      "extractedData": {
        ${availableColumns.map(col => `"${col}": "<extracted value or null>"`).join(',\n        ')}
      }
    }
  ],
  "processingNotes": [
    "<note about detection process>",
    "<any ambiguities or concerns>"
  ]
}

IMPORTANT RULES:
- If only one instrument is detected, still follow the multi-instrument format
- Page numbers start at 1
- Ensure no page gaps (if page 5 ends instrument 1, page 6 should start instrument 2)
- If uncertain about boundaries, err on the side of caution and note in processingNotes
- Extract as much data as possible for each instrument
- If an instrument spans only 1 page, pageStart and pageEnd should be the same`;

    // Call OpenAI with comprehensive analysis
    const openAIResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o', // Use most capable model for complex analysis
        messages: [
          {
            role: 'system',
            content: analysisPrompt
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze this document for multiple instruments. Document name: ${fileName}`
              },
              {
                type: 'image_url',
                image_url: {
                  url: documentData,
                  detail: 'high'
                }
              }
            ]
          }
        ],
        max_tokens: 4000,
        temperature: 0.1, // Low temperature for consistent analysis
      }),
    });

    if (!openAIResponse.ok) {
      const errorText = await openAIResponse.text();
      console.error('OpenAI API error:', openAIResponse.status, errorText);
      throw new Error(`OpenAI API error: ${openAIResponse.status}`);
    }

    const openAIData = await openAIResponse.json();
    const analysisText = openAIData.choices[0].message.content;
    
    // Track AI usage
    const tokenData = extractTokensFromResponse(openAIData);
    await trackAIUsage(supabaseUrl, supabaseServiceKey, {
      user_id: user.id,
      function_name: 'analyze-multi-instrument-document',
      model_used: 'gpt-4o',
      input_tokens: tokenData.input_tokens,
      output_tokens: tokenData.output_tokens,
      total_tokens: tokenData.total_tokens,
      request_payload: { fileName, hasDocumentData: !!documentData },
      response_payload: { analysisLength: analysisText?.length || 0 },
      success: true
    });

    console.log('🤖 Raw OpenAI response:', analysisText);

    // Parse the JSON response
    let analysisResult: MultiInstrumentAnalysis;
    try {
      // Clean the response text to extract JSON
      const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No valid JSON found in response');
      }
      
      analysisResult = JSON.parse(jsonMatch[0]);
      
      // Validate the response structure
      if (!analysisResult.success || !Array.isArray(analysisResult.instruments)) {
        throw new Error('Invalid response structure from AI analysis');
      }

    } catch (parseError) {
      console.error('Error parsing OpenAI response:', parseError);
      console.error('Raw response was:', analysisText);
      
      // Fallback: treat as single instrument
      analysisResult = {
        success: true,
        instrumentsDetected: 1,
        totalPages: 1,
        instruments: [{
          instrumentType: 'Unknown Document',
          instrumentName: fileName,
          pageStart: 1,
          pageEnd: 1,
          confidence: 50,
          keyIdentifiers: ['Fallback single instrument detection'],
          extractedData: availableColumns.reduce((acc, col) => ({ ...acc, [col]: null }), {})
        }],
        processingNotes: [
          'AI analysis parsing failed, treating as single instrument',
          `Parse error: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`
        ]
      };
    }

    // Store analysis results
    const { data: analysisRecord, error: insertError } = await supabase
      .from('multi_instrument_analysis')
      .insert({
        user_id: user.id,
        original_document_id: documentId,
        runsheet_id: runsheetId,
        instruments_detected: analysisResult.instrumentsDetected,
        analysis_status: 'completed',
        analysis_data: analysisResult,
        processing_notes: analysisResult.processingNotes?.join('\n') || 'Analysis completed successfully'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error storing analysis results:', insertError);
      // Don't fail the request, just log the error
    }

    console.log('✅ Multi-instrument analysis completed:', {
      instrumentsDetected: analysisResult.instrumentsDetected,
      fileName,
      analysisId: analysisRecord?.id
    });

    return new Response(JSON.stringify({
      success: true,
      analysis: analysisResult,
      analysisId: analysisRecord?.id
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in multi-instrument analysis:', error);
    
    // Track failed usage
    try {
      const authHeader = req.headers.get('Authorization');
      if (authHeader) {
        const token = authHeader.replace('Bearer ', '');
        const { data: { user } } = await supabase.auth.getUser(token);
        
        if (user) {
          await trackAIUsage(supabaseUrl, supabaseServiceKey, {
            user_id: user.id,
            function_name: 'analyze-multi-instrument-document',
            model_used: 'gpt-4o',
            success: false,
            error_message: error instanceof Error ? error.message : 'Unknown error'
          });
        }
      }
    } catch (trackingError) {
      console.error('Error tracking failed AI usage:', trackingError);
    }

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Multi-instrument analysis failed'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
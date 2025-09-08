import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Usage tracking function
const trackAIUsage = async (supabase: any, userId: string, model: string, inputTokens: number, outputTokens: number, totalTokens: number, cost: number, provider: string) => {
  try {
    const { error } = await supabase
      .from('ai_usage_logs')
      .insert({
        user_id: userId,
        model: model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost: cost,
        provider: provider,
        timestamp: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to track AI usage:', error);
    } else {
      console.log('AI usage tracked successfully:', { model, totalTokens, cost });
    }
  } catch (error) {
    console.error('Error tracking AI usage:', error);
  }
};

// Calculate Claude cost based on model and token usage
const calculateClaudeCost = (model: string, inputTokens: number, outputTokens: number): number => {
  // Claude Sonnet 4 pricing (as of 2024)
  const pricing = {
    'claude-sonnet-4-20250514': {
      input: 0.000003,  // $3 per 1M input tokens
      output: 0.000015  // $15 per 1M output tokens
    },
    'claude-opus-4-20250514': {
      input: 0.000015,  // $15 per 1M input tokens  
      output: 0.000075  // $75 per 1M output tokens
    },
    'claude-3-5-haiku-20241022': {
      input: 0.00000025, // $0.25 per 1M input tokens
      output: 0.00000125 // $1.25 per 1M output tokens
    }
  };

  const modelPricing = pricing[model] || pricing['claude-sonnet-4-20250514'];
  return (inputTokens * modelPricing.input) + (outputTokens * modelPricing.output);
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    // Get user from auth token
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      throw new Error('No authorization header provided')
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      throw new Error('Invalid authentication token')
    }

    const { prompt, fileUrl, fileName, contentType } = await req.json()

    if (!prompt || !fileUrl) {
      throw new Error('Missing required parameters: prompt and fileUrl')
    }

    console.log('Analyzing document with Claude:', { fileName, contentType, userId: user.id })

    // Fetch the document
    console.log('Fetching document from URL:', fileUrl)
    const docResponse = await fetch(fileUrl)
    console.log('Document fetch response:', { status: docResponse.status, ok: docResponse.ok })
    if (!docResponse.ok) {
      console.error('Failed to fetch document:', { status: docResponse.status, statusText: docResponse.statusText })
      throw new Error(`Failed to fetch document: ${docResponse.status} ${docResponse.statusText}`)
    }

    const documentBytes = await docResponse.arrayBuffer()
    const base64Document = btoa(String.fromCharCode(...new Uint8Array(documentBytes)))

    // Determine media type for Claude
    let mediaType = contentType
    if (!mediaType) {
      if (fileName?.toLowerCase().endsWith('.pdf')) {
        mediaType = 'application/pdf'
      } else if (fileName?.toLowerCase().match(/\.(jpg|jpeg)$/)) {
        mediaType = 'image/jpeg'
      } else if (fileName?.toLowerCase().endsWith('.png')) {
        mediaType = 'image/png'
      } else {
        mediaType = 'application/pdf' // Default to PDF
      }
    }

    console.log('Using media type:', mediaType)

    const model = 'claude-3-5-haiku-20241022' // Use faster model for better reliability

    // Call Claude API with the document
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anthropicApiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType, // Use the actual media type (supports application/pdf)
                data: base64Document
              }
            },
            {
              type: 'text',
              text: prompt
            }
          ]
        }]
      })
    })

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error response:', {
        status: claudeResponse.status,
        statusText: claudeResponse.statusText,
        headers: Object.fromEntries(claudeResponse.headers.entries()),
        body: errorText
      })
      throw new Error(`Claude API error: ${claudeResponse.status} ${claudeResponse.statusText} - ${errorText}`)
    }

    const claudeData = await claudeResponse.json()
    console.log('Claude response received')

    if (!claudeData.content || !claudeData.content[0] || !claudeData.content[0].text) {
      throw new Error('No content returned from Claude')
    }

    const generatedText = claudeData.content[0].text
    const usage = claudeData.usage || {}
    
    // Extract token usage
    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    const totalTokens = inputTokens + outputTokens
    
    // Calculate cost
    const cost = calculateClaudeCost(model, inputTokens, outputTokens)
    
    console.log('Usage tracking:', { inputTokens, outputTokens, totalTokens, cost })

    // Track usage in background
    trackAIUsage(supabase, user.id, model, inputTokens, outputTokens, totalTokens, cost, 'anthropic')

    return new Response(JSON.stringify({ 
      generatedText,
      usage: {
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: totalTokens,
        cost: cost,
        model: model,
        provider: 'anthropic'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('Error in analyze-document-claude:', error)
    return new Response(JSON.stringify({ 
      error: error.message || 'Document analysis failed' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
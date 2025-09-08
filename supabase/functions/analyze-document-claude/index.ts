import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log('=== CLAUDE FUNCTION STARTED ===')
  console.log('Method:', req.method)
  
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('CORS preflight request')
    return new Response(null, { headers: corsHeaders })
  }

  // Initialize Supabase client
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  try {
    console.log('=== STARTING FUNCTION LOGIC ===')
    
    // Test if we have the API key
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    console.log('Anthropic API key exists:', !!anthropicApiKey)
    
    if (!anthropicApiKey) {
      console.error('ANTHROPIC_API_KEY not configured')
      return new Response(JSON.stringify({ 
        error: 'ANTHROPIC_API_KEY not configured' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Get user from auth token
    const authHeader = req.headers.get('Authorization')
    console.log('Auth header exists:', !!authHeader)
    
    if (!authHeader) {
      console.error('No authorization header')
      return new Response(JSON.stringify({ 
        error: 'No authorization header provided' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const token = authHeader.replace('Bearer ', '')
    console.log('Attempting user authentication...')
    
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    console.log('Auth result:', { userId: user?.id, error: authError?.message })
    
    if (authError || !user) {
      console.error('Authentication failed:', authError)
      return new Response(JSON.stringify({ 
        error: 'Invalid authentication token' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('User authenticated successfully:', user.id)

    // Parse request body
    let requestBody
    try {
      requestBody = await req.json()
      console.log('Request body parsed:', Object.keys(requestBody))
    } catch (parseError) {
      console.error('Failed to parse request body:', parseError)
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { prompt, fileUrl, fileName, contentType } = requestBody

    if (!prompt || !fileUrl) {
      console.error('Missing required parameters:', { hasPrompt: !!prompt, hasFileUrl: !!fileUrl })
      return new Response(JSON.stringify({ 
        error: 'Missing required parameters: prompt and fileUrl' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('All validation passed, starting document analysis')
    console.log('Analyzing document with Claude:', { fileName, contentType, userId: user.id })

    // Fetch the document
    console.log('Fetching document from URL:', fileUrl)
    const docResponse = await fetch(fileUrl)
    console.log('Document fetch response:', { status: docResponse.status, ok: docResponse.ok })
    
    if (!docResponse.ok) {
      console.error('Failed to fetch document:', { status: docResponse.status, statusText: docResponse.statusText })
      return new Response(JSON.stringify({ 
        error: `Failed to fetch document: ${docResponse.status} ${docResponse.statusText}` 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const documentBytes = await docResponse.arrayBuffer()
    console.log('Document size:', documentBytes.byteLength, 'bytes')
    
    // Convert to base64 safely
    const uint8Array = new Uint8Array(documentBytes)
    let base64Document = ''
    
    try {
      // Use a simple and reliable base64 conversion
      const binaryString = Array.from(uint8Array, byte => String.fromCharCode(byte)).join('')
      base64Document = btoa(binaryString)
      console.log('Base64 conversion completed, length:', base64Document.length)
    } catch (conversionError) {
      console.error('Base64 conversion error:', conversionError)
      return new Response(JSON.stringify({ 
        error: `Failed to convert document to base64: ${conversionError.message}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Determine media type for Claude
    let mediaType = contentType || 'application/pdf'
    console.log('Using media type:', mediaType)

    const model = 'claude-3-5-haiku-20241022'
    console.log('Calling Claude API with model:', model)

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
                media_type: mediaType,
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

    console.log('Claude API response status:', claudeResponse.status)

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error response:', {
        status: claudeResponse.status,
        statusText: claudeResponse.statusText,
        body: errorText
      })
      return new Response(JSON.stringify({ 
        error: `Claude API error: ${claudeResponse.status} - ${errorText}` 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeResponse.json()
    console.log('Claude response received successfully')

    if (!claudeData.content || !claudeData.content[0] || !claudeData.content[0].text) {
      console.error('No content returned from Claude:', claudeData)
      return new Response(JSON.stringify({ 
        error: 'No content returned from Claude' 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const generatedText = claudeData.content[0].text
    const usage = claudeData.usage || {}
    
    // Extract token usage
    const inputTokens = usage.input_tokens || 0
    const outputTokens = usage.output_tokens || 0
    const totalTokens = inputTokens + outputTokens
    
    // Calculate cost (Claude Haiku pricing)
    const cost = (inputTokens * 0.00000025) + (outputTokens * 0.00000125)
    
    console.log('Usage tracking:', { inputTokens, outputTokens, totalTokens, cost })

    // Track usage in background (don't await to avoid blocking the response)
    trackAIUsage(supabase, user.id, model, inputTokens, outputTokens, totalTokens, cost, 'anthropic')
      .catch(error => console.error('Failed to track usage:', error))

    console.log('Analysis completed successfully')
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
    console.error('=== FUNCTION ERROR ===')
    console.error('Error:', error)
    console.error('Error message:', error.message)
    console.error('Error stack:', error.stack)
    
    return new Response(JSON.stringify({ 
      error: error.message || 'Unknown error occurred',
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
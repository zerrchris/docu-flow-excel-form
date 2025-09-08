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

    console.log('All validation passed, returning test response')

    // For now, return a test response to see if we get this far
    return new Response(JSON.stringify({ 
      generatedText: '{"test": "This is a test response to verify the function is working"}',
      message: 'Function is working - this is a test response',
      usage: {
        input_tokens: 100,
        output_tokens: 50,
        total_tokens: 150,
        cost: 0.001,
        model: 'test-model',
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
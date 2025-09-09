import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Helper function to log function calls
async function logFunction(supabase: any, userId: string | null, functionName: string, input: any, output: any, errorMessage: string | null, statusCode: number, executionTimeMs: number) {
  try {
    await supabase
      .from('function_logs')
      .insert({
        user_id: userId,
        function_name: functionName,
        input: input,
        output: output,
        error_message: errorMessage,
        status_code: statusCode,
        execution_time_ms: executionTimeMs
      });
  } catch (logError) {
    console.error('Failed to log function call:', logError);
  }
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  const startTime = Date.now()
  console.log('=== CLAUDE FUNCTION STARTED ===')
  console.log('Method:', req.method)
  console.log('Timestamp:', new Date().toISOString())
  
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
    
    // Parse request body first for logging
    let requestBody
    try {
      requestBody = await req.json()
      console.log('📝 Input received:', {
        hasFileUrl: !!requestBody.fileUrl,
        hasPrompt: !!requestBody.prompt,
        fileName: requestBody.fileName,
        contentType: requestBody.contentType,
        fileUrlLength: requestBody.fileUrl?.length || 0
      })
    } catch (parseError) {
      console.error('❌ Failed to parse request body:', parseError)
      await logFunction(supabase, null, 'analyze-document-claude', requestBody, null, 'Invalid JSON in request body', 400, Date.now() - startTime)
      return new Response(JSON.stringify({ 
        error: 'Invalid JSON in request body' 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    
    if (!anthropicApiKey) {
      console.error('❌ ANTHROPIC_API_KEY not configured')
      await logFunction(supabase, null, 'analyze-document-claude', requestBody, null, 'ANTHROPIC_API_KEY not configured', 500, Date.now() - startTime)
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
      console.error('❌ Authentication failed:', authError)
      await logFunction(supabase, null, 'analyze-document-claude', requestBody, null, `Authentication failed: ${authError?.message || 'No user'}`, 401, Date.now() - startTime)
      return new Response(JSON.stringify({ 
        error: 'Invalid authentication token' 
      }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('✅ User authenticated successfully:', user.id)

    const { prompt, fileUrl, fileName, contentType } = requestBody

    // Validate required inputs
    if (!prompt || !fileUrl) {
      const errorMsg = 'Missing required parameters: prompt and fileUrl'
      console.error('❌', errorMsg)
      await logFunction(supabase, user.id, 'analyze-document-claude', requestBody, null, errorMsg, 400, Date.now() - startTime)
      return new Response(JSON.stringify({ 
        error: errorMsg
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    console.log('All validation passed, starting document analysis')
    console.log('Analyzing document with Claude:', { fileName, contentType, userId: user.id })

    // Extract file path from URL for storage download
    let filePath = fileUrl
    
    // Handle different URL formats
    if (fileUrl.includes('/storage/v1/object/sign/documents/')) {
      // Extract the file path from signed URL
      const urlParts = fileUrl.split('/storage/v1/object/sign/documents/')[1]
      if (urlParts) {
        filePath = urlParts.split('?')[0] // Remove query parameters
      }
    } else if (fileUrl.includes('/documents/')) {
      // Direct storage path
      filePath = fileUrl.split('/documents/')[1]
    }
    
    console.log('📥 Downloading document from storage:', filePath)
    
    // Use Supabase storage to download the file directly
    const { data: fileData, error: storageError } = await supabase.storage
      .from('documents')
      .download(filePath)
    
    if (storageError || !fileData) {
      const errorMsg = `Storage error: ${storageError?.message || 'File not found'}`
      console.error('❌', errorMsg)
      await logFunction(supabase, user.id, 'analyze-document-claude', requestBody, null, errorMsg, 404, Date.now() - startTime)
      return new Response(JSON.stringify({ 
        error: errorMsg
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const documentBytes = await fileData.arrayBuffer()
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

    // Use the latest Claude model
    const model = 'claude-3-5-sonnet-20241022'
    console.log('Calling Claude API with model:', model)

    // Call Claude API with the document using fetch
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
      const errorMsg = `Claude API error: ${claudeResponse.status} - ${errorText}`
      console.error('❌ Claude API error:', errorMsg)
      await logFunction(supabase, user.id, 'analyze-document-claude', requestBody, null, errorMsg, 500, Date.now() - startTime)
      return new Response(JSON.stringify({ 
        error: errorMsg
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const claudeData = await claudeResponse.json()
    console.log('Claude response received successfully')

    if (!claudeData.content || !claudeData.content[0]) {
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
    
    // Calculate cost (Claude 3.5 Sonnet pricing)
    const cost = (inputTokens * 0.000003) + (outputTokens * 0.000015)
    
      console.log('Usage tracking:', { inputTokens, outputTokens, totalTokens, cost })

      // Track usage in background
      try {
        await supabase
          .from('ai_usage_logs')
          .insert({
            user_id: user.id,
            model: model,
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            total_tokens: totalTokens,
            cost: cost,
            provider: 'anthropic',
            timestamp: new Date().toISOString()
          });
        console.log('AI usage tracked successfully');
      } catch (usageError) {
        console.error('Failed to track AI usage:', usageError);
      }

      const result = { 
        generatedText,
        usage: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          total_tokens: totalTokens,
          cost: cost,
          model: model,
          provider: 'anthropic'
        }
      }
      
      console.log('✅ Analysis completed successfully')
      await logFunction(supabase, user.id, 'analyze-document-claude', requestBody, result, null, 200, Date.now() - startTime)
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })

  } catch (error) {
    const errorMsg = error.message || 'Unknown error occurred'
    console.error('=== FUNCTION ERROR ===')
    console.error('❌ Error:', error)
    console.error('❌ Error message:', errorMsg)
    console.error('❌ Error stack:', error.stack)
    
    // Try to log the error (but don't fail if logging fails)
    try {
      await logFunction(supabase, null, 'analyze-document-claude', null, null, errorMsg, 500, Date.now() - startTime)
    } catch (logError) {
      console.error('Failed to log error:', logError)
    }
    
    return new Response(JSON.stringify({ 
      error: errorMsg,
      stack: error.stack
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY')
    if (!anthropicApiKey) {
      throw new Error('ANTHROPIC_API_KEY not configured')
    }

    const { prompt, fileUrl, fileName, contentType } = await req.json()

    if (!prompt || !fileUrl) {
      throw new Error('Missing required parameters: prompt and fileUrl')
    }

    console.log('Analyzing document with Claude:', { fileName, contentType })

    // Fetch the document
    const docResponse = await fetch(fileUrl)
    if (!docResponse.ok) {
      throw new Error(`Failed to fetch document: ${docResponse.statusText}`)
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

    // Call Claude API with the document
    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anthropicApiKey}`,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514', // Latest Claude model
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'document',
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

    if (!claudeResponse.ok) {
      const errorText = await claudeResponse.text()
      console.error('Claude API error:', errorText)
      throw new Error(`Claude API error: ${claudeResponse.statusText}`)
    }

    const claudeData = await claudeResponse.json()
    console.log('Claude response:', claudeData)

    if (!claudeData.content || !claudeData.content[0] || !claudeData.content[0].text) {
      throw new Error('No content returned from Claude')
    }

    const generatedText = claudeData.content[0].text

    return new Response(JSON.stringify({ 
      generatedText,
      usage: claudeData.usage || {}
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
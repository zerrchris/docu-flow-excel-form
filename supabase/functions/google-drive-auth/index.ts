import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const requestBody = await req.json()
    const { action, code, fileId, origin, access_token } = requestBody

    const clientId = Deno.env.get('GOOGLE_OAUTH_CLIENT_ID')
    const clientSecret = Deno.env.get('GOOGLE_OAUTH_CLIENT_SECRET')
    
    if (!clientId || !clientSecret) {
      throw new Error('Google OAuth credentials not configured')
    }

    if (action === 'get_auth_url') {
      // Generate OAuth URL
      const redirectUri = `${origin}/google-auth-callback`
      const scope = 'https://www.googleapis.com/auth/drive.readonly'
      
      const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `scope=${encodeURIComponent(scope)}&` +
        `response_type=code&` +
        `access_type=offline&` +
        `prompt=consent`
      
      return new Response(
        JSON.stringify({ authUrl }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'exchange_code') {
      // Exchange authorization code for access token
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: `${origin}/google-auth-callback`,
          grant_type: 'authorization_code',
        }),
      })

      const tokens = await tokenResponse.json()
      
      return new Response(
        JSON.stringify(tokens),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (action === 'get_file') {
      console.log('Getting file with ID:', fileId, 'and token:', access_token ? 'present' : 'missing')
      
      if (!access_token) {
        throw new Error('Access token is required')
      }
      
      if (!fileId) {
        throw new Error('File ID is required')
      }
      
      // Get file metadata
      const metadataResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
        {
          headers: {
            'Authorization': `Bearer ${access_token}`,
          },
        }
      )
      
      console.log('Metadata response status:', metadataResponse.status)
      
      if (!metadataResponse.ok) {
        const errorText = await metadataResponse.text()
        console.log('Metadata error:', errorText)
        throw new Error(`Failed to get file metadata: ${metadataResponse.status} ${errorText}`)
      }
      
      const metadata = await metadataResponse.json()
      console.log('File metadata:', metadata)
      
      // Determine the correct API endpoint and export format for Google Workspace files
      let downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`
      
      // Handle Google Workspace files that need to be exported
      if (metadata.mimeType === 'application/vnd.google-apps.spreadsheet') {
        // Export Google Sheets as Excel format
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
      } else if (metadata.mimeType === 'application/vnd.google-apps.document') {
        // Export Google Docs as Word format
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.wordprocessingml.document`
      } else if (metadata.mimeType === 'application/vnd.google-apps.presentation') {
        // Export Google Slides as PowerPoint format
        downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation`
      }
      
      console.log('Download URL:', downloadUrl)
      
      // Download or export file content
      const contentResponse = await fetch(downloadUrl, {
        headers: {
          'Authorization': `Bearer ${access_token}`,
        },
      })
      
      console.log('Content response status:', contentResponse.status)
      
      if (!contentResponse.ok) {
        const errorText = await contentResponse.text()
        console.log('Content error:', errorText)
        throw new Error(`Failed to download file content: ${contentResponse.status} ${errorText}`)
      }
      
      const content = await contentResponse.arrayBuffer()
      const base64Content = btoa(String.fromCharCode(...new Uint8Array(content)))
      
      return new Response(
        JSON.stringify({
          name: metadata.name,
          mimeType: metadata.mimeType,
          size: metadata.size,
          content: base64Content,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    throw new Error('Invalid action')
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
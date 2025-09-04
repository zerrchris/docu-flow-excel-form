import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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
    // Create Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Get user from token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token)
    
    if (userError || !user) {
      console.error('Auth error:', userError)
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { 
          status: 401,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Parse the request body
    const uploadData = await req.json()
    console.log('Create runsheet from upload request:', {
      name: uploadData.name,
      columnsCount: uploadData.columns?.length,
      dataCount: uploadData.data?.length,
      userId: user.id
    })

    // Validate required fields
    if (!uploadData.name || !uploadData.columns || !uploadData.data) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: name, columns, data' }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // Create the runsheet with a unique name to avoid conflicts
    const timestamp = new Date().toLocaleString()
    const uniqueName = `${uploadData.name} (Imported ${timestamp})`

    console.log('Creating runsheet with name:', uniqueName)

    // Insert the runsheet into the database
    const { data: runsheet, error: insertError } = await supabaseClient
      .from('runsheets')
      .insert({
        name: uniqueName,
        columns: uploadData.columns,
        data: uploadData.data,
        column_instructions: uploadData.column_instructions || {},
        user_id: user.id
      })
      .select()
      .single()

    if (insertError) {
      console.error('Failed to create runsheet:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create runsheet: ' + insertError.message }),
        { 
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    console.log('Successfully created runsheet:', {
      id: runsheet.id,
      name: runsheet.name,
      columnsCount: runsheet.columns.length,
      dataCount: runsheet.data.length
    })
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        runsheet: {
          id: runsheet.id,
          name: runsheet.name,
          columns: runsheet.columns,
          data: runsheet.data,
          column_instructions: runsheet.column_instructions
        }
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )

  } catch (error) {
    console.error('Create runsheet from upload error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('create-quick-runsheet function called');

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('No valid authorization header provided')
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract the JWT token
    const token = authHeader.replace('Bearer ', '')
    
    // Verify the JWT and get user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('Authentication failed:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get request data
    const { name } = await req.json()

    if (!name || !name.trim()) {
      return new Response(
        JSON.stringify({ error: 'Runsheet name is required' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Creating quick runsheet for user:', user.id, 'with name:', name)

    // Try to get user's default extraction preferences
    const { data: userPreferences, error: preferencesError } = await supabase
      .from('user_extraction_preferences')
      .select('columns, column_instructions')
      .eq('user_id', user.id)
      .eq('is_default', true)
      .single()

    let columns: string[]
    let columnInstructions: Record<string, string>

    if (userPreferences && !preferencesError) {
      // Use user's default preferences
      columns = userPreferences.columns || []
      columnInstructions = userPreferences.column_instructions || {}
      console.log('Using user preferences with', columns.length, 'columns')
    } else {
      // Fall back to sensible default columns for document processing
      console.log('No user preferences found, using default columns')
      columns = [
        'Document Type',
        'Date',
        'Reference Number',
        'Name/Entity',
        'Description',
        'Amount',
        'Notes'
      ]

      columnInstructions = {
        'Document Type': 'Extract the type of document (e.g., Invoice, Contract, Report, etc.)',
        'Date': 'Extract the main date from the document (creation, effective, or due date)',
        'Reference Number': 'Extract any reference, ID, or tracking number',
        'Name/Entity': 'Extract the primary person, company, or entity name',
        'Description': 'Extract a brief description or subject of the document',
        'Amount': 'Extract any monetary amounts, quantities, or measurements',
        'Notes': 'Extract any additional relevant information or special remarks'
      }
    }

    // Create initial empty row
    const initialData = [{}]
    columns.forEach(col => {
      initialData[0][col] = ''
    })

    // Create the runsheet
    const { data: newRunsheet, error: createError } = await supabase
      .from('runsheets')
      .insert({
        user_id: user.id,
        name: name.trim(),
        columns: columns,
        data: initialData,
        column_instructions: columnInstructions
      })
      .select()
      .single()

    if (createError) {
      console.error('Error creating runsheet:', createError)
      return new Response(
        JSON.stringify({ error: 'Failed to create runsheet' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Successfully created runsheet:', newRunsheet.id)

    return new Response(
      JSON.stringify({ 
        success: true,
        runsheet: newRunsheet,
        message: 'Quick runsheet created successfully' 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
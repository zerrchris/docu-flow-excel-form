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

    // Default columns for real estate runsheets
    const defaultColumns = [
      'Inst Number',
      'Book/Page', 
      'Inst Type',
      'Recording Date',
      'Document Date',
      'Grantor',
      'Grantee',
      'Legal Description',
      'Notes',
      'Document File Name'
    ]

    // Default column instructions for extraction
    const defaultColumnInstructions = {
      'Inst Number': 'Extract the instrument number exactly as it appears on the document',
      'Book/Page': 'Extract the complete book and page reference (e.g., Book 123, Page 456)',
      'Inst Type': 'Extract the type of instrument (e.g., Deed, Mortgage, Lien, etc.)',
      'Recording Date': 'Extract the date when the document was recorded at the courthouse',
      'Document Date': 'Extract the date the document was signed or executed',
      'Grantor': "Extract the Grantor's name as it appears on the document and include the address if there is one",
      'Grantee': "Extract the Grantee's name as it appears on the document and include the address if there is one",
      'Legal Description': 'Extract the complete legal description of the property including lot, block, subdivision, and metes and bounds if present',
      'Notes': 'Extract any additional relevant information, special conditions, or remarks',
      'Document File Name': 'This will be filled automatically when documents are linked'
    }

    // Create initial empty row
    const initialData = [{}]
    defaultColumns.forEach(col => {
      initialData[0][col] = ''
    })

    // Create the runsheet
    const { data: newRunsheet, error: createError } = await supabase
      .from('runsheets')
      .insert({
        user_id: user.id,
        name: name.trim(),
        columns: defaultColumns,
        data: initialData,
        column_instructions: defaultColumnInstructions
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
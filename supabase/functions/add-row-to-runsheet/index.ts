import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('add-row-to-runsheet function called');

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
        JSON.stringify({ error: 'Authorization required', success: false }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Extract the JWT token and get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    
    if (authError || !user) {
      console.error('Authentication failed:', authError)
      return new Response(
        JSON.stringify({ error: 'Invalid authentication', success: false }),
        { 
          status: 401, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Get request data
    const { runsheet_id, row_data, row_index } = await req.json()

    if (!runsheet_id || !row_data) {
      return new Response(
        JSON.stringify({ error: 'runsheet_id and row_data are required', success: false }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Adding row to runsheet:', runsheet_id, 'at index:', row_index)

    // Get current runsheet
    const { data: runsheet, error: fetchError } = await supabase
      .from('runsheets')
      .select('*')
      .eq('id', runsheet_id)
      .eq('user_id', user.id)
      .single()

    if (fetchError || !runsheet) {
      console.error('Error fetching runsheet:', fetchError)
      return new Response(
        JSON.stringify({ error: 'Runsheet not found or access denied', success: false }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Enhanced validation and row management
    let data = Array.isArray(runsheet.data) ? [...runsheet.data] : []
    
    // Validate row_index is reasonable
    if (row_index < 0 || row_index > data.length + 100) {
      return new Response(
        JSON.stringify({ error: 'Invalid row index provided', success: false }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }
    
    // Ensure we have the specified row index
    while (data.length <= row_index) {
      const emptyRow: Record<string, string> = {}
      runsheet.columns.forEach((col: string) => emptyRow[col] = '')
      data.push(emptyRow)
    }

    // Check if target row has existing data (safety check)
    const existingRow = data[row_index]
    const hasExistingData = Object.values(existingRow).some(value => 
      value && value.toString().trim() !== '' && value.toString().trim().toLowerCase() !== 'n/a'
    )

    if (hasExistingData) {
      console.log('Warning: Adding data to row that already contains information:', existingRow)
      // Log for audit purposes but don't prevent the operation as this might be intentional updates
    }

    // Validate the incoming data
    const validatedRowData: Record<string, string> = {}
    let validFieldCount = 0
    
    Object.entries(row_data).forEach(([column, value]) => {
      if (runsheet.columns.includes(column)) {
        const stringValue = value?.toString().trim() || ''
        if (stringValue !== '') {
          validatedRowData[column] = stringValue
          validFieldCount++
        }
      } else {
        console.log('Ignoring invalid column:', column)
      }
    })

    // Ensure we're adding at least some valid data
    if (validFieldCount === 0) {
      return new Response(
        JSON.stringify({ error: 'No valid data provided for any columns', success: false }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update the row with validated data
    data[row_index] = { ...data[row_index], ...validatedRowData }

    // Save updated runsheet
    const { error: updateError } = await supabase
      .from('runsheets')
      .update({ 
        data: data,
        updated_at: new Date().toISOString()
      })
      .eq('id', runsheet_id)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating runsheet:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to update runsheet', success: false }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log(`Successfully added ${validFieldCount} fields to row ${row_index} in runsheet`)

    return new Response(
      JSON.stringify({ 
        success: true,
        row_index: row_index,
        populated_fields: Object.keys(validatedRowData),
        populated_field_count: validFieldCount,
        had_existing_data: hasExistingData,
        message: `Row ${row_index + 1} updated successfully with ${validFieldCount} fields`
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', success: false }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
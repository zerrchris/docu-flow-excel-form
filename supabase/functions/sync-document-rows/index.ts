import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Verify authentication
    const authHeader = req.headers.get('Authorization')!
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    
    if (authError || !user) {
      return new Response('Unauthorized', { status: 401, headers: corsHeaders })
    }

    const { runsheetId, rowMappings } = await req.json()

    if (!runsheetId || !rowMappings || !Array.isArray(rowMappings)) {
      return new Response('Missing required fields', { status: 400, headers: corsHeaders })
    }

    console.log(`Syncing document rows for runsheet ${runsheetId} with mappings:`, rowMappings)

    // Update document row indices based on the mapping
    // rowMappings should be an array of { oldIndex: number, newIndex: number }
    for (const mapping of rowMappings) {
      const { oldIndex, newIndex } = mapping
      
      if (typeof oldIndex !== 'number' || typeof newIndex !== 'number') {
        continue
      }

      // Update documents that were at oldIndex to be at newIndex
      const { error: updateError } = await supabase
        .from('documents')
        .update({ row_index: newIndex })
        .eq('runsheet_id', runsheetId)
        .eq('user_id', user.id)
        .eq('row_index', oldIndex)

      if (updateError) {
        console.error(`Error updating document row index from ${oldIndex} to ${newIndex}:`, updateError)
        return new Response(
          JSON.stringify({ error: `Failed to update document row indices: ${updateError.message}` }), 
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      console.log(`Updated documents from row ${oldIndex} to row ${newIndex}`)
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Successfully updated document row indices for ${rowMappings.length} mappings` 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error in sync-document-rows:', error)
    return new Response(
      JSON.stringify({ error: error.message }), 
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ExtensionData {
  runsheet_id: string
  row_data: Record<string, any>
  screenshot_url?: string
  user_id: string
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    if (req.method === 'POST') {
      // Sync data from extension to runsheet
      const { runsheet_id, row_data, screenshot_url, user_id }: ExtensionData = await req.json()

      // Get current runsheet
      const { data: runsheet, error: fetchError } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheet_id)
        .eq('user_id', user_id)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch runsheet: ${fetchError.message}`)
      }

      // Update runsheet data
      const currentData = runsheet.data as any[]
      const updatedData = [...currentData]
      
      // Find or create row for this data
      let rowIndex = updatedData.findIndex(row => 
        Object.keys(row_data).some(key => row[key] === row_data[key])
      )
      
      if (rowIndex === -1) {
        // Add new row
        updatedData.push(row_data)
        rowIndex = updatedData.length - 1
      } else {
        // Update existing row
        updatedData[rowIndex] = { ...updatedData[rowIndex], ...row_data }
      }

      // Add screenshot URL if provided
      if (screenshot_url) {
        updatedData[rowIndex] = { 
          ...updatedData[rowIndex], 
          screenshot_url 
        }
      }

      // Save updated runsheet
      const { error: updateError } = await supabase
        .from('runsheets')
        .update({ 
          data: updatedData,
          updated_at: new Date().toISOString()
        })
        .eq('id', runsheet_id)
        .eq('user_id', user_id)

      if (updateError) {
        throw new Error(`Failed to update runsheet: ${updateError.message}`)
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          row_index: rowIndex,
          message: 'Data synced successfully' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    if (req.method === 'GET') {
      // Get runsheet data for extension
      const url = new URL(req.url)
      const runsheet_id = url.searchParams.get('runsheet_id')
      const user_id = url.searchParams.get('user_id')

      if (!runsheet_id || !user_id) {
        throw new Error('Missing runsheet_id or user_id')
      }

      const { data: runsheet, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheet_id)
        .eq('user_id', user_id)
        .single()

      if (error) {
        throw new Error(`Failed to fetch runsheet: ${error.message}`)
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          runsheet: runsheet 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 405 
      }
    )

  } catch (error) {
    console.error('Extension sync error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message || 'Internal server error',
        success: false 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

interface ExtensionData {
  runsheet_id: string
  row_data: Record<string, any>
  screenshot_url?: string
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
      const { runsheet_id, row_data, screenshot_url }: ExtensionData = await req.json()

      // Get the authorization header
      const authHeader = req.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Authorization required', success: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Extract the JWT token and get user
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication', success: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get current runsheet
      const { data: runsheet, error: fetchError } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheet_id)
        .eq('user_id', user.id)
        .single()

      if (fetchError) {
        throw new Error(`Failed to fetch runsheet: ${fetchError.message}`)
      }

      // Update runsheet data - find the next available row or add new row
      const currentData = runsheet.data as any[]
      const updatedData = [...currentData]
      
      // Find the first empty row or add a new one
      let targetRowIndex = 0;
      
      // Look for first row that has all empty values
      for (let i = 0; i < updatedData.length; i++) {
        const row = updatedData[i];
        const hasData = Object.values(row).some(value => value && value.toString().trim() !== '');
        if (!hasData) {
          targetRowIndex = i;
          break;
        }
        targetRowIndex = i + 1; // Next row after this one
      }
      
      // If we need to add a new row
      if (targetRowIndex >= updatedData.length) {
        const emptyRow: Record<string, string> = {}
        runsheet.columns.forEach((col: string) => emptyRow[col] = '')
        updatedData.push(emptyRow)
      }

      // Update the target row with the provided data
      updatedData[targetRowIndex] = { ...updatedData[targetRowIndex], ...row_data }

      // Add screenshot URL if provided and create document record
      if (screenshot_url) {
        updatedData[targetRowIndex] = { 
          ...updatedData[targetRowIndex], 
          screenshot_url 
        }

        // Extract filename and file path from screenshot URL
        const urlParts = screenshot_url.split('/')
        const filename = urlParts[urlParts.length - 1]
        
        // For screenshots from extension, the URL is like:
        // https://xnpmrafjjqsissbtempj.supabase.co/storage/v1/object/public/documents/user_id/snips/filename.png
        // We need to extract: user_id/snips/filename.png
        const baseUrl = `${supabaseUrl}/storage/v1/object/public/documents/`
        const filePath = screenshot_url.replace(baseUrl, '')
        
        console.log('URL parsing debug:', {
          screenshot_url,
          baseUrl,
          extractedFilePath: filePath
        })

        console.log('Creating document record:', {
          filename,
          filePath,
          screenshot_url,
          runsheet_id,
          targetRowIndex,
          user_id: user.id
        })

        // Check if document record already exists for this row
        const { data: existingDoc, error: existingError } = await supabase
          .from('documents')
          .select('id')
          .eq('runsheet_id', runsheet_id)
          .eq('row_index', targetRowIndex)
          .eq('user_id', user.id)
          .maybeSingle()

        // Create or update document record
        const documentData = {
          user_id: user.id,
          runsheet_id: runsheet_id,
          row_index: targetRowIndex,
          original_filename: filename,
          stored_filename: filename,
          file_path: filePath,
          content_type: 'image/png'
        }

        let documentResult;
        if (existingDoc) {
          // Update existing document
          documentResult = await supabase
            .from('documents')
            .update(documentData)
            .eq('id', existingDoc.id)
            .select()
        } else {
          // Insert new document
          documentResult = await supabase
            .from('documents')
            .insert(documentData)
            .select()
        }

        if (documentResult.error) {
          console.error('Failed to create/update document record:', documentResult.error)
        } else {
          console.log('Document record created/updated successfully:', documentResult.data)
          
          // Fire document creation event for the main app to refresh its document map
          console.log('🚨 Extension Sync: Firing document record created event for runsheet:', runsheet_id)
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
        .eq('user_id', user.id)

      if (updateError) {
        throw new Error(`Failed to update runsheet: ${updateError.message}`)
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          row_index: targetRowIndex,
          message: `Data added to row ${targetRowIndex + 1}`,
          document_created: !!screenshot_url,
          runsheet_id: runsheet_id
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

      if (!runsheet_id) {
        throw new Error('Missing runsheet_id')
      }

      // Get the authorization header
      const authHeader = req.headers.get('Authorization')
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return new Response(
          JSON.stringify({ error: 'Authorization required', success: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Extract the JWT token and get user
      const token = authHeader.replace('Bearer ', '')
      const { data: { user }, error: authError } = await supabase.auth.getUser(token)
      
      if (authError || !user) {
        return new Response(
          JSON.stringify({ error: 'Invalid authentication', success: false }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: runsheet, error } = await supabase
        .from('runsheets')
        .select('*')
        .eq('id', runsheet_id)
        .eq('user_id', user.id)
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
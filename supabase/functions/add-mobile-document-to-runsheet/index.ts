import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  console.log('add-mobile-document-to-runsheet function called');

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

    // Parse form data
    const formData = await req.formData();
    const file = formData.get('file') as File;
    const runsheetId = formData.get('runsheetId') as string;
    const originalFilename = formData.get('originalFilename') as string || file.name;

    if (!file || !runsheetId) {
      return new Response(
        JSON.stringify({ error: 'File and runsheetId are required', success: false }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    console.log('Adding mobile document to runsheet:', runsheetId)

    // Get current runsheet
    const { data: runsheet, error: fetchError } = await supabase
      .from('runsheets')
      .select('*')
      .eq('id', runsheetId)
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

    // Find the next available row (first row with all empty values)
    let data = Array.isArray(runsheet.data) ? [...runsheet.data] : []
    let nextRowIndex = 0;
    
    // Find first completely empty row or create a new one
    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      const isEmpty = !row || Object.values(row).every(value => 
        !value || value.toString().trim() === '' || value.toString().trim().toLowerCase() === 'n/a'
      );
      
      if (isEmpty) {
        nextRowIndex = i;
        break;
      }
      
      if (i === data.length - 1) {
        // All rows have data, create a new row
        nextRowIndex = data.length;
      }
    }

    // Ensure we have the row at the target index
    while (data.length <= nextRowIndex) {
      const emptyRow: Record<string, string> = {}
      runsheet.columns.forEach((col: string) => emptyRow[col] = '')
      data.push(emptyRow)
    }

    console.log(`Using row index ${nextRowIndex} for mobile document`);

    // Determine stored filename: prefer user-provided name, else generate smart one
    let storedFilename: string;

    const sanitizeFilename = (name: string) => {
      // Remove path parts, keep only base name
      const base = name.split('/').pop() || name;
      // Replace disallowed chars, collapse spaces to underscores
      let cleaned = base.replace(/[^a-zA-Z0-9._\-\s]/g, '').replace(/\s+/g, '_');
      // Ensure it has an extension; default to jpg if missing
      if (!/\.[a-zA-Z0-9]{2,4}$/.test(cleaned)) {
        const ext = (originalFilename.match(/\.[a-zA-Z0-9]{2,4}$/) || ['.jpg'])[0];
        cleaned = cleaned + ext;
      }
      return cleaned;
    };

    if (originalFilename && originalFilename.trim().length > 0) {
      // Honor the name the user typed
      storedFilename = sanitizeFilename(originalFilename.trim());
    } else {
      // Generate smart filename using existing database function
      const { data: generatedFilename, error: filenameError } = await supabase
        .rpc('generate_document_filename_with_preferences', {
          runsheet_data: data,
          row_index: nextRowIndex,
          original_filename: file.name,
          user_id: user.id
        });

      if (filenameError) {
        console.error('Error generating filename:', filenameError);
        storedFilename = `mobile_document_${nextRowIndex}_${Date.now()}.${(file.name.split('.').pop() || 'jpg')}`;
      } else {
        storedFilename = generatedFilename || `mobile_document_${nextRowIndex}_${Date.now()}.${(file.name.split('.').pop() || 'jpg')}`;
      }
    }

    const filePath = `${user.id}/${runsheetId}/${storedFilename}`;

    console.log(`Generated filename: ${storedFilename}, path: ${filePath}`);

    // Store file in Supabase storage
    const fileBuffer = await file.arrayBuffer();
    const { error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      return new Response(
        JSON.stringify({ error: 'Failed to upload file to storage', success: false }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Insert document record
    const { data: documentData, error: documentError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        runsheet_id: runsheetId,
        row_index: nextRowIndex,
        original_filename: originalFilename,
        stored_filename: storedFilename,
        file_path: filePath,
        file_size: file.size,
        content_type: file.type,
      })
      .select()
      .single();

    if (documentError) {
      console.error('Database insert error:', documentError);
      // Try to clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]);
      return new Response(
        JSON.stringify({ error: 'Failed to save document record', success: false }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      )
    }

    // Update the runsheet data to ensure the row exists (even if empty)
    const { error: updateError } = await supabase
      .from('runsheets')
      .update({ 
        data: data,
        updated_at: new Date().toISOString()
      })
      .eq('id', runsheetId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('Error updating runsheet:', updateError)
      // Don't fail the request if this fails, document is already stored
    }

    // Get public URL for the file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    console.log(`Successfully added mobile document to row ${nextRowIndex} in runsheet`);

    return new Response(
      JSON.stringify({ 
        success: true,
        document: documentData,
        fileUrl: urlData.publicUrl,
        storedFilename: storedFilename,
        rowIndex: nextRowIndex,
        message: `Document added to row ${nextRowIndex + 1} successfully`
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
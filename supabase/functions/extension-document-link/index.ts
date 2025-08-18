import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get user from request
    const authorization = req.headers.get('Authorization');
    if (!authorization) {
      throw new Error('No authorization header');
    }

    const jwt = authorization.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(jwt);
    
    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const { 
      document_blob, 
      runsheet_id, 
      row_index, 
      filename, 
      extracted_data 
    } = await req.json();

    // Convert base64 blob to binary for storage
    const base64Data = document_blob.split(',')[1];
    const binaryData = atob(base64Data);
    const uint8Array = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      uint8Array[i] = binaryData.charCodeAt(i);
    }

    // Generate unique filename
    const timestamp = Date.now();
    const uniqueFilename = `extension_capture_${timestamp}_${filename || 'document.png'}`;
    const storagePath = `${user.id}/captures/${uniqueFilename}`;

    // Upload to Supabase Storage
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('documents')
      .upload(storagePath, uint8Array, {
        contentType: 'image/png',
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Upload failed: ${uploadError.message}`);
    }

    // Get public URL
    const { data: urlData } = supabaseClient.storage
      .from('documents')
      .getPublicUrl(storagePath);

    // Store document record in database
    const { data: docRecord, error: docError } = await supabaseClient
      .from('documents')
      .insert({
        user_id: user.id,
        runsheet_id: runsheet_id,
        original_filename: filename || 'extension_capture.png',
        stored_filename: uniqueFilename,
        file_path: storagePath,
        row_index: row_index || 0,
        content_type: 'image/png',
        file_size: uint8Array.length
      })
      .select()
      .single();

    if (docError) {
      throw new Error(`Database insert failed: ${docError.message}`);
    }

    // If extracted data is provided, populate the runsheet
    let populateResult = null;
    if (extracted_data && runsheet_id) {
      try {
        const populateResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/populate-runsheet-data`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${jwt}`,
            'Content-Type': 'application/json',
            'apikey': Deno.env.get('SUPABASE_ANON_KEY') ?? ''
          },
          body: JSON.stringify({
            runsheetId: runsheet_id,
            extractedData: extracted_data,
            documentInfo: {
              document_id: docRecord.id,
              filename: uniqueFilename,
              url: urlData.publicUrl
            }
          })
        });

        if (populateResponse.ok) {
          populateResult = await populateResponse.json();
        }
      } catch (populateError) {
        console.warn('Failed to populate runsheet:', populateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        document: {
          id: docRecord.id,
          url: urlData.publicUrl,
          filename: uniqueFilename,
          path: storagePath
        },
        runsheet_update: populateResult
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

  } catch (error) {
    console.error('Extension document link error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Failed to link document'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
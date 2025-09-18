import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Use service role for auth verification
    const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from authorization header
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: { user }, error: authError } = await supabaseService.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create user-authenticated client for database operations
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader
        }
      }
    });

    const formData = await req.formData();
    const file = formData.get('file') as File;
    const runsheetId = formData.get('runsheetId') as string;
    const rowIndex = parseInt(formData.get('rowIndex') as string);
    const originalFilename = formData.get('originalFilename') as string || file.name;
    const useSmartNaming = formData.get('useSmartNaming') === 'true';

    if (!file || !runsheetId || rowIndex === undefined) {
      return new Response(
        JSON.stringify({ error: 'File, runsheetId, and rowIndex are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Storing document: ${originalFilename} for runsheet ${runsheetId}, row ${rowIndex}, useSmartNaming: ${useSmartNaming}`);

    // Get runsheet data to generate filename
    const { data: runsheet, error: runsheetError } = await supabase
      .from('runsheets')
      .select('data, name')
      .eq('id', runsheetId)
      .eq('user_id', user.id)
      .single();

    if (runsheetError || !runsheet) {
      return new Response(
        JSON.stringify({ error: 'Runsheet not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let storedFilename;
    
    if (useSmartNaming) {
      // Generate filename based on spreadsheet data with user preferences
      const { data: generatedFilename, error: filenameError } = await supabase
        .rpc('generate_document_filename_with_preferences', {
          runsheet_data: runsheet.data,
          row_index: rowIndex,
          original_filename: originalFilename,
          user_id: user.id
        });

      console.log('Filename generation result:', { generatedFilename, filenameError, runsheetData: runsheet.data });

      if (filenameError) {
        console.error('Error generating filename:', filenameError);
        return new Response(
          JSON.stringify({ error: 'Failed to generate filename' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      storedFilename = generatedFilename || `document_${rowIndex}_${Date.now()}.${originalFilename.split('.').pop()}`;
    } else {
      // Use original filename exactly as uploaded
      storedFilename = originalFilename;
    }

    // Ensure filename extension matches actual content type
    const extForType = (mime: string): string | null => {
      const map: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/tiff': 'tiff',
        'application/pdf': 'pdf',
      };
      return map[mime] || null;
    };

    const desiredExt = extForType(file.type);
    if (desiredExt) {
      const lower = storedFilename.toLowerCase();
      if (!lower.endsWith(`.${desiredExt}`)) {
        // Replace existing extension if present; otherwise append
        if (/\.[^./]+$/.test(storedFilename)) {
          storedFilename = storedFilename.replace(/\.[^./]+$/, `.${desiredExt}`);
        } else {
          storedFilename = `${storedFilename}.${desiredExt}`;
        }
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
        JSON.stringify({ error: 'Failed to upload file to storage' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if document record already exists for this row
    const { data: existingDoc, error: existingError } = await supabase
      .from('documents')
      .select('id')
      .eq('runsheet_id', runsheetId)
      .eq('row_index', rowIndex)
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingError) {
      console.error('Error checking existing document:', existingError);
    }

    // Insert or update document record
    const documentData = {
      user_id: user.id,
      runsheet_id: runsheetId,
      row_index: rowIndex,
      original_filename: originalFilename,
      stored_filename: storedFilename,
      file_path: filePath,
      file_size: file.size,
      content_type: file.type, // Use the actual file content type (e.g., image/jpeg for converted PDFs)
    };

    let documentResult;
    if (existingDoc) {
      // Update existing document
      const { data, error } = await supabase
        .from('documents')
        .update(documentData)
        .eq('id', existingDoc.id)
        .select()
        .single();
      documentResult = { data, error };
    } else {
      // Insert new document
      const { data, error } = await supabase
        .from('documents')
        .insert(documentData)
        .select()
        .single();
      documentResult = { data, error };
    }

    if (documentResult.error) {
      console.error('Database insert/update error:', documentResult.error);
      // Try to clean up uploaded file
      await supabase.storage.from('documents').remove([filePath]);
      return new Response(
        JSON.stringify({ error: 'Failed to save document record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get public URL for the file
    const { data: urlData } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);

    console.log('Document stored successfully');

    return new Response(
      JSON.stringify({
        success: true,
        document: documentResult.data,
        fileUrl: urlData.publicUrl,
        storedFilename: storedFilename
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in store-document function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
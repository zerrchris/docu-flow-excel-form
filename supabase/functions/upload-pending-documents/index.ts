import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.52.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface PendingDocument {
  rowIndex: number;
  fileName: string;
  fileData: string; // base64 data URL
  fileType: string;
  fileSize: number;
  timestamp: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Get request data
    const { runsheetId, pendingDocuments, userId } = await req.json();

    console.log('Processing pending documents for runsheet:', runsheetId);
    console.log('Number of pending documents:', pendingDocuments.length);

    if (!runsheetId || !pendingDocuments || !Array.isArray(pendingDocuments)) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: runsheetId, pendingDocuments' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const results = [];

    for (const pendingDoc of pendingDocuments as PendingDocument[]) {
      try {
        console.log('Processing document:', pendingDoc.fileName, 'for row:', pendingDoc.rowIndex);

        // Convert base64 data URL to blob
        const base64Data = pendingDoc.fileData.split(',')[1]; // Remove data URL prefix
        const binaryData = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

        // Generate storage path
        const fileExtension = pendingDoc.fileName.split('.').pop() || '';
        const timestamp = Date.now();
        const sanitizedFilename = pendingDoc.fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `${userId}/${runsheetId}/${timestamp}_${sanitizedFilename}`;

        console.log('Uploading to storage path:', storagePath);

        // Upload file to storage
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('documents')
          .upload(storagePath, binaryData, {
            contentType: pendingDoc.fileType,
            upsert: false
          });

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          results.push({
            rowIndex: pendingDoc.rowIndex,
            success: false,
            error: uploadError.message
          });
          continue;
        }

        console.log('File uploaded successfully:', uploadData.path);

        // Create document record in database
        const { data: documentData, error: documentError } = await supabase
          .from('documents')
          .insert({
            user_id: userId,
            runsheet_id: runsheetId,
            row_index: pendingDoc.rowIndex,
            file_path: uploadData.path,
            stored_filename: pendingDoc.fileName,
            original_filename: pendingDoc.fileName,
            content_type: pendingDoc.fileType,
            file_size: pendingDoc.fileSize
          })
          .select()
          .single();

        if (documentError) {
          console.error('Database insert error:', documentError);
          
          // Clean up uploaded file on database error
          await supabase.storage
            .from('documents')
            .remove([uploadData.path]);

          results.push({
            rowIndex: pendingDoc.rowIndex,
            success: false,
            error: documentError.message
          });
          continue;
        }

        console.log('Document record created:', documentData.id);

        results.push({
          rowIndex: pendingDoc.rowIndex,
          success: true,
          documentId: documentData.id,
          storagePath: uploadData.path,
          storedFilename: pendingDoc.fileName
        });

      } catch (error) {
        console.error('Error processing pending document:', error);
        results.push({
          rowIndex: pendingDoc.rowIndex,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    console.log('Finished processing pending documents. Results:', results);

    return new Response(
      JSON.stringify({ 
        message: 'Pending documents processed',
        results: results,
        successCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
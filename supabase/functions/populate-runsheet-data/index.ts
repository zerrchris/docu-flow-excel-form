import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

    const { runsheetId, extractedData, documentInfo } = await req.json();

    if (!runsheetId || !extractedData) {
      return new Response(
        JSON.stringify({ error: 'runsheetId and extractedData are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Populating runsheet ${runsheetId} with extracted data:`, extractedData);

    // Get the current runsheet data
    const { data: runsheet, error: fetchError } = await supabaseService
      .from('runsheets')
      .select('data, columns')
      .eq('id', runsheetId)
      .eq('user_id', user.id)
      .single();

    if (fetchError || !runsheet) {
      return new Response(
        JSON.stringify({ error: 'Runsheet not found or access denied' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Find the next available row (first empty row)
    const currentData = runsheet.data as Record<string, string>[];
    let targetRowIndex = -1;

    // Look for the first row that has all empty values
    for (let i = 0; i < currentData.length; i++) {
      const row = currentData[i];
      const hasAnyData = Object.values(row).some(value => value && value.trim() !== '');
      
      if (!hasAnyData) {
        targetRowIndex = i;
        break;
      }
    }

    // If no empty row found, add a new row
    if (targetRowIndex === -1) {
      const newRow: Record<string, string> = {};
      runsheet.columns.forEach((col: string) => newRow[col] = '');
      currentData.push(newRow);
      targetRowIndex = currentData.length - 1;
    }

    // Populate the target row with extracted data
    const targetRow = currentData[targetRowIndex];
    Object.entries(extractedData).forEach(([column, value]) => {
      if (runsheet.columns.includes(column)) {
        targetRow[column] = value || '';
      }
    });

    // Update the runsheet in the database
    const { error: updateError } = await supabaseService
      .from('runsheets')
      .update({
        data: currentData,
        updated_at: new Date().toISOString()
      })
      .eq('id', runsheetId)
      .eq('user_id', user.id);

    if (updateError) {
      console.error('Error updating runsheet:', updateError);
      return new Response(
        JSON.stringify({ error: 'Failed to update runsheet' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If document info is provided, store document reference
    if (documentInfo) {
      try {
        const { data: existingDoc } = await supabaseService
          .from('documents')
          .select('id')
          .eq('runsheet_id', runsheetId)
          .eq('row_index', targetRowIndex)
          .eq('user_id', user.id)
          .maybeSingle();

        const documentData = {
          user_id: user.id,
          runsheet_id: runsheetId,
          row_index: targetRowIndex,
          original_filename: documentInfo.originalFilename,
          stored_filename: documentInfo.storedFilename || documentInfo.originalFilename,
          file_path: documentInfo.filePath || '',
          file_size: documentInfo.fileSize || 0,
          content_type: documentInfo.contentType || 'application/octet-stream',
        };

        if (existingDoc) {
          // Update existing document
          await supabaseService
            .from('documents')
            .update(documentData)
            .eq('id', existingDoc.id);
        } else {
          // Insert new document
          await supabaseService
            .from('documents')
            .insert(documentData);
        }

        console.log('Document reference updated for row', targetRowIndex);
      } catch (docError) {
        console.error('Error updating document reference:', docError);
        // Don't fail the entire operation for document reference issues
      }
    }

    console.log(`Successfully populated row ${targetRowIndex} in runsheet ${runsheetId}`);

    return new Response(
      JSON.stringify({
        success: true,
        rowIndex: targetRowIndex,
        populatedFields: Object.keys(extractedData).length,
        message: `Data successfully added to row ${targetRowIndex + 1}`
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error in populate-runsheet-data function:', error);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred', details: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
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

    // Enhanced empty row validation
    const currentData = runsheet.data as Record<string, string>[];
    let targetRowIndex = -1;

    // Comprehensive check for truly empty rows with enhanced validation
    const isRowEmpty = (row: Record<string, string>): boolean => {
      if (!row || typeof row !== 'object') return true;
      
      return Object.values(row).every(value => {
        if (value === null || value === undefined) return true;
        const stringValue = value.toString().trim();
        return stringValue === '' || 
               stringValue.toLowerCase() === 'n/a' ||
               stringValue.toLowerCase() === 'na' ||
               stringValue.toLowerCase() === 'null' ||
               stringValue.toLowerCase() === 'undefined' ||
               stringValue === '-';
      });
    };

    // Look for the first completely empty row with no associated documents
    for (let i = 0; i < currentData.length; i++) {
      const row = currentData[i];
      
      if (isRowEmpty(row)) {
        // Double-check that this row doesn't have any associated documents
        const { data: existingDoc } = await supabaseService
          .from('documents')
          .select('id')
          .eq('runsheet_id', runsheetId)
          .eq('row_index', i)
          .eq('user_id', user.id)
          .maybeSingle();
          
        if (!existingDoc) {
          targetRowIndex = i;
          console.log(`✅ Found verified empty row at index ${i} with no associated documents`);
          break;
        } else {
          console.log(`⚠️ Row ${i} appears empty but has associated document, skipping`);
        }
      }
    }

    // If no empty row found, add new rows to ensure we have space
    if (targetRowIndex === -1) {
      const newRow: Record<string, string> = {};
      runsheet.columns.forEach((col: string) => newRow[col] = '');
      currentData.push(newRow);
      targetRowIndex = currentData.length - 1;
      
      console.log(`✅ No empty row found, created new row at index ${targetRowIndex}`);
    }

    // Final validation: Ensure target row is actually empty before populating
    const targetRow = currentData[targetRowIndex];
    if (!isRowEmpty(targetRow)) {
      console.error(`❌ Critical: Target row ${targetRowIndex} is not empty:`, targetRow);
      
      // Check if any field has significant data 
      const hasSignificantData = Object.values(targetRow).some(value => {
        if (!value) return false;
        const stringValue = value.toString().trim();
        return stringValue.length > 2 && 
               !['n/a', 'na', 'null', 'undefined', '-', ''].includes(stringValue.toLowerCase());
      });
      
      if (hasSignificantData) {
        return new Response(
          JSON.stringify({ 
            error: 'Target row contains important data that would be overwritten. Operation cancelled for data safety.',
            targetRowIndex,
            existingData: targetRow,
            suggestion: 'Please ensure the row is completely empty or manually select a different target row.'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Safely populate the target row with extracted data
    const populatedFields: string[] = [];
    const validColumns = new Set(runsheet.columns);
    
    Object.entries(extractedData).forEach(([column, value]) => {
      if (validColumns.has(column) && value != null) {
        const cleanValue = value.toString().trim();
        if (cleanValue !== '' && cleanValue.toLowerCase() !== 'n/a') {
          // Only populate if the current field is truly empty
          const currentValue = targetRow[column];
          if (!currentValue || 
              currentValue.toString().trim() === '' || 
              currentValue.toString().trim().toLowerCase() === 'n/a') {
            targetRow[column] = cleanValue;
            populatedFields.push(column);
            console.log(`✅ Populated field '${column}' with value: '${cleanValue}'`);
          } else {
            console.log(`⚠️ Skipped field '${column}' - already contains: '${currentValue}'`);
          }
        }
      }
    });

    // Validate that we actually populated some data
    if (populatedFields.length === 0) {
      return new Response(
        JSON.stringify({ 
          error: 'No valid data was extracted from the document. Please check the document content and try again.',
          extractedData 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    console.log(`Successfully populated row ${targetRowIndex} with ${populatedFields.length} fields in runsheet ${runsheetId}`);

    return new Response(
      JSON.stringify({
        success: true,
        rowIndex: targetRowIndex,
        populatedFields: populatedFields,
        populatedFieldCount: populatedFields.length,
        message: `Data successfully added to row ${targetRowIndex + 1}. Populated fields: ${populatedFields.join(', ')}`
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
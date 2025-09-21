import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface InstrumentBoundary {
  instrumentType: string;
  instrumentName: string;
  pageStart: number;
  pageEnd: number;
  confidence: number;
  keyIdentifiers: string[];
  extractedData: Record<string, any>;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    // Get user from auth token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Authorization header is required');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      throw new Error('Invalid authentication token');
    }

    const requestBody = await req.json();
    const { 
      originalDocumentId, 
      runsheetId, 
      instruments,
      startRowIndex = 0
    } = requestBody;

    console.log('📊 Creating instrument rows:', {
      originalDocumentId,
      runsheetId,
      instrumentCount: instruments.length,
      startRowIndex
    });

    // Get current runsheet data
    const { data: runsheet, error: runsheetError } = await supabase
      .from('runsheets')
      .select('data, columns')
      .eq('id', runsheetId)
      .eq('user_id', user.id)
      .single();

    if (runsheetError || !runsheet) {
      throw new Error('Runsheet not found or access denied');
    }

    const currentData = runsheet.data as Record<string, string>[];
    const availableColumns = runsheet.columns as string[];
    
    // Find the next available row index
    let nextRowIndex = currentData.length;
    if (startRowIndex !== undefined && startRowIndex >= 0) {
      nextRowIndex = Math.max(startRowIndex, currentData.length);
    }

    const results = [];

    for (let i = 0; i < instruments.length; i++) {
      const instrument = instruments[i] as InstrumentBoundary;
      const rowIndex = nextRowIndex + i;

      try {
        // Create page range document
        const { data: documentId, error: docError } = await supabase
          .rpc('create_page_range_document', {
            p_original_document_id: originalDocumentId,
            p_user_id: user.id,
            p_runsheet_id: runsheetId,
            p_row_index: rowIndex,
            p_page_start: instrument.pageStart,
            p_page_end: instrument.pageEnd,
            p_instrument_name: instrument.instrumentName
          });

        if (docError) {
          console.error('Error creating page range document:', docError);
          throw new Error(`Failed to create document for instrument: ${instrument.instrumentName}`);
        }

        console.log('📄 Created page range document:', documentId, 'for instrument:', instrument.instrumentName);

        // Prepare row data for insertion
        const rowData: Record<string, string> = {};
        
        // Initialize all columns with empty strings
        availableColumns.forEach(col => {
          rowData[col] = '';
        });

        // Fill in extracted data
        Object.entries(instrument.extractedData).forEach(([key, value]) => {
          if (availableColumns.includes(key) && value !== null && value !== undefined) {
            rowData[key] = String(value);
          }
        });

        // Add instrument metadata if there are available columns
        if (availableColumns.includes('document_type') || availableColumns.includes('type')) {
          const typeColumn = availableColumns.includes('document_type') ? 'document_type' : 'type';
          rowData[typeColumn] = instrument.instrumentType;
        }

        if (availableColumns.includes('document_name') || availableColumns.includes('name')) {
          const nameColumn = availableColumns.includes('document_name') ? 'document_name' : 'name';
          if (!rowData[nameColumn] || rowData[nameColumn] === '') {
            rowData[nameColumn] = instrument.instrumentName;
          }
        }

        // Add confidence and page info if columns exist
        if (availableColumns.includes('confidence_score')) {
          rowData['confidence_score'] = String(instrument.confidence);
        }

        if (availableColumns.includes('page_range')) {
          rowData['page_range'] = instrument.pageStart === instrument.pageEnd 
            ? String(instrument.pageStart)
            : `${instrument.pageStart}-${instrument.pageEnd}`;
        }

        // Extend the runsheet data array if needed
        const updatedData = [...currentData];
        while (updatedData.length <= rowIndex) {
          const emptyRow: Record<string, string> = {};
          availableColumns.forEach(col => {
            emptyRow[col] = '';
          });
          updatedData.push(emptyRow);
        }

        // Set the data for this row
        updatedData[rowIndex] = rowData;

        // Update the runsheet with new data
        const { error: updateError } = await supabase
          .from('runsheets')
          .update({ 
            data: updatedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', runsheetId)
          .eq('user_id', user.id);

        if (updateError) {
          console.error('Error updating runsheet:', updateError);
          throw new Error(`Failed to update runsheet for instrument: ${instrument.instrumentName}`);
        }

        results.push({
          instrumentName: instrument.instrumentName,
          rowIndex,
          documentId,
          success: true
        });

        console.log('✅ Successfully created row', rowIndex, 'for instrument:', instrument.instrumentName);

      } catch (error) {
        console.error('Error processing instrument:', instrument.instrumentName, error);
        results.push({
          instrumentName: instrument.instrumentName,
          rowIndex,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failureCount = results.length - successCount;

    console.log('🎯 Instrument processing complete:', {
      total: results.length,
      successful: successCount,
      failed: failureCount
    });

    return new Response(JSON.stringify({
      success: failureCount === 0,
      results,
      summary: {
        total: results.length,
        successful: successCount,
        failed: failureCount
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in create-instrument-rows:', error);

    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create instrument rows'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
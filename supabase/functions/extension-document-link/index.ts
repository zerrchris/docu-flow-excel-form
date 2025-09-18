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

    // Validate document blob format
    const validateDocumentBlob = (blob: string): { isValid: boolean; error?: string; mimeType?: string } => {
      if (!blob || typeof blob !== 'string') {
        return { isValid: false, error: 'No document data provided' };
      }

      // Extract MIME type from data URL
      const mimeTypeMatch = blob.match(/^data:([^;]+);base64,/);
      if (!mimeTypeMatch) {
        return { isValid: false, error: 'Invalid data format. Expected base64-encoded data URL.' };
      }

      const mimeType = mimeTypeMatch[1];
      console.log('📎 Extension document link: Detected MIME type:', mimeType);

      // Allowed MIME types for storage
      const allowedTypes = [
        'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
        'image/webp', 'image/bmp', 'image/tiff',
        'application/pdf',
        'text/plain'
      ];

      if (!allowedTypes.includes(mimeType)) {
        return { 
          isValid: false, 
          error: `Unsupported file type: ${mimeType}. Supported types: ${allowedTypes.join(', ')}`,
          mimeType 
        };
      }

      // Validate base64 data
      try {
        const base64Data = blob.split(',')[1];
        if (!base64Data || base64Data.length === 0) {
          return { isValid: false, error: 'Invalid or empty base64 data' };
        }
        
        // Test decode
        atob(base64Data.substring(0, Math.min(100, base64Data.length)));
        
        return { isValid: true, mimeType };
      } catch (error) {
        return { isValid: false, error: 'Invalid base64 encoding' };
      }
    };

    // Validate the document
    const validation = validateDocumentBlob(document_blob);
    if (!validation.isValid) {
      console.error('❌ Document validation failed:', validation.error);
      
      return new Response(
        JSON.stringify({
          success: false,
          error: validation.error,
          mimeType: validation.mimeType
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      );
    }

    console.log('✅ Document validation passed for MIME type:', validation.mimeType);

    // Convert base64 blob to binary for storage with additional validation
    const base64Data = document_blob.split(',')[1];
    
    if (!base64Data) {
      throw new Error('Invalid document data: missing base64 content');
    }

    // Validate file size before processing
    const estimatedSize = (base64Data.length * 3) / 4; // Approximate decoded size
    const maxFileSize = 50 * 1024 * 1024; // 50MB
    
    if (estimatedSize > maxFileSize) {
      throw new Error(`File too large: ${(estimatedSize / 1024 / 1024).toFixed(1)}MB exceeds 50MB limit`);
    }

    console.log('📦 Processing file size:', (estimatedSize / 1024 / 1024).toFixed(2), 'MB');

    const binaryData = atob(base64Data);
    const uint8Array = new Uint8Array(binaryData.length);
    for (let i = 0; i < binaryData.length; i++) {
      uint8Array[i] = binaryData.charCodeAt(i);
    }

    // Determine content type from validation
    const contentType = validation.mimeType || 'image/png';

    // Generate unique filename and ensure extension matches content type
    const timestamp = Date.now();
    const extForType = (mime: string): string => {
      const map: Record<string, string> = {
        'image/jpeg': 'jpg',
        'image/jpg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp',
        'image/gif': 'gif',
        'image/bmp': 'bmp',
        'image/tiff': 'tiff',
        'application/pdf': 'pdf',
        'text/plain': 'txt'
      };
      return map[mime] || 'bin';
    };

    const ensureExt = (name: string, desired: string): string => {
      const lower = name.toLowerCase();
      if (lower.endsWith(`.${desired}`)) return name;
      if (/\.[^./]+$/.test(name)) {
        return name.replace(/\.[^./]+$/, `.${desired}`);
      }
      return `${name}.${desired}`;
    };

    const baseProvidedName = filename || 'document.png';
    const adjustedName = ensureExt(baseProvidedName, extForType(contentType));
    const uniqueFilename = `extension_capture_${timestamp}_${adjustedName}`;
    const storagePath = `${user.id}/captures/${uniqueFilename}`;

    // Upload to Supabase Storage with proper content type
    const { data: uploadData, error: uploadError } = await supabaseClient.storage
      .from('documents')
      .upload(storagePath, uint8Array, {
        contentType: contentType,
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
        content_type: contentType,
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
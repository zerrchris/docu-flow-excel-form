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

    console.log('📄 Creating separate instrument files:', {
      originalDocumentId,
      runsheetId,
      instrumentCount: instruments.length,
      startRowIndex
    });

    // Get original document details
    const { data: originalDoc, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', originalDocumentId)
      .eq('user_id', user.id)
      .single();

    if (docError || !originalDoc) {
      throw new Error('Original document not found or access denied');
    }

    // Get the original PDF file
    const { data: fileData } = await supabase.storage
      .from('documents')
      .createSignedUrl(originalDoc.file_path, 3600); // 1 hour expiry

    if (!fileData?.signedUrl) {
      throw new Error('Failed to get original document URL');
    }

    // Fetch the PDF file
    const pdfResponse = await fetch(fileData.signedUrl);
    if (!pdfResponse.ok) {
      throw new Error('Failed to fetch original PDF');
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    
    // Get runsheet data for row creation
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
    
    let nextRowIndex = currentData.length;
    if (startRowIndex !== undefined && startRowIndex >= 0) {
      nextRowIndex = Math.max(startRowIndex, currentData.length);
    }

    const results = [];

    // Process each instrument
    for (let i = 0; i < instruments.length; i++) {
      const instrument = instruments[i] as InstrumentBoundary;
      const rowIndex = nextRowIndex + i;

      try {
        // Extract pages from PDF and convert to image
        const extractedImageBuffer = await extractPagesFromPDF(
          pdfBuffer, 
          instrument.pageStart, 
          instrument.pageEnd
        );

        // Generate filename for the extracted instrument
        const originalName = originalDoc.original_filename.replace(/\.[^.]*$/, '');
        const cleanInstrumentName = instrument.instrumentName
          .replace(/[^a-zA-Z0-9\-_]/g, '_')
          .substring(0, 50);
        
        const fileName = `${originalName}_${cleanInstrumentName}_pages_${instrument.pageStart}-${instrument.pageEnd}.jpg`;
        const filePath = `${user.id}/${runsheetId}/${fileName}`;

        // Upload the extracted image to storage
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, extractedImageBuffer, {
            contentType: 'image/jpeg',
            upsert: false
          });

        if (uploadError) {
          console.error('Upload error:', uploadError);
          throw new Error(`Failed to upload instrument file: ${uploadError.message}`);
        }

        // Create document record
        const { data: newDocumentId, error: docCreateError } = await supabase
          .from('documents')
          .insert({
            user_id: user.id,
            runsheet_id: runsheetId,
            row_index: rowIndex,
            original_filename: fileName,
            stored_filename: fileName,
            file_path: filePath,
            file_size: extractedImageBuffer.byteLength,
            content_type: 'image/jpeg',
            is_page_range: false // This is now a standalone file
          })
          .select('id')
          .single();

        if (docCreateError) {
          throw new Error(`Failed to create document record: ${docCreateError.message}`);
        }

        // Prepare row data
        const rowData: Record<string, string> = {};
        availableColumns.forEach(col => rowData[col] = '');

        // Fill in extracted data
        Object.entries(instrument.extractedData).forEach(([key, value]) => {
          if (availableColumns.includes(key) && value !== null && value !== undefined) {
            rowData[key] = String(value);
          }
        });

        // Add instrument metadata
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

        // Update runsheet data
        const updatedData = [...currentData];
        while (updatedData.length <= rowIndex) {
          const emptyRow: Record<string, string> = {};
          availableColumns.forEach(col => emptyRow[col] = '');
          updatedData.push(emptyRow);
        }

        updatedData[rowIndex] = rowData;

        // Update the runsheet
        const { error: updateError } = await supabase
          .from('runsheets')
          .update({ 
            data: updatedData,
            updated_at: new Date().toISOString()
          })
          .eq('id', runsheetId)
          .eq('user_id', user.id);

        if (updateError) {
          throw new Error(`Failed to update runsheet: ${updateError.message}`);
        }

        results.push({
          instrumentName: instrument.instrumentName,
          rowIndex,
          documentId: newDocumentId.id,
          fileName,
          success: true
        });

        console.log('✅ Created instrument file and row:', fileName);

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
    console.error('Error in create-separate-instrument-files:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create instrument files'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

// Helper function to extract specific pages from PDF and convert to image
async function extractPagesFromPDF(
  pdfBuffer: ArrayBuffer, 
  pageStart: number, 
  pageEnd: number
): Promise<ArrayBuffer> {
  try {
    // Import PDF-lib for PDF manipulation
    const { PDFDocument } = await import('https://esm.sh/pdf-lib@1.17.1');
    
    // Load the original PDF
    const originalPdf = await PDFDocument.load(pdfBuffer);
    const totalPages = originalPdf.getPageCount();
    
    // Validate page range
    const startPage = Math.max(1, Math.min(pageStart, totalPages));
    const endPage = Math.max(startPage, Math.min(pageEnd, totalPages));
    
    // Create new PDF with extracted pages
    const newPdf = await PDFDocument.create();
    
    // Copy pages (PDF-lib uses 0-based indexing)
    for (let i = startPage - 1; i < endPage; i++) {
      const [copiedPage] = await newPdf.copyPages(originalPdf, [i]);
      newPdf.addPage(copiedPage);
    }
    
    // Save the new PDF as bytes
    const extractedPdfBytes = await newPdf.save();
    
    // Convert to image using PDF.js
    const pdfJs = await import('https://esm.sh/pdfjs-dist@4.0.379/build/pdf.min.mjs');
    
    // Configure PDF.js worker
    pdfJs.GlobalWorkerOptions.workerSrc = 'https://esm.sh/pdfjs-dist@4.0.379/build/pdf.worker.min.mjs';
    
    // Load the extracted PDF
    const loadingTask = pdfJs.getDocument({ data: extractedPdfBytes });
    const pdf = await loadingTask.promise;
    
    // Create canvas for rendering
    const canvas = new OffscreenCanvas(1, 1);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Could not get canvas context');
    
    const images: ImageData[] = [];
    
    // Render each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const viewport = page.getViewport({ scale: 2.0 }); // High resolution
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({
        canvasContext: context,
        viewport: viewport
      }).promise;
      
      images.push(context.getImageData(0, 0, canvas.width, canvas.height));
    }
    
    // Combine images vertically if multiple pages
    const totalHeight = images.reduce((sum, img) => sum + img.height, 0);
    const maxWidth = Math.max(...images.map(img => img.width));
    
    const finalCanvas = new OffscreenCanvas(maxWidth, totalHeight);
    const finalContext = finalCanvas.getContext('2d');
    if (!finalContext) throw new Error('Could not get final canvas context');
    
    let currentY = 0;
    for (const imageData of images) {
      finalContext.putImageData(imageData, 0, currentY);
      currentY += imageData.height;
    }
    
    // Convert to JPEG blob
    const blob = await finalCanvas.convertToBlob({ 
      type: 'image/jpeg', 
      quality: 0.9 
    });
    
    return await blob.arrayBuffer();
    
  } catch (error) {
    console.error('Error extracting pages from PDF:', error);
    throw new Error(`Failed to extract pages ${pageStart}-${pageEnd}: ${error.message}`);
  }
}
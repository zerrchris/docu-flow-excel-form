import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('PDF conversion request received');
    
    // Get the PDF file from the request
    const formData = await req.formData();
    const pdfFile = formData.get('pdf') as File;
    
    if (!pdfFile) {
      throw new Error('No PDF file provided');
    }
    
    console.log('Processing PDF:', pdfFile.name, 'Size:', pdfFile.size);
    
    // Convert file to base64 for response
    const arrayBuffer = await pdfFile.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);
    
    // For now, return a simple response indicating we received the file
    // In a full implementation, you'd use a PDF processing library here
    console.log('PDF file received successfully');
    
    // Return success response with file info
    return new Response(JSON.stringify({
      success: true,
      message: 'PDF received successfully',
      fileName: pdfFile.name,
      fileSize: pdfFile.size,
      // For now, we'll return the original file back as base64
      // In production, this would be converted images
      convertedImages: [{
        pageNumber: 1,
        data: btoa(String.fromCharCode(...uint8Array)),
        type: 'image/png'
      }]
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error('Error in PDF conversion:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'PDF conversion failed' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
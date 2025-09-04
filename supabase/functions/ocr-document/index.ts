import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const googleCloudApiKey = Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');

serve(async (req) => {
  console.log('OCR document function called with method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageData, documentType = 'general', extractTables = false, runsheetId, rowIndex } = await req.json();
    
    if (!imageData) {
      return new Response(
        JSON.stringify({ error: 'Image data is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting OCR process for document type:', documentType);

    let ocrResult;
    
    // Try Google Cloud Vision API if available
    if (googleCloudApiKey) {
      console.log('Using Google Cloud Vision API for OCR');
      ocrResult = await performGoogleCloudOCR(imageData, extractTables);
    } else {
      console.log('Google Cloud Vision API not configured, using OpenAI vision as fallback');
      ocrResult = await performOpenAIOCR(imageData, documentType);
    }

    // Store OCR result in database for persistence
    if (runsheetId && rowIndex !== undefined) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      await supabase
        .from('document_ocr_data')
        .upsert({
          runsheet_id: runsheetId,
          row_index: rowIndex,
          extracted_text: ocrResult.fullText,
          structured_data: ocrResult.structuredData,
          confidence_score: ocrResult.confidence,
          processing_method: ocrResult.method,
          created_at: new Date().toISOString()
        });
      
      console.log('OCR result stored in database');
    }

    return new Response(
      JSON.stringify({
        success: true,
        extractedText: ocrResult.fullText,
        structuredData: ocrResult.structuredData,
        confidence: ocrResult.confidence,
        method: ocrResult.method,
        recommendations: ocrResult.recommendations
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('OCR processing error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'OCR processing failed',
        details: error.message,
        recommendations: [
          'Ensure image is high quality (300+ DPI)',
          'Use clear, high-contrast images',
          'For best results, configure Google Cloud Vision API key'
        ]
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function performGoogleCloudOCR(imageData: string, extractTables: boolean) {
  console.log('Processing with Google Cloud Vision API');
  
  // Remove data URL prefix
  const base64Image = imageData.split(',')[1];
  
  const requestBody = {
    requests: [{
      image: { content: base64Image },
      features: [
        { type: 'DOCUMENT_TEXT_DETECTION' },
        ...(extractTables ? [{ type: 'OBJECT_LOCALIZATION' }] : [])
      ],
      imageContext: {
        languageHints: ['en', 'es', 'fr', 'de'] // Support multiple languages
      }
    }]
  };

  const response = await fetch(
    `https://vision.googleapis.com/v1/images:annotate?key=${googleCloudApiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    throw new Error(`Google Cloud Vision API error: ${response.statusText}`);
  }

  const data = await response.json();
  const annotation = data.responses[0];
  
  if (annotation.error) {
    throw new Error(`Vision API error: ${annotation.error.message}`);
  }

  // Extract full text
  const fullText = annotation.fullTextAnnotation?.text || '';
  
  // Calculate confidence score
  const confidence = annotation.fullTextAnnotation?.pages?.[0]?.confidence || 0.5;
  
  // Extract structured data from text blocks
  const structuredData = extractStructuredData(annotation.textAnnotations || [], fullText);

  return {
    fullText,
    structuredData,
    confidence,
    method: 'Google Cloud Vision API',
    recommendations: confidence < 0.7 ? [
      'Image quality may be low - try higher resolution',
      'Ensure good lighting and contrast',
      'Check for skewed or rotated text'
    ] : []
  };
}

async function performOpenAIOCR(imageData: string, documentType: string) {
  console.log('Processing with OpenAI Vision API as fallback');
  
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('No OCR API configured. Please add Google Cloud Vision API key or OpenAI API key.');
  }

  // Create document-specific prompts for better extraction
  const prompts = {
    invoice: 'Extract all text from this invoice. Focus on: invoice number, date, amounts, customer details, line items. Return as structured JSON.',
    receipt: 'Extract all text from this receipt. Focus on: merchant name, date, total amount, items purchased, payment method. Return as structured JSON.',
    form: 'Extract all text from this form. Preserve field labels and values. Return as structured JSON.',
    general: 'Extract all visible text from this document. Maintain structure and formatting. Return as structured JSON.'
  };

  const prompt = prompts[documentType as keyof typeof prompts] || prompts.general;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${openAIApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { 
          role: 'system', 
          content: 'You are an expert OCR assistant. Extract text accurately and return structured JSON data.' 
        },
        { 
          role: 'user', 
          content: [
            { type: 'text', text: prompt },
            { 
              type: 'image_url', 
              image_url: { url: imageData, detail: 'high' } 
            }
          ]
        }
      ],
      max_tokens: 2000,
      temperature: 0.1,
      response_format: { type: "json_object" }
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI API error: ${response.statusText}`);
  }

  const data = await response.json();
  const result = JSON.parse(data.choices[0].message.content);
  
  return {
    fullText: result.fullText || JSON.stringify(result, null, 2),
    structuredData: result,
    confidence: 0.8, // OpenAI doesn't provide confidence scores
    method: 'OpenAI Vision API',
    recommendations: [
      'For better accuracy, configure Google Cloud Vision API',
      'Ensure high-quality, well-lit images',
      'Use specific document types for better extraction'
    ]
  };
}

function extractStructuredData(textAnnotations: any[], fullText: string) {
  // Basic structured data extraction from OCR results
  const data: any = {};
  
  // Common patterns for different document types
  const patterns = {
    dates: /\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}\b/g,
    amounts: /\$[\d,]+\.?\d*/g,
    emails: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
    phones: /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/g,
    invoiceNumbers: /(?:invoice|inv|#)\s*:?\s*([A-Z0-9\-]+)/gi
  };

  // Extract common data types
  data.dates = fullText.match(patterns.dates) || [];
  data.amounts = fullText.match(patterns.amounts) || [];
  data.emails = fullText.match(patterns.emails) || [];
  data.phones = fullText.match(patterns.phones) || [];
  data.invoiceNumbers = fullText.match(patterns.invoiceNumbers) || [];
  
  // Extract key-value pairs (simple heuristic)
  const lines = fullText.split('\n');
  data.keyValuePairs = {};
  
  lines.forEach(line => {
    const colonMatch = line.match(/^([^:]+):\s*(.+)$/);
    if (colonMatch) {
      const key = colonMatch[1].trim();
      const value = colonMatch[2].trim();
      if (key && value) {
        data.keyValuePairs[key] = value;
      }
    }
  });

  return data;
}
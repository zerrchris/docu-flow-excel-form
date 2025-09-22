import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import "https://deno.land/x/xhr@0.1.0/mod.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Define the structured schema for real estate document extraction
const REAL_ESTATE_SCHEMA = {
  name: "RealEstateRecord",
  schema: {
    type: "object",
    required: ["instrument_number", "recording_date", "instrument_type", "grantor", "grantee", "book_page"],
    properties: {
      instrument_number: { 
        type: "string", 
        description: "The instrument or document number (e.g., '2023-001234', 'DOC#456789')"
      },
      book_page: { 
        type: "string", 
        description: "Book and page reference (e.g., 'Book 123, Page 456', 'Vol. 45, Pg. 678')"
      },
      instrument_type: { 
        type: "string", 
        description: "Type of legal document (Warranty Deed, Quit Claim Deed, Mortgage, etc.)"
      },
      recording_date: { 
        type: "string", 
        format: "date",
        description: "Date when document was recorded at courthouse (MM/DD/YYYY format)"
      },
      document_date: { 
        type: "string", 
        format: "date", 
        description: "Date when document was originally signed/executed (MM/DD/YYYY format)"
      },
      grantor: { 
        type: "string", 
        description: "Full legal name(s) of person(s) transferring rights, including titles and addresses"
      },
      grantee: { 
        type: "string", 
        description: "Full legal name(s) of person(s) receiving rights, including titles and addresses"
      },
      legal_description: { 
        type: "string", 
        description: "Complete legal property description including lot, block, subdivision, section-township-range"
      },
      notes: { 
        type: "string", 
        description: "Additional important information including: mineral reservations/exceptions, surface/subsurface rights, oil/gas/water rights, easements, restrictions, liens, conditions, attorney names, notary info, etc. CRITICAL: Always extract any mention of mineral rights, mineral reservations, or exceptions to mineral conveyance."
      },
      confidence_score: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Overall confidence in extraction accuracy (0-1)"
      },
      citations: {
        type: "array",
        items: {
          type: "object",
          required: ["field", "page_number", "quote"],
          properties: {
            field: { type: "string" },
            page_number: { type: "number" },
            quote: { type: "string" }
          },
          additionalProperties: false
        },
        description: "Source citations for each extracted field"
      }
    },
    additionalProperties: false
  },
  strict: true
} as const;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { 
      fileUrl, 
      fileName, 
      contentType,
      columnInstructions = {},
      useVision = false 
    } = await req.json()
    
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)
    
    // Fetch global extraction instructions from admin settings
    let globalInstructions = ''
    try {
      const { data, error } = await supabase
        .from('admin_settings')
        .select('setting_value')
        .eq('setting_key', 'global_extraction_instructions')
        .maybeSingle()
      
      if (!error && data?.setting_value) {
        globalInstructions = data.setting_value
      }
    } catch (error) {
      console.error('Error fetching global instructions:', error)
    }

    console.log('🔍 Starting advanced document analysis:', { fileName, contentType, useVision })

    if (!fileUrl) {
      throw new Error('File URL is required')
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured')
    }


    let extractedData: any = null
    let method = 'unknown'

    // Force single consistent method: Always use vision for deterministic results
    // This eliminates the dual-path inconsistency described in the feedback
    console.log('👁️ Using Vision model approach for consistent results')
    extractedData = await extractWithVision(fileUrl, fileName, openAIApiKey, columnInstructions, globalInstructions)
    method = 'vision_only'
    
    /* 
    COMMENTED OUT: Dual-path file search method causes inconsistent results
    The file search path can give different results than vision because:
    1. Vector store indexing may not be complete when queried
    2. File search reads indexed text vs vision re-OCRs images
    3. This creates non-deterministic behavior
    
    // Method 1: Try OpenAI File Search for PDFs (best accuracy)
    if (contentType === 'application/pdf' && !useVision) {
      try {
        console.log('📄 Trying OpenAI File Search method for PDF')
        extractedData = await extractWithFileSearch(fileUrl, fileName, openAIApiKey, columnInstructions, globalInstructions)
        method = 'file_search'
      } catch (error) {
        console.log('⚠️ File Search failed, will try vision fallback:', error.message)
      }
    }
    */

    // Validate and enhance results
    const validatedData = await validateAndEnhance(extractedData, openAIApiKey)

    console.log('✅ Analysis complete:', { 
      method, 
      confidence: validatedData.confidence_score,
      fields_extracted: Object.keys(validatedData).filter(k => validatedData[k] && k !== 'confidence_score').length
    })

    return new Response(JSON.stringify({
      success: true,
      data: validatedData,
      metadata: {
        extraction_method: method,
        processing_time: Date.now(),
        file_name: fileName
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('❌ Document analysis error:', error)
    return new Response(JSON.stringify({ 
      success: false, 
      error: error.message,
      details: error.stack 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})

async function extractWithFileSearch(fileUrl: string, fileName: string, apiKey: string, columnInstructions: any, globalInstructions: string = '') {
  console.log('🔄 Creating vector store and uploading file')
  
  // Download file to upload to OpenAI
  const fileResponse = await fetch(fileUrl)
  if (!fileResponse.ok) {
    throw new Error(`Failed to fetch file: ${fileResponse.statusText}`)
  }
  
  const fileBlob = await fileResponse.blob()
  
  // Create vector store
  const vectorStoreResponse = await fetch('https://api.openai.com/v1/vector_stores', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: `real-estate-doc-${Date.now()}`
    })
  })
  
  if (!vectorStoreResponse.ok) {
    throw new Error(`Failed to create vector store: ${await vectorStoreResponse.text()}`)
  }
  
  const vectorStore = await vectorStoreResponse.json()
  console.log('📦 Vector store created:', vectorStore.id)
  
  // Upload file to OpenAI
  const formData = new FormData()
  formData.append('file', fileBlob, fileName)
  formData.append('purpose', 'assistants')
  
  const fileUploadResponse = await fetch('https://api.openai.com/v1/files', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
    },
    body: formData
  })
  
  if (!fileUploadResponse.ok) {
    throw new Error(`Failed to upload file: ${await fileUploadResponse.text()}`)
  }
  
  const uploadedFile = await fileUploadResponse.json()
  console.log('📄 File uploaded to OpenAI:', uploadedFile.id)
  
  // Add file to vector store
  await fetch(`https://api.openai.com/v1/vector_stores/${vectorStore.id}/files`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_id: uploadedFile.id
    })
  })
  
  // Wait for file processing
  await new Promise(resolve => setTimeout(resolve, 3000))
  
  // Create extraction prompt with column instructions
  const instructionText = Object.entries(columnInstructions)
    .map(([field, instruction]) => `${field}: ${instruction}`)
    .join('\n')
  
  const prompt = `Extract real estate document information using the JSON schema provided. 
${instructionText ? `\nSpecial field instructions:\n${instructionText}\n` : ''}
${globalInstructions ? `\nGlobal Admin Instructions: ${globalInstructions}\n` : ''}

CRITICAL RULES:
- Use file_search to find relevant text passages
- Extract ONLY information that appears verbatim in the document
- If a field is not clearly present, return an empty string (do NOT guess or fabricate)
- Include exact quotes and page numbers in citations array
- Set confidence_score based on text clarity and completeness
- For dates, use MM/DD/YYYY format consistently`

  // Use Chat Completions with file search (since Responses API might not be available)
  const completionResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ],
      tools: [{ type: 'file_search' }],
      tool_resources: {
        file_search: {
          vector_store_ids: [vectorStore.id]
        }
      },
      response_format: { 
        type: 'json_schema',
        json_schema: REAL_ESTATE_SCHEMA
      },
      temperature: 0.0,  // Zero temperature for deterministic results
      seed: 12345        // Fixed seed for reproducibility
    })
  })
  
  if (!completionResponse.ok) {
    throw new Error(`OpenAI API error: ${await completionResponse.text()}`)
  }
  
  const completion = await completionResponse.json()
  
  // Clean up - delete vector store and file
  try {
    await fetch(`https://api.openai.com/v1/vector_stores/${vectorStore.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
    await fetch(`https://api.openai.com/v1/files/${uploadedFile.id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${apiKey}` }
    })
  } catch (cleanupError) {
    console.warn('⚠️ Cleanup warning:', cleanupError.message)
  }
  
  return JSON.parse(completion.choices[0].message.content)
}

async function extractWithVision(fileUrl: string, apiKey: string, columnInstructions: any, globalInstructions: string = '') {
  console.log('👁️ Using vision model for extraction')
  
  const instructionText = Object.entries(columnInstructions)
    .map(([field, instruction]) => `${field}: ${instruction}`)
    .join('\n')
  
  const prompt = `Analyze this real estate document image and extract information using the JSON schema.
${instructionText ? `\nSpecial field instructions:\n${instructionText}\n` : ''}
${globalInstructions ? `\nGlobal Admin Instructions: ${globalInstructions}\n` : ''}

CRITICAL RULES:
- Extract ONLY text that is clearly visible in the image
- If text is unclear or not present, return empty string
- Pay special attention to stamps, seals, and handwritten notes
- For dates, use MM/DD/YYYY format consistently
- Set confidence_score based on image quality and text clarity`

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: fileUrl } }
          ]
        }
      ],
      response_format: { 
        type: 'json_schema',
        json_schema: REAL_ESTATE_SCHEMA
      },
      temperature: 0.0,  // Zero temperature for deterministic results
      seed: 12345        // Fixed seed for reproducibility
    })
  })
  
  if (!response.ok) {
    throw new Error(`Vision API error: ${await response.text()}`)
  }
  
  const completion = await response.json()
  return JSON.parse(completion.choices[0].message.content)
}

async function validateAndEnhance(data: any, apiKey: string): Promise<any> {
  console.log('🔍 Validating extracted data')
  
  // Basic validation patterns
  const validations = {
    recording_date: /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/,
    document_date: /^\d{2}\/\d{2}\/\d{4}$|^\d{4}-\d{2}-\d{2}$/,
    instrument_number: /^[0-9A-Za-z\-#]+$/
  }
  
  let needsRetry = false
  const failedFields: string[] = []
  
  // Check validation patterns
  for (const [field, pattern] of Object.entries(validations)) {
    if (data[field] && !pattern.test(data[field])) {
      needsRetry = true
      failedFields.push(field)
    }
  }
  
  // Check for required fields
  const requiredFields = ['instrument_number', 'recording_date', 'instrument_type', 'grantor', 'grantee']
  for (const field of requiredFields) {
    if (!data[field] || data[field].trim() === '') {
      needsRetry = true
      failedFields.push(field)
    }
  }
  
  // If validation fails and we have low confidence, don't retry to avoid infinite loops
  if (needsRetry && data.confidence_score > 0.3 && failedFields.length <= 2) {
    console.log(`⚠️ Validation failed for fields: ${failedFields.join(', ')}. Confidence too low for retry.`)
  }
  
  // Normalize date formats
  if (data.recording_date && data.recording_date.includes('-')) {
    const date = new Date(data.recording_date)
    data.recording_date = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`
  }
  
  if (data.document_date && data.document_date.includes('-')) {
    const date = new Date(data.document_date)
    data.document_date = `${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getDate().toString().padStart(2, '0')}/${date.getFullYear()}`
  }
  
  return data
}
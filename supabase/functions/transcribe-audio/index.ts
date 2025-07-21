import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Process base64 in chunks to prevent memory issues
function processBase64Chunks(base64String: string, chunkSize = 32768) {
  const chunks: Uint8Array[] = [];
  let position = 0;
  
  while (position < base64String.length) {
    const chunk = base64String.slice(position, position + chunkSize);
    const binaryChunk = atob(chunk);
    const bytes = new Uint8Array(binaryChunk.length);
    
    for (let i = 0; i < binaryChunk.length; i++) {
      bytes[i] = binaryChunk.charCodeAt(i);
    }
    
    chunks.push(bytes);
    position += chunkSize;
  }

  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;

  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }

  return result;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { audio, format = 'webm' } = await req.json();
    
    if (!audio) {
      throw new Error('No audio data provided');
    }

    const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAIApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    console.log('Processing audio for transcription, format:', format);

    // Process audio in chunks to prevent memory issues
    const binaryAudio = processBase64Chunks(audio);
    
    // Prepare form data for OpenAI Whisper API
    const formData = new FormData();
    const blob = new Blob([binaryAudio], { 
      type: format === 'mp3' ? 'audio/mpeg' : 'audio/webm' 
    });
    const filename = format === 'mp3' ? 'audio.mp3' : 'audio.webm';
    formData.append('file', blob, filename);
    formData.append('model', 'whisper-1');
    formData.append('language', 'en'); // Optimize for English
    formData.append('response_format', 'json');

    console.log('Sending audio to OpenAI Whisper API...');

    // Send to OpenAI Whisper API
    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAIApiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI Whisper API error:', response.status, errorText);
      throw new Error(`OpenAI Whisper API error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    console.log('Whisper transcription result:', result);

    return new Response(JSON.stringify({
      success: true,
      text: result.text,
      language: result.language || 'en'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in audio transcription function:', error);
    return new Response(JSON.stringify({ 
      success: false,
      error: error.message,
      text: null
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
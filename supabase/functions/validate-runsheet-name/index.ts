import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface ValidateNameRequest {
  name: string;
  runsheetId?: string; // Optional for checking existing names
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'No authorization header' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { data: { user }, error: userError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const { name, runsheetId }: ValidateNameRequest = await req.json();

    // Validate name format and content
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Runsheet name cannot be empty' 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (trimmedName.length < 2) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Runsheet name must be at least 2 characters long' 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    if (trimmedName.length > 100) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Runsheet name cannot exceed 100 characters' 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check for forbidden names
    const forbiddenNames = [
      'untitled',
      'untitled runsheet',
      'new runsheet',
      'runsheet',
      'default',
      'temp',
      'temporary'
    ];
    
    if (forbiddenNames.includes(trimmedName.toLowerCase())) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Please choose a more descriptive name' 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check for only special characters or numbers
    if (!/[a-zA-Z]/.test(trimmedName)) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Runsheet name must contain at least one letter' 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Check for duplicate names for this user (excluding current runsheet if editing)
    let duplicateQuery = supabase
      .from('runsheets')
      .select('id')
      .eq('user_id', user.id)
      .eq('name', trimmedName);

    if (runsheetId) {
      duplicateQuery = duplicateQuery.neq('id', runsheetId);
    }

    const { data: duplicates, error: duplicateError } = await duplicateQuery;

    if (duplicateError) {
      console.error('Error checking for duplicates:', duplicateError);
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'Error validating name' 
        }),
        { status: 500, headers: corsHeaders }
      );
    }

    if (duplicates && duplicates.length > 0) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: 'A runsheet with this name already exists' 
        }),
        { status: 200, headers: corsHeaders }
      );
    }

    // Name is valid
    return new Response(
      JSON.stringify({ 
        valid: true,
        name: trimmedName
      }),
      { status: 200, headers: corsHeaders }
    );

  } catch (error) {
    console.error('Error in validate-runsheet-name function:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: corsHeaders }
    );
  }
});
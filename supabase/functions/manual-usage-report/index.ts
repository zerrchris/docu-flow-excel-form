import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[MANUAL-USAGE-REPORT] Starting manual usage report");

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('No authorization header');
    }

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { 
        global: { 
          headers: { Authorization: authHeader } 
        } 
      }
    );

    // Get current user
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      throw new Error('User not authenticated');
    }

    console.log("[MANUAL-USAGE-REPORT] User authenticated:", user.id);

    // Call the report-usage-to-stripe function
    const { data, error } = await supabaseClient.functions.invoke('report-usage-to-stripe', {
      body: {}
    });

    if (error) {
      console.error("[MANUAL-USAGE-REPORT] Error calling report function:", error);
      throw error;
    }

    console.log("[MANUAL-USAGE-REPORT] Report function response:", data);

    return new Response(JSON.stringify({
      success: true,
      message: "Usage report triggered successfully",
      details: data
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    console.error("[MANUAL-USAGE-REPORT] Error:", error);
    return new Response(JSON.stringify({ 
      error: error.message 
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
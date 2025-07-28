import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Helper logging function for enhanced debugging
const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[ADMIN-MANAGE-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Use the service role key to perform admin operations
  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    logStep("Function started");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Check if user is admin
    const { data: roleData, error: roleError } = await supabaseClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .single();

    if (roleError || !roleData) {
      throw new Error("Access denied: User is not an admin");
    }
    logStep("Admin access verified");

    const { action, target_user_id, subscription_data } = await req.json();
    logStep("Request parsed", { action, target_user_id, subscription_data });

    switch (action) {
      case 'grant_free_access': {
        if (!target_user_id) throw new Error("target_user_id is required");
        
        // Get target user's email
        const { data: targetUser, error: targetUserError } = await supabaseClient.auth.admin.getUserById(target_user_id);
        if (targetUserError || !targetUser.user?.email) {
          throw new Error("Target user not found");
        }
        
        const { tier = 'Admin Granted', duration_days = 365 } = subscription_data || {};
        const subscriptionEnd = new Date();
        subscriptionEnd.setDate(subscriptionEnd.getDate() + duration_days);
        
        // Upsert subscription record
        const { error: upsertError } = await supabaseClient
          .from('subscribers')
          .upsert({
            email: targetUser.user.email,
            user_id: target_user_id,
            stripe_customer_id: null,
            subscribed: true,
            subscription_tier: tier,
            subscription_end: subscriptionEnd.toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'email' });

        if (upsertError) throw upsertError;
        
        logStep("Free access granted", { target_user_id, tier, subscription_end: subscriptionEnd.toISOString() });
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Free access granted successfully",
          subscription_end: subscriptionEnd.toISOString()
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'revoke_access': {
        if (!target_user_id) throw new Error("target_user_id is required");
        
        // Get target user's email
        const { data: targetUser, error: targetUserError } = await supabaseClient.auth.admin.getUserById(target_user_id);
        if (targetUserError || !targetUser.user?.email) {
          throw new Error("Target user not found");
        }
        
        // Update subscription record to revoked
        const { error: updateError } = await supabaseClient
          .from('subscribers')
          .upsert({
            email: targetUser.user.email,
            user_id: target_user_id,
            stripe_customer_id: null,
            subscribed: false,
            subscription_tier: null,
            subscription_end: null,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'email' });

        if (updateError) throw updateError;
        
        logStep("Access revoked", { target_user_id });
        return new Response(JSON.stringify({ 
          success: true, 
          message: "Access revoked successfully"
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      case 'get_all_subscriptions': {
        // Get all subscribers with their details
        const { data: subscribers, error: subscribersError } = await supabaseClient
          .from('subscribers')
          .select('*')
          .order('updated_at', { ascending: false });

        if (subscribersError) throw subscribersError;
        
        logStep("Retrieved all subscriptions", { count: subscribers?.length || 0 });
        return new Response(JSON.stringify({ 
          success: true, 
          subscribers: subscribers || []
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in admin-manage-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
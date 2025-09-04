import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log("[CUSTOMER-PORTAL] Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.log("[CUSTOMER-PORTAL] ERROR: STRIPE_SECRET_KEY is not set");
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    console.log("[CUSTOMER-PORTAL] Stripe key verified");

    // Get user from JWT (automatically verified by Supabase when verify_jwt = true)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[CUSTOMER-PORTAL] ERROR: No authorization header provided");
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    console.log("[CUSTOMER-PORTAL] Token found, creating Supabase client");

    // Use anon key for auth verification
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) {
      console.log("[CUSTOMER-PORTAL] ERROR: Authentication error:", userError.message);
      throw new Error(`Authentication error: ${userError.message}`);
    }
    const user = userData.user;
    if (!user?.email) {
      console.log("[CUSTOMER-PORTAL] ERROR: User not authenticated or email not available");
      throw new Error("User not authenticated or email not available");
    }
    console.log("[CUSTOMER-PORTAL] User authenticated:", { userId: user.id, email: user.email });

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    console.log("[CUSTOMER-PORTAL] Looking up customer by email:", user.email);
    const customers = await stripe.customers.list({ email: user.email, limit: 1 });
    let customerId;
    
    if (customers.data.length === 0) {
      console.log("[CUSTOMER-PORTAL] No customer found, creating new customer");
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { user_id: user.id }
      });
      customerId = customer.id;
      console.log("[CUSTOMER-PORTAL] Created new Stripe customer:", customerId);
    } else {
      customerId = customers.data[0].id;
      console.log("[CUSTOMER-PORTAL] Found existing Stripe customer:", customerId);
    }

    const origin = req.headers.get("origin") || "https://9e913707-5b2b-41be-9c86-3541992b5349.sandbox.lovable.dev";
    console.log("[CUSTOMER-PORTAL] Creating portal session with return URL:", `${origin}/`);
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`,
    });
    console.log("[CUSTOMER-PORTAL] Success! Portal session created:", portalSession.id);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("[CUSTOMER-PORTAL] ERROR:", errorMessage);
    console.log("[CUSTOMER-PORTAL] Full error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
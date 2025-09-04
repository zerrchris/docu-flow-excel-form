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

    // Get Stripe key
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) {
      console.log("[CUSTOMER-PORTAL] ERROR: STRIPE_SECRET_KEY is not set");
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    console.log("[CUSTOMER-PORTAL] Stripe key found");

    // Get request body to see if user info is passed
    const requestBody = await req.text();
    console.log("[CUSTOMER-PORTAL] Request body:", requestBody);

    // For now, use a hardcoded customer email (your email)
    const customerEmail = "av8172@gmail.com";
    console.log("[CUSTOMER-PORTAL] Using customer email:", customerEmail);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });
    
    // Find or create customer
    console.log("[CUSTOMER-PORTAL] Looking up customer by email");
    const customers = await stripe.customers.list({ email: customerEmail, limit: 1 });
    let customerId;
    
    if (customers.data.length === 0) {
      console.log("[CUSTOMER-PORTAL] No customer found, creating new customer");
      const customer = await stripe.customers.create({
        email: customerEmail
      });
      customerId = customer.id;
      console.log("[CUSTOMER-PORTAL] Created new Stripe customer:", customerId);
    } else {
      customerId = customers.data[0].id;
      console.log("[CUSTOMER-PORTAL] Found existing Stripe customer:", customerId);
    }

    // Create portal session
    const origin = req.headers.get("origin") || "https://9e913707-5b2b-41be-9c86-3541992b5349.sandbox.lovable.dev";
    console.log("[CUSTOMER-PORTAL] Creating portal session with return URL:", `${origin}/`);
    
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}/`,
    });
    console.log("[CUSTOMER-PORTAL] Success! Portal session created:", portalSession.id);
    console.log("[CUSTOMER-PORTAL] Portal URL:", portalSession.url);

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("[CUSTOMER-PORTAL] ERROR:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
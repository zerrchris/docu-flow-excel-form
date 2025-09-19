import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const sanitizeUrl = (value: string | null | undefined) => {
  if (!value) return null;
  try {
    const url = new URL(value);
    // Ensure we always return the origin so Stripe only sees allowed domains
    return url.origin;
  } catch (_error) {
    return null;
  }
};

const resolveReturnUrl = (req: Request) => {
  const origin = sanitizeUrl(req.headers.get("origin"));
  if (origin) return `${origin}/`;

  const referer = sanitizeUrl(req.headers.get("referer"));
  if (referer) return `${referer}/`;

  const envUrl = sanitizeUrl(Deno.env.get("CUSTOMER_PORTAL_RETURN_URL") ?? Deno.env.get("SITE_URL"));
  if (envUrl) return `${envUrl}/`;

  // Final fallback to Lovable preview domain (mainly for local dev/testing)
  return "https://9e913707-5b2b-41be-9c86-3541992b5349.sandbox.lovable.dev/";
};

const ensurePortalConfiguration = async (stripe: Stripe) => {
  const existingConfigurations = await stripe.billingPortal.configurations.list({ limit: 1 });
  if (existingConfigurations.data.length > 0) {
    return existingConfigurations.data[0];
  }

  console.log("[CUSTOMER-PORTAL] No billing portal configuration found. Creating default configuration");

  return await stripe.billingPortal.configurations.create({
    business_profile: {
      headline: Deno.env.get("CUSTOMER_PORTAL_HEADLINE") ?? "Manage your RunsheetPro subscription",
    },
    features: {
      customer_update: {
        enabled: true,
        allowed_updates: ["email", "phone", "address"],
      },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: {
        enabled: true,
        mode: "at_period_end",
      },
    },
  });
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

    // Initialize Supabase client
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? ""
    );

    // Get authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.log("[CUSTOMER-PORTAL] ERROR: No authorization header");
      throw new Error("No authorization header provided");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError || !userData.user?.email) {
      console.log("[CUSTOMER-PORTAL] ERROR: User authentication failed", userError);
      throw new Error("User not authenticated or email not available");
    }

    const customerEmail = userData.user.email;
    console.log("[CUSTOMER-PORTAL] Using customer email:", customerEmail);

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    const configuration = await ensurePortalConfiguration(stripe);
    console.log("[CUSTOMER-PORTAL] Using billing portal configuration:", configuration.id);
    
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
    const returnUrl = resolveReturnUrl(req);
    console.log("[CUSTOMER-PORTAL] Creating portal session with return URL:", returnUrl);
    console.log("[CUSTOMER-PORTAL] Customer ID:", customerId);
    
    try {
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
        configuration: configuration.id,
      });
      console.log("[CUSTOMER-PORTAL] Success! Portal session created:", portalSession.id);
      console.log("[CUSTOMER-PORTAL] Portal URL:", portalSession.url);
      
      return new Response(JSON.stringify({ url: portalSession.url }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    } catch (stripeError) {
      console.log("[CUSTOMER-PORTAL] Stripe portal creation failed:", stripeError);
      
      try {
        console.log("[CUSTOMER-PORTAL] Stripe error details:", JSON.stringify(stripeError, null, 2));
      } catch (_jsonError) {
        // ignore JSON stringify issues
      }

      // Surface a more descriptive error message to the client when possible
      if (stripeError && typeof stripeError === "object" && "message" in stripeError) {
        const message = (stripeError as { message?: string }).message ?? "Stripe portal session creation failed";
        throw new Error(message);
      }

      throw new Error("Stripe portal session creation failed");
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.log("[CUSTOMER-PORTAL] ERROR:", errorMessage);
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
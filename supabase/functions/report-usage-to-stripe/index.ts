import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  console.log(`[REPORT-USAGE] ${step}${details ? ` - ${JSON.stringify(details)}` : ''}`);
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");

    // This function can be called without auth for automated reporting
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const stripe = new Stripe(stripeKey, { apiVersion: "2023-10-16" });

    // Get usage data from the last hour that hasn't been reported
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    const { data: usageData, error: usageError } = await supabaseClient
      .from('ai_usage_analytics')
      .select('user_id, estimated_cost_usd, created_at, id')
      .gt('created_at', oneHourAgo)
      .is('stripe_reported_at', null);

    if (usageError) throw usageError;

    logStep("Found usage data to report", { count: usageData?.length || 0 });

    if (!usageData || usageData.length === 0) {
      return new Response(JSON.stringify({ message: "No usage to report" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Group usage by user
    const userUsage = usageData.reduce((acc, usage) => {
      if (!usage.user_id) return acc;
      
      if (!acc[usage.user_id]) {
        acc[usage.user_id] = {
          total_cost: 0,
          usage_ids: []
        };
      }
      
      acc[usage.user_id].total_cost += usage.estimated_cost_usd || 0;
      acc[usage.user_id].usage_ids.push(usage.id);
      
      return acc;
    }, {} as Record<string, { total_cost: number; usage_ids: string[] }>);

    const reportedUsage = [];

    // Report usage for each user
    for (const [userId, userData] of Object.entries(userUsage)) {
      try {
        // Get user's Stripe customer ID
        const { data: subscriber } = await supabaseClient
          .from('subscribers')
          .select('stripe_customer_id')
          .eq('user_id', userId)
          .single();

        if (!subscriber?.stripe_customer_id) {
          logStep("No Stripe customer found for user", { userId });
          continue;
        }

        // Get active subscription
        const subscriptions = await stripe.subscriptions.list({
          customer: subscriber.stripe_customer_id,
          status: "active",
          limit: 1,
        });

        if (subscriptions.data.length === 0) {
          logStep("No active subscription for user", { userId });
          continue;
        }

        const subscription = subscriptions.data[0];
        const subscriptionItem = subscription.items.data[0];

        // Convert cost to usage units (multiply by 100 to charge in cents)
        const usageQuantity = Math.ceil(userData.total_cost * 100);

        // Report usage to Stripe
        await stripe.subscriptionItems.createUsageRecord(subscriptionItem.id, {
          quantity: usageQuantity,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment',
        });

        logStep("Reported usage to Stripe", { 
          userId, 
          cost: userData.total_cost, 
          quantity: usageQuantity 
        });

        // Mark usage as reported
        await supabaseClient
          .from('ai_usage_analytics')
          .update({ stripe_reported_at: new Date().toISOString() })
          .in('id', userData.usage_ids);

        reportedUsage.push({
          user_id: userId,
          cost: userData.total_cost,
          quantity: usageQuantity
        });

      } catch (error) {
        logStep("Error reporting usage for user", { userId, error: error.message });
      }
    }

    return new Response(JSON.stringify({ 
      message: "Usage reported successfully",
      reported: reportedUsage.length,
      details: reportedUsage
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
-- Add missing stripe_reported_at column to track which usage has been reported to Stripe
ALTER TABLE public.ai_usage_analytics 
ADD COLUMN stripe_reported_at TIMESTAMP WITH TIME ZONE;

-- Add index for performance when querying unreported usage
CREATE INDEX idx_ai_usage_analytics_stripe_reported 
ON public.ai_usage_analytics(user_id, stripe_reported_at) 
WHERE stripe_reported_at IS NULL;
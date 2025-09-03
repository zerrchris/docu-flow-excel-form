-- Fix the ai_usage_summary view security definer issue
DROP VIEW IF EXISTS public.ai_usage_summary;

-- Recreate the view without SECURITY DEFINER to avoid security issues
CREATE VIEW public.ai_usage_summary AS
SELECT 
  user_id,
  function_name,
  model_used,
  DATE(created_at) as usage_date,
  COUNT(*) as request_count,
  SUM(input_tokens) as total_input_tokens,
  SUM(output_tokens) as total_output_tokens,
  SUM(total_tokens) as total_tokens,
  SUM(estimated_cost_usd) as total_estimated_cost,
  AVG(estimated_cost_usd) as avg_cost_per_request
FROM public.ai_usage_analytics
WHERE success = true
GROUP BY user_id, function_name, model_used, DATE(created_at)
ORDER BY usage_date DESC;

-- Create RLS policy for the view (follows the base table policies)
ALTER VIEW public.ai_usage_summary SET (security_invoker = true);
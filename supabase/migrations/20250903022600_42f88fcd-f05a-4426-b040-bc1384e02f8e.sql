-- Create AI usage tracking table
CREATE TABLE public.ai_usage_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  model_used TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  estimated_cost_usd DECIMAL(10, 6),
  request_payload JSONB,
  response_payload JSONB,
  success BOOLEAN NOT NULL DEFAULT true,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ai_usage_analytics ENABLE ROW LEVEL SECURITY;

-- Users can view their own usage
CREATE POLICY "Users can view their own AI usage" 
ON public.ai_usage_analytics 
FOR SELECT 
USING (auth.uid() = user_id);

-- Functions can insert usage data
CREATE POLICY "Functions can insert AI usage data" 
ON public.ai_usage_analytics 
FOR INSERT 
WITH CHECK (true);

-- Admins can view all usage
CREATE POLICY "Admins can view all AI usage" 
ON public.ai_usage_analytics 
FOR SELECT 
USING (public.has_role(auth.uid(), 'admin'));

-- Create index for performance
CREATE INDEX idx_ai_usage_user_created ON public.ai_usage_analytics(user_id, created_at);
CREATE INDEX idx_ai_usage_function_created ON public.ai_usage_analytics(function_name, created_at);

-- Create view for usage summaries
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
-- Create AI usage logging table for billing
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  provider TEXT NOT NULL, -- 'openai', 'anthropic', etc.
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB
);

-- Enable Row Level Security
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for AI usage logs
CREATE POLICY "Users can view their own AI usage" 
ON public.ai_usage_logs 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can insert AI usage logs" 
ON public.ai_usage_logs 
FOR INSERT 
WITH CHECK (true);

-- Create index for better performance
CREATE INDEX idx_ai_usage_logs_user_timestamp ON public.ai_usage_logs(user_id, timestamp DESC);
CREATE INDEX idx_ai_usage_logs_provider ON public.ai_usage_logs(provider);

-- Create user billing summary table
CREATE TABLE IF NOT EXISTS public.user_billing_summary (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  total_ai_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  current_month_cost DECIMAL(10,2) NOT NULL DEFAULT 0,
  last_billing_date TIMESTAMP WITH TIME ZONE,
  billing_cycle_start TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT date_trunc('month', now()),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for billing summary
ALTER TABLE public.user_billing_summary ENABLE ROW LEVEL SECURITY;

-- Create policies for billing summary
CREATE POLICY "Users can view their own billing summary" 
ON public.user_billing_summary 
FOR SELECT 
USING (user_id = auth.uid());

CREATE POLICY "System can update billing summary" 
ON public.user_billing_summary 
FOR ALL 
USING (true);

-- Create function to update billing summary
CREATE OR REPLACE FUNCTION public.update_user_billing_summary()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert billing summary for the user
  INSERT INTO public.user_billing_summary (user_id, total_ai_cost, current_month_cost, updated_at)
  VALUES (
    NEW.user_id,
    NEW.cost,
    CASE 
      WHEN date_trunc('month', NEW.timestamp) = date_trunc('month', now()) 
      THEN NEW.cost 
      ELSE 0 
    END,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    total_ai_cost = user_billing_summary.total_ai_cost + NEW.cost,
    current_month_cost = CASE 
      WHEN date_trunc('month', NEW.timestamp) = date_trunc('month', now()) 
      THEN user_billing_summary.current_month_cost + NEW.cost
      ELSE user_billing_summary.current_month_cost
    END,
    updated_at = now();
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically update billing summary
CREATE TRIGGER update_billing_summary_trigger
  AFTER INSERT ON public.ai_usage_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_billing_summary();
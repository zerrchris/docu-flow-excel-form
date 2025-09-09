-- Create function_logs table for better debugging
CREATE TABLE IF NOT EXISTS public.function_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  function_name TEXT NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  input JSONB,
  output JSONB,
  error_message TEXT,
  status_code INTEGER,
  execution_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.function_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for function logs
CREATE POLICY "Users can view their own function logs" 
ON public.function_logs 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Functions can insert logs" 
ON public.function_logs 
FOR INSERT 
WITH CHECK (true);

-- Add index for better performance
CREATE INDEX idx_function_logs_user_function ON public.function_logs(user_id, function_name);
CREATE INDEX idx_function_logs_created_at ON public.function_logs(created_at);
CREATE INDEX idx_function_logs_status_code ON public.function_logs(status_code);
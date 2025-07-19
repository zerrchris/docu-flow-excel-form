-- Create runsheets table
CREATE TABLE public.runsheets (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  name text NOT NULL,
  columns text[] NOT NULL DEFAULT '{}',
  data jsonb NOT NULL DEFAULT '[]',
  user_id uuid NOT NULL,
  UNIQUE(user_id, name)
);

-- Enable Row Level Security
ALTER TABLE public.runsheets ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own runsheets" 
ON public.runsheets 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own runsheets" 
ON public.runsheets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own runsheets" 
ON public.runsheets 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own runsheets" 
ON public.runsheets 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_runsheets_updated_at
BEFORE UPDATE ON public.runsheets
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
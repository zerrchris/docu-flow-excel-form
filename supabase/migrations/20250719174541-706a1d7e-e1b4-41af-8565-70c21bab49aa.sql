-- Create user_extraction_preferences table to store default extraction settings
CREATE TABLE public.user_extraction_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL DEFAULT 'Default',
  columns TEXT[] NOT NULL DEFAULT '{}',
  column_instructions JSONB NOT NULL DEFAULT '{}',
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_extraction_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user preferences
CREATE POLICY "Users can view their own extraction preferences" 
ON public.user_extraction_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own extraction preferences" 
ON public.user_extraction_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own extraction preferences" 
ON public.user_extraction_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own extraction preferences" 
ON public.user_extraction_preferences 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create index for faster user queries
CREATE INDEX idx_user_extraction_preferences_user_id ON public.user_extraction_preferences(user_id);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_user_extraction_preferences_updated_at
BEFORE UPDATE ON public.user_extraction_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
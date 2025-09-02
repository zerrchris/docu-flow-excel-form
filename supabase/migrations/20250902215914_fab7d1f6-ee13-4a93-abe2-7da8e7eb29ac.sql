-- Create table for user column width preferences
CREATE TABLE public.user_column_width_preferences (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  runsheet_id UUID,
  column_name TEXT NOT NULL,
  width INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Index for fast lookups
  UNIQUE(user_id, runsheet_id, column_name),
  
  -- Foreign key constraints would be nice but we can't reference auth.users
  -- so we'll just use the UUID directly
  CHECK (width > 0 AND width <= 2000) -- Reasonable width limits
);

-- Enable Row Level Security
ALTER TABLE public.user_column_width_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user access
CREATE POLICY "Users can view their own column width preferences" 
ON public.user_column_width_preferences 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own column width preferences" 
ON public.user_column_width_preferences 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own column width preferences" 
ON public.user_column_width_preferences 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own column width preferences" 
ON public.user_column_width_preferences 
FOR DELETE 
USING (auth.uid() = user_id);

-- Create function to update timestamps
CREATE TRIGGER update_user_column_width_preferences_updated_at
BEFORE UPDATE ON public.user_column_width_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for performance
CREATE INDEX idx_user_column_width_preferences_user_runsheet 
ON public.user_column_width_preferences(user_id, runsheet_id);
-- Create admin settings table for storing global extraction instructions
CREATE TABLE public.admin_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

-- Create policy for admins to manage settings
CREATE POLICY "Admins can manage all settings" 
ON public.admin_settings 
FOR ALL 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policy for authenticated users to read settings
CREATE POLICY "Users can view settings" 
ON public.admin_settings 
FOR SELECT 
TO authenticated
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_admin_settings_updated_at
BEFORE UPDATE ON public.admin_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default extraction instructions setting
INSERT INTO public.admin_settings (setting_key, setting_value, description)
VALUES (
  'global_extraction_instructions', 
  'Please be as accurate as possible when extracting information from documents. Extract information exactly as it appears in the document. If information is not clearly visible or missing, leave the field empty.',
  'Global instructions that are included with every document extraction request to improve AI accuracy and consistency.'
);
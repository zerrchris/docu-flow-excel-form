-- Create a new function with proper security settings, then replace the old one
CREATE OR REPLACE FUNCTION public.update_updated_at_column_secure()
RETURNS TRIGGER AS $$
BEGIN
NEW.updated_at = now();
RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Update all triggers to use the new function
DROP TRIGGER IF EXISTS update_subject_lands_templates_updated_at ON public.subject_lands_templates;
CREATE TRIGGER update_subject_lands_templates_updated_at
BEFORE UPDATE ON public.subject_lands_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column_secure();
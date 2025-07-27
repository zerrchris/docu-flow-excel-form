-- Add toggle for disabling smart naming completely
ALTER TABLE public.user_document_naming_preferences 
ADD COLUMN use_smart_naming boolean NOT NULL DEFAULT true;
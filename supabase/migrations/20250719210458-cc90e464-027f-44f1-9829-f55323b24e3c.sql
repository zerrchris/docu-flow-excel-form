-- Add column_instructions field to runsheets table to store extraction configuration
ALTER TABLE public.runsheets 
ADD COLUMN IF NOT EXISTS column_instructions JSONB DEFAULT '{}'::jsonb;
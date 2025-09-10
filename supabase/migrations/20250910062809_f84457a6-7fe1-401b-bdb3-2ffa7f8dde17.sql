-- Fix the deferrable constraint issue
-- Drop the deferrable constraint and recreate as regular unique constraint
ALTER TABLE user_extraction_preferences 
DROP CONSTRAINT IF EXISTS unique_user_default_preference;

-- Add non-deferrable unique constraint that works with ON CONFLICT
ALTER TABLE user_extraction_preferences 
ADD CONSTRAINT unique_user_default_preference 
UNIQUE (user_id, is_default);
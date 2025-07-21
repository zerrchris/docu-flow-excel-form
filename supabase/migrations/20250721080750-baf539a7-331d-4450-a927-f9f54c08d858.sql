-- Clean up user preferences that contain "new column 2"
-- This will remove the stale column from existing user preferences

-- First, let's see what data we're working with
-- Update user_extraction_preferences to remove "new column 2" from columns array
UPDATE public.user_extraction_preferences 
SET 
  columns = array_remove(columns, 'new column 2'),
  column_instructions = column_instructions - 'new column 2'
WHERE 'new column 2' = ANY(columns);

-- Verify the cleanup worked
-- SELECT columns, column_instructions FROM user_extraction_preferences WHERE user_id = 'e09da942-b892-424d-b4f8-7eff5f6d4856';
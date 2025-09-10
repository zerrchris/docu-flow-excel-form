-- Clean up duplicate extraction preferences
-- First, let's see what we're dealing with
DO $$
BEGIN
    -- Delete all but the most recent default preference for each user
    DELETE FROM user_extraction_preferences 
    WHERE id NOT IN (
        SELECT DISTINCT ON (user_id) id
        FROM user_extraction_preferences 
        WHERE is_default = true
        ORDER BY user_id, updated_at DESC
    ) AND is_default = true;
    
    -- Add a unique constraint to prevent future duplicates
    -- Drop existing constraint if it exists (this will fail silently if it doesn't exist)
    BEGIN
        ALTER TABLE user_extraction_preferences 
        DROP CONSTRAINT IF EXISTS unique_user_default_preference;
    EXCEPTION
        WHEN others THEN NULL;
    END;
    
    -- Add the unique constraint
    ALTER TABLE user_extraction_preferences 
    ADD CONSTRAINT unique_user_default_preference 
    UNIQUE (user_id, is_default) 
    DEFERRABLE INITIALLY DEFERRED;
    
    RAISE NOTICE 'Cleaned up duplicate extraction preferences and added unique constraint';
END $$;
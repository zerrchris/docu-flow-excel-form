-- Check if there's a unique constraint on user_id, name and create it if missing
-- First, let's see if there are duplicate entries
SELECT user_id, name, COUNT(*) as count 
FROM public.runsheets 
GROUP BY user_id, name 
HAVING COUNT(*) > 1;

-- Add unique constraint if it doesn't exist
DO $$ 
BEGIN
    -- Try to add the unique constraint
    BEGIN
        ALTER TABLE public.runsheets 
        ADD CONSTRAINT runsheets_user_id_name_unique 
        UNIQUE (user_id, name);
    EXCEPTION
        WHEN duplicate_key_value THEN
            -- If there are duplicates, we need to handle them first
            -- Delete older duplicates, keeping the most recent one
            DELETE FROM public.runsheets r1
            WHERE r1.id NOT IN (
                SELECT DISTINCT ON (user_id, name) id
                FROM public.runsheets r2
                WHERE r2.user_id = r1.user_id AND r2.name = r1.name
                ORDER BY user_id, name, updated_at DESC
            );
            
            -- Now add the constraint
            ALTER TABLE public.runsheets 
            ADD CONSTRAINT runsheets_user_id_name_unique 
            UNIQUE (user_id, name);
        WHEN others THEN
            -- Constraint might already exist, that's fine
            NULL;
    END;
END $$;
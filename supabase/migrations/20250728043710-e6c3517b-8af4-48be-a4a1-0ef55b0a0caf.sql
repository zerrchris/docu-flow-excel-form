-- First check for duplicates
SELECT user_id, name, COUNT(*) as count 
FROM public.runsheets 
GROUP BY user_id, name 
HAVING COUNT(*) > 1;

-- Remove duplicates, keeping the most recent one
DELETE FROM public.runsheets r1
WHERE r1.id NOT IN (
    SELECT DISTINCT ON (user_id, name) id
    FROM public.runsheets r2
    WHERE r2.user_id = r1.user_id AND r2.name = r1.name
    ORDER BY user_id, name, updated_at DESC
);

-- Add unique constraint
ALTER TABLE public.runsheets 
ADD CONSTRAINT runsheets_user_id_name_unique 
UNIQUE (user_id, name);
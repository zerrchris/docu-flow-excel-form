-- Fix the INSERT policy for runsheets table to include proper user_id check
DROP POLICY IF EXISTS "Users can create their own runsheets" ON public.runsheets;

CREATE POLICY "Users can create their own runsheets" 
ON public.runsheets 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);
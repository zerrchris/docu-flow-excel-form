-- Fix critical security vulnerability in subscribers table
-- Replace the overly permissive update policy with a proper user-restricted policy

DROP POLICY IF EXISTS "update_own_subscription" ON public.subscribers;

CREATE POLICY "update_own_subscription" ON public.subscribers
FOR UPDATE
USING ((user_id = auth.uid()) OR (email = auth.email()));
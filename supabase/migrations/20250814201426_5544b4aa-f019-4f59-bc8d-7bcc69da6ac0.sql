-- Fix critical security vulnerability in subscribers table
-- Replace the overly permissive insert policy that allows anyone to create subscription records
-- Only authenticated users should be able to create their own subscription records

DROP POLICY IF EXISTS "insert_subscription" ON public.subscribers;

CREATE POLICY "insert_subscription" ON public.subscribers
FOR INSERT
WITH CHECK ((auth.uid() = user_id) OR (auth.email() = email));
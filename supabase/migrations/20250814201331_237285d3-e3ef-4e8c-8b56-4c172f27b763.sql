-- Fix critical security vulnerability in admin_settings table
-- Remove the overly permissive policy that allows all users to view admin settings
-- Only admins should be able to read administrative configuration data

DROP POLICY IF EXISTS "Users can view settings" ON public.admin_settings;
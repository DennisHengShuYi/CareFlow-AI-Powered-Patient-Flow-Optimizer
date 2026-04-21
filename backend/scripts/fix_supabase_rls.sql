-- Run this in your Supabase SQL Editor to fix the "Failed to complete onboarding" error

-- 1. Update the profiles table with new mandatory columns
-- (This adds the columns needed for personalized recommendations)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS age INTEGER;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender TEXT;

-- 2. Disable RLS for development/testing (Solves the 401/42501 Unauthorized errors)
-- This allows the frontend to upsert your name, age, and location freely.
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- 3. (Optional) If you want to keep RLS enabled but allow all inserts/updates:
-- ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "Allow all access to profiles" ON public.profiles;
-- CREATE POLICY "Allow all access to profiles" ON public.profiles FOR ALL USING (true) WITH CHECK (true);

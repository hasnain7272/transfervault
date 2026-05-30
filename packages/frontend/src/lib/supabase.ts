import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string) || 'https://rhsguukivwgwaxpujnqe.supabase.co';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string) || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoc2d1dWtpdndnd2F4cHVqbnFlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODAxMDg4NzgsImV4cCI6MjA5NTY4NDg3OH0.q3fl5ZDd_2KRqbERtIWJraii6IhQ1Mziq0NdisPL_lw';

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  console.log('Using hardcoded fallback Supabase credentials for production compatibility.');
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

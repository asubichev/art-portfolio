/**
 * supabase-config.js
 *
 * Initialises the shared Supabase client used by every page.
 */

const SUPABASE_URL = 'https://mmiluhqhiyxqmceexcpw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1taWx1aHFoaXl4cW1jZWV4Y3B3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1MDQ3MjYsImV4cCI6MjA5ODA4MDcyNn0.peueizWg91WWpiKt6GhxLwkQoreXRULeex_jI8ILqQY';

const supabaseLib = window.supabase;

if (!supabaseLib?.createClient) {
  console.error('[Art Portfolio] Supabase SDK failed to load from CDN.');
} else {
  const supabase = supabaseLib.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });

  window.supabaseClient = supabase;
}

window.supabaseClient = supabase;

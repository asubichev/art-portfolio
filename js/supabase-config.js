/**
 * supabase-config.js
 *
 * Initialises the shared Supabase client used by every page.
 * Replace the two placeholder values with your actual project credentials
 * from Supabase Dashboard → Settings → API.
 *
 * IMPORTANT: only the anon (public) key should ever be present in this file.
 * Never put the service-role key in any frontend code.
 */

const SUPABASE_URL = 'https://your-project-ref.supabase.co';
const SUPABASE_ANON_KEY = 'your-anon-key-here';

if (
  SUPABASE_URL === 'https://your-project-ref.supabase.co' ||
  SUPABASE_ANON_KEY === 'your-anon-key-here'
) {
  console.warn(
    '[Art Portfolio] Supabase credentials are still set to placeholder values. ' +
    'Update SUPABASE_URL and SUPABASE_ANON_KEY in js/supabase-config.js before deploying.',
  );
}

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

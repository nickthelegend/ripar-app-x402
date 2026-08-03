import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser Supabase client. Returns null until the project env vars are set,
 * so the login UI still renders during local preview.
 *
 * Add these to .env.local:
 *   NEXT_PUBLIC_SUPABASE_URL=...
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY=...
 */
const SUPABASE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url || !SUPABASE_KEY) return null;
  return createBrowserClient(url, SUPABASE_KEY);
}

export const isSupabaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && SUPABASE_KEY);

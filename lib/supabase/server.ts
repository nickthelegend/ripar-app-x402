import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/**
 * Server Supabase client (used by the OAuth callback route). Returns null
 * until env vars are configured.
 */
export async function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch (e) {
          // Next refuses cookie writes from a Server Component and says so by
          // name. THAT case is safe to swallow: the proxy refreshes the session
          // on the next request.
          //
          // Nothing else is. This client is what the OAuth callback uses, and
          // exchangeCodeForSession reports only the exchange in its `error` —
          // a cookie write that throws in here is invisible to it. Swallowing
          // everything meant a failed write let the callback redirect to
          // /dashboard as though sign-in had worked, with no session cookie and
          // no error anywhere: the user lands silently signed out.
          //
          // @supabase/ssr 0.12.4 also flushes PKCE verifier removals through
          // this same callback, so there are now more writes here to get wrong.
          const msg = e instanceof Error ? e.message : String(e);
          if (!/can only be modified in a Server Action or Route Handler/i.test(msg)) {
            throw e;
          }
        }
      },
    },
  });
}

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Handles the OAuth redirect from Supabase and exchanges the code for a session.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    if (supabase) {
      try {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          return NextResponse.redirect(`${origin}${next}`);
        }
      } catch {
        // A session cookie that could not be written now throws out of setAll
        // rather than being swallowed. Landing on /login with an error is the
        // honest outcome: without that cookie the user is not signed in, and
        // redirecting to /dashboard would say otherwise.
      }
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}

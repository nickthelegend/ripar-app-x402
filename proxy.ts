import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Next 16 proxy (the middleware successor): keeps the Supabase session cookie
// fresh for server components, and (when RIPAR_REQUIRE_AUTH=true) gates the
// app routes behind sign-in. The flag defaults off so local preview and demos
// work signed-out.

const PROTECTED = ["/dashboard", "/agents", "/workflows", "/knowledge", "/interfaces", "/onboarding"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return response;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  // getUser() (not getSession) — validates the JWT against Supabase.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (
    process.env.RIPAR_REQUIRE_AUTH === "true" &&
    !user &&
    PROTECTED.some((p) => request.nextUrl.pathname.startsWith(p))
  ) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.search = "";
    return NextResponse.redirect(login);
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};

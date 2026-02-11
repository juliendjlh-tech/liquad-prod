import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";
import type { Database } from "@/lib/db/types";

/**
 * Next.js Middleware for authentication and route protection.
 *
 * This middleware runs BEFORE any page or API route handler for matched paths.
 * It performs two critical functions:
 *
 * 1. **Auth token refresh**: Refreshes the Supabase JWT if it's about to expire.
 *    This is essential — without it, users would be randomly logged out when
 *    their token expires (default: 1 hour). The middleware reads the token from
 *    cookies, refreshes if needed, and writes the new token back to cookies.
 *
 * 2. **Route protection**: Blocks unauthenticated access to protected routes:
 *    - `/dashboard/*` → Redirects to `/login` (user-facing pages)
 *    - `/api/*` (except `/api/auth/*` and `/api/sdk/*`) → Returns 401 JSON
 *
 * UNPROTECTED ROUTES (passthrough, no auth check):
 *    - `/` (landing page)
 *    - `/login` (must be accessible to log in)
 *    - `/api/auth/*` (signup/login/logout — no session needed)
 *    - `/api/sdk/*` (SDK endpoints use API key auth, not session cookies)
 *    - Static assets (`_next/*`, `favicon.ico`, etc.) are excluded via config.matcher
 *
 * WHY the middleware uses the ANON key (not the service role key):
 * The middleware only needs to verify the user's session and refresh tokens.
 * It does NOT query the database. Using the anon key is more secure because:
 * - It limits the middleware's privileges to auth operations only
 * - Even if the middleware code leaks, the anon key is already public
 * - The service role key is reserved for the server client in API routes
 *
 * @see {@link createServerClient} in `lib/db/supabase-server.ts` for the
 *   server client used in API route handlers (uses service role key).
 */
export async function middleware(request: NextRequest) {
  // Start with a default "pass-through" response that forwards the request
  // unchanged. We may replace this with a redirect or 401 below.
  let response = NextResponse.next({ request });

  // Create a Supabase client specifically for the middleware context.
  // Unlike the server client (supabase-server.ts), this one:
  // - Uses the ANON key (auth operations only, no DB queries)
  // - Reads/writes cookies via request/response objects (not next/headers)
  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        /**
         * Read all cookies from the incoming request.
         * Supabase uses this to find the JWT access + refresh tokens.
         */
        getAll() {
          return request.cookies.getAll();
        },
        /**
         * Write cookies to both the request AND the response.
         *
         * Why both?
         * - Setting on `request.cookies`: Ensures any downstream Server Component
         *   or API route sees the refreshed token in the same request cycle.
         * - Setting on `response.cookies`: Sends the refreshed token back to the
         *   browser so the next request also has the fresh token.
         *
         * The response must be re-created with the updated request to propagate
         * the cookie changes correctly through the Next.js middleware chain.
         */
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  // IMPORTANT: Use getUser() instead of getSession().
  // getUser() sends the JWT to the Supabase Auth server for validation,
  // which prevents using a tampered or expired token. getSession() only
  // decodes the JWT locally without server validation — less secure.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  // --- Auth routes bypass: /api/auth/* must be accessible without session ---
  // These routes handle signup, login, and logout — users obviously don't
  // have a session yet when signing up or logging in.
  if (pathname.startsWith("/api/auth")) {
    return response;
  }

  // --- SDK routes bypass: /api/sdk/* uses API key auth, not session ---
  // These routes are protected by API key validation in their own handlers
  // (see US-006-001). The middleware must NOT block them.
  if (pathname.startsWith("/api/sdk")) {
    return response;
  }

  // --- Dashboard protection: redirect unauthenticated users to /login ---
  if (!user && pathname.startsWith("/dashboard")) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    return NextResponse.redirect(loginUrl);
  }

  // --- API protection: return 401 JSON for unauthenticated API requests ---
  // This covers all /api/* routes except /api/sdk/* (handled above).
  if (!user && pathname.startsWith("/api")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // All other matched routes: pass through with refreshed cookies
  return response;
}

/**
 * Configure which routes the middleware runs on.
 *
 * We only match routes that need protection or token refresh.
 * Static assets, images, and other files are excluded to avoid
 * unnecessary middleware execution on every asset request.
 *
 * Matched:
 * - /dashboard/* — Protected pages (require session)
 * - /api/* — Protected API routes (require session, except /api/sdk/*)
 *
 * NOT matched (excluded by omission):
 * - / — Landing page (public)
 * - /login — Login page (public, must be accessible)
 * - /_next/* — Next.js static assets
 * - /favicon.ico — Browser favicon request
 */
export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};

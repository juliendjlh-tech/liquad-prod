import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/db/types";

/**
 * GET /api/auth/callback
 *
 * Handles the auth callback after email confirmation (PKCE flow).
 *
 * When a user clicks the confirmation link in their email, Supabase
 * redirects to this route with a `code` query parameter. This route
 * exchanges that code for a session and sets the auth cookies.
 *
 * Flow:
 * 1. User signs up → Supabase sends confirmation email
 * 2. User clicks link → redirected to /api/auth/callback?code=...
 * 3. This route exchanges the code for a session
 * 4. Redirects to /dashboard (or /onboarding if no workspace)
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const redirectUrl = request.nextUrl.clone();
  redirectUrl.pathname = next;
  redirectUrl.searchParams.delete("code");
  redirectUrl.searchParams.delete("next");

  if (code) {
    const response = NextResponse.redirect(redirectUrl);

    const supabase = createServerClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              response.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return response;
    }
  }

  // If no code or exchange failed, redirect to login
  redirectUrl.pathname = "/login";
  return NextResponse.redirect(redirectUrl);
}

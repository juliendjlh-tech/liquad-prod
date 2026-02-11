import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";

/**
 * POST /api/auth/logout
 *
 * Signs the user out by invalidating their Supabase Auth session
 * and clearing the session cookies.
 *
 * FLOW:
 * 1. Create a server-side Supabase client (with cookie access).
 * 2. Call `supabase.auth.signOut()`.
 *    - Invalidates the refresh token on the Supabase Auth server.
 *    - Clears the session cookies via @supabase/ssr's setAll method.
 * 3. Return 200 with a confirmation message.
 *
 * IDEMPOTENT:
 * Calling logout when the user is already logged out (or was never logged in)
 * is a no-op. It always returns 200 with no error. This design:
 * - Simplifies client-side logic (no need to check auth state before logout)
 * - Prevents race conditions (e.g., user clicks logout twice quickly)
 * - Follows REST best practices for idempotent operations
 *
 * RESPONSES:
 * - 200: `{ message: "Logged out" }` (always, regardless of prior auth state)
 *
 * SECURITY NOTES:
 * - This endpoint is bypassed by the auth middleware (/api/auth/* passthrough),
 *   so it's accessible even without a valid session.
 * - signOut() invalidates the refresh token server-side, preventing token
 *   reuse even if the cookie is somehow captured before being cleared.
 */
export async function POST(): Promise<NextResponse> {
  try {
    const supabase = await createServerClient();

    // signOut() invalidates the session on the Supabase Auth server
    // and the @supabase/ssr cookie methods clear the session cookies.
    // If no session exists, this is a silent no-op (no error thrown).
    await supabase.auth.signOut();

    return NextResponse.json({ message: "Logged out" }, { status: 200 });
  } catch {
    // Even if signOut fails unexpectedly, we return 200 to maintain
    // idempotent behavior. The client should treat any logout call
    // as "you are now logged out" regardless of server-side errors.
    // The worst case is the session remains valid until the JWT expires
    // (default: 1 hour), which is acceptable for MVP.
    return NextResponse.json({ message: "Logged out" }, { status: 200 });
  }
}

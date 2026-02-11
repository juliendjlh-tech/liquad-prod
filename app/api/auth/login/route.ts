import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { loginSchema } from "@/lib/validations/auth.schema";

/**
 * POST /api/auth/login
 *
 * Authenticates a user with email and password via Supabase Auth.
 * On success, sets session cookies that the middleware and server client
 * use to identify the user on subsequent requests.
 *
 * REQUEST BODY (JSON):
 * ```json
 * {
 *   "email": "publisher@example.com",
 *   "password": "SecurePass1"
 * }
 * ```
 *
 * FLOW:
 * 1. Parse and validate the request body using loginSchema (Zod).
 *    - loginSchema only checks that email is valid and password is non-empty.
 *    - No password strength check on login (rules only enforced at signup).
 * 2. Create a server-side Supabase client (reads/writes cookies).
 * 3. Call `supabase.auth.signInWithPassword({ email, password })`.
 *    - Supabase validates the credentials against the Auth database.
 *    - On success: returns the user object and sets JWT tokens in cookies
 *      (handled automatically by @supabase/ssr's cookie methods).
 *    - On failure: returns an error (wrong password, unknown email, etc.).
 * 4. Return the user data (id + email) on success, or an error message.
 *
 * RESPONSES:
 * - 200: `{ user: { id: "uuid", email: "..." } }` + session cookies set
 * - 400: Zod validation error (invalid email format, missing password)
 * - 400: `{ error: "Invalid login credentials" }` (wrong email or password)
 * - 500: `{ error: "Internal server error" }` (unexpected failure)
 *
 * SECURITY NOTES:
 * - Returns the SAME generic error for both "wrong password" and "unknown
 *   email" to prevent user enumeration attacks. An attacker cannot determine
 *   which emails are registered by observing the error message.
 * - This endpoint is bypassed by the auth middleware (/api/auth/* passthrough).
 * - Rate limiting is handled by Supabase Auth's built-in brute-force protection.
 *
 * @see {@link loginSchema} for validation rules
 * @see {@link createServerClient} for cookie-based session management
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Validate the request body.
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Step 2: Create Supabase server client.
    // The client's cookie methods (getAll/setAll) handle reading the
    // existing session and writing the new JWT tokens to response cookies.
    const supabase = await createServerClient();

    // Step 3: Attempt to sign in with email and password.
    // signInWithPassword validates credentials server-side and returns
    // a session with access + refresh tokens if successful.
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      // Supabase returns "Invalid login credentials" for both wrong
      // password and unknown email. We pass this through as-is to
      // maintain the anti-enumeration behavior.
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Step 4: Return minimal user data.
    // Only return id and email — no sensitive fields like tokens.
    // The session tokens are stored in HTTP-only cookies by @supabase/ssr,
    // not in the JSON response body.
    return NextResponse.json(
      {
        user: {
          id: data.user.id,
          email: data.user.email,
        },
      },
      { status: 200 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

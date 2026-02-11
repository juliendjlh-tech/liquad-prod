import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { signupSchema } from "@/lib/validations/auth.schema";

/**
 * POST /api/auth/signup
 *
 * Creates a new user account via Supabase Auth.
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
 * 1. Parse and validate the request body using signupSchema (Zod).
 *    - If validation fails: return 400 with Zod error details.
 * 2. Call `supabase.auth.signUp({ email, password })`.
 *    - Supabase Auth creates the user and sends a confirmation email.
 *    - If the user already exists: Supabase returns an error.
 * 3. Return a success message instructing the user to check their email.
 *
 * RESPONSES:
 * - 200: `{ message: "Check your email for confirmation" }`
 * - 400: Zod validation error (invalid email, weak password, missing fields)
 * - 400: `{ error: "User already registered" }` (duplicate email)
 * - 500: `{ error: "Internal server error" }` (unexpected Supabase error)
 *
 * SECURITY NOTES:
 * - This endpoint is NOT protected by the auth middleware. The middleware
 *   explicitly bypasses `/api/auth/*` routes because users need to access
 *   signup/login before having a session.
 * - Rate limiting is handled by Supabase Auth's built-in protection
 *   (prevents brute-force account creation).
 *
 * @see {@link signupSchema} for validation rules
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Parse and validate the request body.
    // safeParse returns { success, data, error } without throwing,
    // allowing us to return a structured 400 error.
    const body = await request.json();
    const validation = signupSchema.safeParse(body);

    if (!validation.success) {
      // Return Zod validation errors in a structured format.
      // The client can use these to display field-level error messages.
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { email, password } = validation.data;

    // Step 2: Create the Supabase server client and attempt to sign up.
    // The server client uses the service role key, which is needed to
    // call auth.signUp (admin operation).
    const supabase = await createServerClient();
    const { data, error } = await supabase.auth.signUp({ email, password });

    // Step 3: Handle Supabase Auth errors.
    if (error) {
      // Supabase returns "User already registered" when the email is taken.
      // We map this to a 400 with a clear error message.
      // Using a generic status 400 (not 409) to avoid leaking information
      // about which emails are registered (though Supabase's default
      // behavior may already reveal this).
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Edge case: Supabase may return a user with `identities: []` when
    // the email is already registered but email confirmation is required.
    // In this case, the user "appears" created but actually wasn't.
    // This behavior depends on Supabase project settings.
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      return NextResponse.json(
        { error: "User already registered" },
        { status: 400 }
      );
    }

    // Step 4: Success — user created, confirmation email sent by Supabase.
    // The user must click the email link before they can log in.
    return NextResponse.json(
      { message: "Check your email for confirmation" },
      { status: 200 }
    );
  } catch {
    // Catch unexpected errors (JSON parse failure, network issues, etc.)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

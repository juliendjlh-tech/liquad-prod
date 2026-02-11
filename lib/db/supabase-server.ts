import { createServerClient as createSupabaseServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "@/lib/db/types";

/**
 * Create a server-side Supabase client for use in API Routes and Server Components.
 *
 * This client:
 * - Uses the SUPABASE_SERVICE_ROLE_KEY for admin-level DB access (bypasses RLS).
 *   This allows the service layer to query across workspaces when needed
 *   (e.g., looking up a user by email for invitations). Authorization is handled
 *   explicitly in the service layer, not via RLS.
 * - Reads the auth session from request cookies for user identification.
 *   Calling `supabase.auth.getUser()` returns the currently authenticated user
 *   based on the JWT stored in the cookie.
 * - Should ONLY be used server-side (API routes, server components).
 *   Never import this in client components — the service role key must not
 *   be exposed to the browser.
 *
 * HOW IT WORKS:
 * 1. Reads all cookies from the incoming request via Next.js `cookies()` API.
 * 2. Creates a Supabase client configured with the service role key.
 * 3. The client uses cookies to extract the user's auth session (JWT).
 * 4. DB queries bypass RLS (service role privilege).
 * 5. `setAll` propagates refreshed auth tokens back to the response cookies,
 *    keeping the user's session alive across requests.
 *
 * IMPORTANT: Since this client bypasses RLS, every query in the service layer
 * MUST manually filter by workspace_id and check user permissions. Never expose
 * raw query results without authorization checks.
 *
 * @returns A typed Supabase client configured for server-side use
 *
 * @example
 * ```typescript
 * // In an API route handler:
 * import { createServerClient } from "@/lib/db/supabase-server";
 *
 * export async function GET() {
 *   const supabase = await createServerClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *
 *   if (!user) {
 *     return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
 *   }
 *
 *   // user.id is the authenticated user's UUID
 *   // Use it in service layer calls for authorization
 * }
 * ```
 *
 * @see {@link Database} for the TypeScript types matching the DB schema
 */
export async function createServerClient() {
  const cookieStore = await cookies();

  return createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      cookies: {
        /**
         * Read all cookies from the incoming request.
         * Used by Supabase to extract the auth session (JWT tokens).
         */
        getAll() {
          return cookieStore.getAll();
        },
        /**
         * Write cookies to the response.
         * Used by Supabase to refresh auth tokens and keep the session alive.
         * When a JWT is about to expire, Supabase automatically refreshes it
         * and uses this method to set the new tokens in the response cookies.
         *
         * Note: In some Next.js contexts (e.g., Server Components during
         * static rendering), setting cookies may silently fail. This is
         * expected — the middleware handles token refresh for those cases.
         */
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // setAll can be called from a Server Component where cookies
            // are read-only. This is safe to ignore because the middleware
            // will handle the token refresh on the next request.
          }
        },
      },
    }
  );
}

import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "./types";

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

/**
 * Client-side Supabase client using @supabase/ssr.
 *
 * Uses createBrowserClient instead of createClient so that auth tokens
 * are stored in cookies (not localStorage). This is required because
 * the Next.js middleware and server client read the session from cookies.
 * Without this, login succeeds but the middleware never sees the session.
 */
export const supabase = createBrowserClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

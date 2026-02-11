import { z } from "zod";

/**
 * Schema for POST /api/auth/signup request body.
 *
 * Validates user registration input against business rules defined in the PRD:
 * - email: Must be a valid email format (RFC 5322 compliant via Zod's z.email())
 * - password: Must meet minimum strength requirements:
 *   - At least 8 characters long
 *   - At least 1 uppercase letter (A-Z)
 *   - At least 1 digit (0-9)
 *
 * WHY these password rules:
 * The PRD requires basic password strength enforcement to prevent trivially
 * weak passwords. These rules balance security (no "password123") with
 * usability (no special character requirement that frustrates users).
 *
 * Used by:
 * - `app/api/auth/signup/route.ts` — server-side validation before calling Supabase Auth
 *
 * NOTE: Zod v4 uses `z.email()` as a top-level function instead of the
 * deprecated `z.string().email()` from Zod v3.
 *
 * @example
 * ```typescript
 * const result = signupSchema.safeParse({
 *   email: "publisher@example.com",
 *   password: "SecurePass1",
 * });
 *
 * if (!result.success) {
 *   // result.error contains Zod validation issues
 *   console.error(result.error.issues);
 * }
 * ```
 *
 * @see {@link loginSchema} for the login validation equivalent (no password strength check)
 */
export const signupSchema = z.object({
  email: z.email("Invalid email format"),
  password: z
    .string()
    .min(8, "password must be at least 8 characters")
    .regex(/[A-Z]/, "password must contain at least one uppercase letter")
    .regex(/\d/, "password must contain at least one digit"),
});

/**
 * TypeScript type inferred from signupSchema.
 * Use this to type function parameters that accept signup input.
 *
 * @example
 * ```typescript
 * function processSignup(input: SignupInput) {
 *   // input.email is string, input.password is string
 * }
 * ```
 */
export type SignupInput = z.infer<typeof signupSchema>;

/**
 * Schema for POST /api/auth/login request body.
 *
 * Validates login input with minimal constraints:
 * - email: Must be a valid email format
 * - password: Must be a non-empty string (no strength validation)
 *
 * WHY no password strength check on login:
 * Password rules are only enforced at signup (account creation).
 * On login, we accept any non-empty password and let Supabase Auth
 * determine if it matches. This prevents confusing error messages
 * if password rules change after the user created their account.
 *
 * Used by:
 * - `app/api/auth/login/route.ts` — server-side validation before calling Supabase Auth
 *
 * @example
 * ```typescript
 * const result = loginSchema.safeParse({
 *   email: "publisher@example.com",
 *   password: "SecurePass1",
 * });
 * ```
 *
 * @see {@link signupSchema} for the signup validation equivalent (with password strength)
 */
export const loginSchema = z.object({
  email: z.email("Invalid email format"),
  password: z.string().min(1, "password is required"),
});

/**
 * TypeScript type inferred from loginSchema.
 * Use this to type function parameters that accept login input.
 */
export type LoginInput = z.infer<typeof loginSchema>;

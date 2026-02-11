import { z } from "zod";

/**
 * Schema for POST /api/workspaces request body.
 *
 * Validates workspace creation input:
 * - name: Required, trimmed, 1-255 characters.
 *   Trimming prevents names that are just whitespace.
 *   Max 255 is a reasonable limit for a company/workspace name.
 *
 * Used by:
 * - `app/api/workspaces/route.ts` — server-side validation on POST
 *
 * @example
 * ```typescript
 * const result = createWorkspaceSchema.safeParse({ name: "Acme Publishing" });
 * if (result.success) {
 *   // result.data.name is "Acme Publishing" (trimmed)
 * }
 * ```
 */
export const createWorkspaceSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "name must not be empty")
    .max(255, "name must be at most 255 characters"),
});

/**
 * TypeScript type inferred from createWorkspaceSchema.
 */
export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

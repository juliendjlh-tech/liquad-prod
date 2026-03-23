import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { importSitemapSchema } from "@/lib/validations/content.schema";
import { importFromSitemap } from "@/lib/services/content.service";
import type { Json } from "@/lib/db/types";

/**
 * POST /api/contents/import
 *
 * Import contents from a sitemap.xml URL into a workspace (async).
 * Supports optional path filters and max page limits.
 *
 * REQUEST BODY (JSON):
 * ```json
 * {
 *   "url": "https://example.com/sitemap.xml",
 *   "path_rules": [{ "operator": "starts_with", "value": "/blog" }],
 *   "path_logic": "AND",
 *   "max_pages": 500
 * }
 * ```
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace to import into
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Validate request body
    const body = await request.json();
    const validation = importSitemapSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    // Step 2: Extract workspace_id from header
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    // Auth check
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Step 3: Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { error: "Forbidden" },
        { status: 403 }
      );
    }

    // Step 3b: Fetch workspace max_pages to cap the import
    const { path_rules, path_logic, max_pages: requestedMax } = validation.data;
    let effectiveMax: number | undefined;
    if (requestedMax !== undefined) {
      const { data: workspace } = await supabase
        .from("workspaces")
        .select("max_pages")
        .eq("id", workspaceId)
        .single();
      const wsMax = workspace?.max_pages ?? 2000;
      effectiveMax = Math.min(requestedMax, wsMax);
    }

    // Step 4: Create import job record
    const url = validation.data.url;
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        workspace_id: workspaceId,
        sitemap_url: url,
        status: "pending",
        path_rules: path_rules as unknown as Json ?? null,
        max_pages: effectiveMax ?? null,
      })
      .select("id")
      .single();

    if (jobError || !job) {
      console.error("Failed to create import job:", jobError?.message);
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    // Step 5: Process import in background after response is sent
    after(async () => {
      // Create a fresh Supabase client for the background task
      const bgSupabase = await createServerClient();

      try {
        // Mark job as processing
        await bgSupabase
          .from("import_jobs")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", job.id);

        // Run the actual import with filters
        const result = await importFromSitemap(workspaceId, url, {
          pathRules: path_rules,
          pathLogic: path_logic as "AND" | "OR" | undefined,
          maxPages: effectiveMax,
        });

        // Mark job as completed with result
        await bgSupabase
          .from("import_jobs")
          .update({
            status: "completed",
            result: result as unknown as Json,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Import job ${job.id} failed:`, message);

        await bgSupabase
          .from("import_jobs")
          .update({
            status: "failed",
            error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    });

    // Step 6: Return immediately with job ID
    return NextResponse.json(
      { jobId: job.id, status: "pending" },
      { status: 202 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

import { NextRequest, NextResponse, after } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import { importSitemapSchema } from "@/lib/validations/content.schema";
import { importFromSitemap } from "@/lib/services/content.service";
import { evaluatePathRule, type PathRule } from "@/lib/validations/catalog.schema";
import { startScrapePipeline } from "@/lib/services/scrape-pipeline.service";
import type { Json } from "@/lib/db/types";

/**
 * POST /api/contents/import
 *
 * Single entry point for importing and re-indexing domain content.
 *
 * REQUEST BODY (JSON):
 * ```json
 * {
 *   "domain_id": "uuid",
 *   "reindex": false,
 *   "path_rules": [{ "operator": "starts_with", "value": "/blog" }],
 *   "path_logic": "AND",
 *   "max_pages": 500
 * }
 * ```
 *
 * BEHAVIOUR:
 * - reindex=false (default): only imports URLs that don't already exist as sources.
 * - reindex=true + path_rules: surgically deletes sources matching filters,
 *   then re-imports and re-indexes those URLs.
 * - reindex=true + no path_rules: full wipe of the domain sources, then re-import all.
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 *
 * RESPONSES:
 * - 202: Import started (returns jobId)
 * - 400: Validation error or missing sitemap_url on domain
 * - 401: Unauthorized
 * - 403: Forbidden
 * - 404: Domain not found
 * - 409: Another import job is already running for this domain
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // ── Step 1: Validate request body ─────────────────────────────────────
    const body = await request.json();
    const validation = importSitemapSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { domain_id, reindex, path_rules, path_logic, max_pages: requestedMax } = validation.data;

    // ── Step 2: Extract workspace_id from header ──────────────────────────
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    // ── Step 3: Auth check ────────────────────────────────────────────────
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify workspace membership
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // ── Step 4: Fetch domain (single source of truth for sitemap_url) ─────
    const { data: domain } = await supabase
      .from("domains")
      .select("id, domain, sitemap_url")
      .eq("id", domain_id)
      .eq("workspace_id", workspaceId)
      .single();

    if (!domain) {
      return NextResponse.json({ error: "Domain not found" }, { status: 404 });
    }

    if (!domain.sitemap_url) {
      return NextResponse.json(
        { error: "No sitemap URL configured for this domain. Set it first." },
        { status: 400 }
      );
    }

    // ── Step 5: Concurrency check — reject if a job is already running ────
    const { data: runningJob } = await supabase
      .from("import_jobs")
      .select("id")
      .eq("domain_id", domain_id)
      .in("status", ["pending", "processing"])
      .limit(1)
      .maybeSingle();

    if (runningJob) {
      return NextResponse.json(
        { error: "CONFLICT", message: "An import job is already running for this domain.", runningJobId: runningJob.id },
        { status: 409 }
      );
    }

    // ── Step 6: Apply workspace max_pages cap ─────────────────────────────
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

    // ── Step 7: Create import job with domain_id ──────────────────────────
    const { data: job, error: jobError } = await supabase
      .from("import_jobs")
      .insert({
        workspace_id: workspaceId,
        domain_id: domain_id,
        sitemap_url: domain.sitemap_url,
        reindex,
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

    // ── Step 8: Process in background after response is sent ──────────────
    after(async () => {
      const bgSupabase = await createServerClient();

      try {
        // Mark job as processing
        await bgSupabase
          .from("import_jobs")
          .update({ status: "processing", updated_at: new Date().toISOString() })
          .eq("id", job.id);

        // If reindex is true, wipe sources (chunks cascade via FK) before re-importing
        if (reindex) {
          if (path_rules && path_rules.length > 0) {
            // Surgical wipe: only delete sources for URLs matching the filters.
            const logic = path_logic ?? "AND";
            const PAGE_SIZE = 1000;
            let from = 0;

            while (true) {
              const { data: rows } = await bgSupabase
                .from("sources")
                .select("id, source_url")
                .eq("domain_id", domain_id)
                .range(from, from + PAGE_SIZE - 1);

              if (!rows || rows.length === 0) break;

              const sourcesToWipe = rows.filter((r) => {
                const pathname = new URL(r.source_url).pathname;
                return logic === "AND"
                  ? (path_rules as PathRule[]).every((rule) => evaluatePathRule(pathname, rule))
                  : (path_rules as PathRule[]).some((rule) => evaluatePathRule(pathname, rule));
              });

              if (sourcesToWipe.length > 0) {
                await bgSupabase
                  .from("sources")
                  .delete()
                  .in("id", sourcesToWipe.map((s) => s.id));
              }

              if (rows.length < PAGE_SIZE) break;
              from += PAGE_SIZE;
            }
          } else {
            // Full wipe: delete ALL sources for this domain.
            // Chunks + catalog_sources are cleaned up via ON DELETE CASCADE.
            await bgSupabase
              .from("sources")
              .delete()
              .eq("domain_id", domain_id);
          }
        }

        // Import from sitemap (creates source rows for new/wiped URLs).
        const result = await importFromSitemap(workspaceId, domain.sitemap_url!, {
          pathRules: path_rules as PathRule[] | undefined,
          pathLogic: path_logic as "AND" | "OR" | undefined,
          maxPages: effectiveMax,
        });

        // Store urls_to_index on the job (immutable after this point).
        await bgSupabase
          .from("import_jobs")
          .update({
            status: "completed",
            result: result as unknown as Json,
            urls_to_index: result.filteredUrls,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);

        // Start the scraping pipeline (chunks + embeddings + catalog linking).
        await startScrapePipeline(job.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        console.error(`Import job ${job.id} failed:`, message);

        await bgSupabase
          .from("import_jobs")
          .update({
            status: "failed",
            error_message: message,
            scrape_status: "error",
            scrape_error_message: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", job.id);
      }
    });

    // ── Step 9: Return immediately ────────────────────────────────────────
    return NextResponse.json(
      { jobId: job.id, status: "pending", reindex },
      { status: 202 }
    );
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

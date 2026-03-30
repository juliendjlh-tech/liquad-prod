import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import {
  getDomainDeleteImpact,
  deleteDomain,
} from "@/lib/services/content.service";

/**
 * GET /api/domains/:id
 *
 * Returns domain info, deletion impact, and indexing status.
 *
 * DELETE /api/domains/:id
 *
 * Delete a domain with catalog cleanup.
 * Sources + chunks are cascade-deleted. Catalogs referencing this domain
 * have their filter_rules cleaned (domain_id removed).
 */

async function authCheck(request: NextRequest, workspaceId: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .single();

  return membership ? user : null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: domainId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const user = await authCheck(request, workspaceId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createServerClient();
    const { data: domainRow } = await supabase
      .from("domains")
      .select("domain, sitemap_url")
      .eq("id", domainId)
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (!domainRow) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const impact = await getDomainDeleteImpact(domainId, workspaceId);
    if (!impact) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Fetch the latest import job for this domain to get indexing status.
    const { data: latestJob } = await supabase
      .from("import_jobs")
      .select(
        "id, scrape_status, scrape_processed_pages, scrape_error_message, urls_to_index, updated_at"
      )
      .eq("domain_id", domainId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Compute scrape_total_pages from urls_to_index.length
    const urlsToIndex: string[] = (latestJob?.urls_to_index as string[]) ?? [];
    const scrapeTotalPages = urlsToIndex.length;

    // Compute scrape_chunk_count from chunks table
    let scrapeChunkCount = 0;
    if (latestJob?.id) {
      const { count } = await supabase
        .from("chunks")
        .select("id", { count: "exact", head: true })
        .eq("import_job_id", latestJob.id)
        .not("embedding", "is", null);
      scrapeChunkCount = count ?? 0;
    }

    return NextResponse.json({
      domain: domainRow.domain,
      sitemap_url: domainRow.sitemap_url,
      ...impact,
      scrape_status: latestJob?.scrape_status ?? null,
      scrape_total_pages: scrapeTotalPages,
      scrape_processed_pages: latestJob?.scrape_processed_pages ?? null,
      scrape_chunk_count: scrapeChunkCount,
      scrape_error_message: latestJob?.scrape_error_message ?? null,
      last_scraped_at: latestJob?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    const { id: domainId } = await params;
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const user = await authCheck(request, workspaceId);
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const deleted = await deleteDomain(domainId, workspaceId);
    if (!deleted) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id: domainId });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

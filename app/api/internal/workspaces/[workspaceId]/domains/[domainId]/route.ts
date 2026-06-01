import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/db/supabase-server";
import {
  getDomainDeleteImpact,
  deleteDomain,
} from "@/lib/services/content.service";
import {
  requireWorkspaceMembership,
  resolveResourceId,
} from "@/lib/services/workspace-resolver";

/**
 * GET /api/internal/workspaces/:workspaceId/domains/:domainId
 *
 * Returns domain info, deletion impact, and the latest indexing status.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; domainId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, domainId: domParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const domainId = await resolveResourceId("domains", domParam);
    if (!domainId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

    const { data: latestJob } = await supabase
      .from("indexing_jobs")
      .select("status, error_message, urls_to_index, updated_at")
      .eq("domain_id", domainId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const urlsToIndex: string[] = (latestJob?.urls_to_index as string[]) ?? [];

    return NextResponse.json({
      domain: domainRow.domain,
      sitemap_url: domainRow.sitemap_url,
      ...impact,
      index_status: latestJob?.status ?? null,
      index_total_urls: urlsToIndex.length,
      index_error_message: latestJob?.error_message ?? null,
      index_last_run_at: latestJob?.updated_at ?? null,
    });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/**
 * DELETE /api/internal/workspaces/:workspaceId/domains/:domainId
 *
 * Delete a domain with catalog cleanup. Sources + chunks cascade-delete.
 * Catalogs referencing this domain have their filter_rules cleaned.
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; domainId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: wsParam, domainId: domParam } = await params;
    const auth = await requireWorkspaceMembership(wsParam);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const domainId = await resolveResourceId("domains", domParam);
    if (!domainId) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
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

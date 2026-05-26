import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase-server";
import { getDomainsWithContentCount } from "@/lib/services/content.service";
import { canonicalizeHostname } from "@/lib/utils/hostname";
import { generatePublicId } from "@/lib/ids";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

const createDomainSchema = z.object({
  url: z
    .string()
    .url("Invalid URL format")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL must use http or https protocol"
    ),
});

/**
 * GET /api/internal/workspaces/:workspaceId/domains
 * List domains for the workspace with content counts.
 *
 * Optional ?search= filters by domain name substring.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const search = request.nextUrl.searchParams.get("search") ?? undefined;
    const domains = await getDomainsWithContentCount(workspaceId, search);

    return NextResponse.json(domains, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/internal/workspaces/:workspaceId/domains
 * Create a new domain from a sitemap URL.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> }
): Promise<NextResponse> {
  try {
    const { workspaceId: param } = await params;
    const auth = await requireWorkspaceMembership(param);
    if (!auth.ok) return auth.response;
    const { workspaceId } = auth.workspace;

    const body = await request.json();
    const validation = createDomainSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { url } = validation.data;
    const hostname = canonicalizeHostname(new URL(url).hostname);

    const supabase = await createServerClient();

    const { data: existing } = await supabase
      .from("domains")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("domain", hostname)
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "DOMAIN_EXISTS", domain: hostname },
        { status: 409 }
      );
    }

    const { data: claimed } = await supabase
      .from("domains")
      .select("id")
      .eq("domain", hostname)
      .eq("status", "verified")
      .neq("workspace_id", workspaceId)
      .maybeSingle();

    if (claimed) {
      return NextResponse.json(
        { error: "DOMAIN_CLAIMED", domain: hostname },
        { status: 409 }
      );
    }

    const { data: domain, error: insertError } = await supabase
      .from("domains")
      .insert({
        public_id: generatePublicId("dom"),
        workspace_id: workspaceId,
        domain: hostname,
        sitemap_url: url,
      })
      .select("id, domain, sitemap_url")
      .single();

    if (insertError || !domain) {
      return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }

    return NextResponse.json(domain, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

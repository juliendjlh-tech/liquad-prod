import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase-server";
import { getDomainsWithContentCount } from "@/lib/services/content.service";

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
 * GET /api/domains
 *
 * List domains for a workspace with content counts.
 *
 * QUERY PARAMETERS:
 * - workspace_id (required): UUID of the workspace
 * - search (optional): Filter by domain name substring
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = request.nextUrl;

    const workspaceId = searchParams.get("workspace_id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "workspace_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const search = searchParams.get("search") ?? undefined;
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
 * POST /api/domains
 *
 * Create a new domain from a sitemap URL.
 *
 * REQUEST BODY (JSON):
 * ```json
 * { "url": "https://example.com/sitemap.xml" }
 * ```
 *
 * HEADERS:
 * - x-workspace-id: UUID of the workspace
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = createDomainSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "MISSING_PARAM", message: "x-workspace-id header is required" },
        { status: 400 }
      );
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .single();

    if (!membership) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { url } = validation.data;
    const hostname = new URL(url).hostname;

    // Check domain uniqueness within workspace
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

    const { data: domain, error: insertError } = await supabase
      .from("domains")
      .insert({
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

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/db/supabase-server";
import { fetchAndParseSitemap } from "@/lib/services/content.service";
import { evaluatePathRule, pathRuleSchema } from "@/lib/validations/catalog.schema";
import { canonicalizeHostname } from "@/lib/utils/hostname";
import { requireWorkspaceMembership } from "@/lib/services/workspace-resolver";

const previewSchema = z.object({
  url: z
    .string()
    .url("Invalid URL format")
    .refine(
      (url) => url.startsWith("http://") || url.startsWith("https://"),
      "URL must use http or https protocol"
    ),
  domain_id: z.string().uuid().optional(),
  path_rules: z.array(pathRuleSchema).optional(),
  path_logic: z.enum(["AND", "OR"]).default("AND").optional(),
});

/**
 * POST /api/internal/workspaces/:workspaceId/contents/index/preview
 *
 * Fetch a sitemap and preview which URLs match the given filters. Returns
 * total count, matched count, and the first 50 matched URLs.
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
    const validation = previewSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Validation failed", issues: validation.error.issues },
        { status: 400 }
      );
    }

    const { url, domain_id, path_rules, path_logic } = validation.data;

    const supabase = await createServerClient();

    if (!domain_id) {
      const hostname = canonicalizeHostname(new URL(url).hostname);
      const { data: existingDomain } = await supabase
        .from("domains")
        .select("id")
        .eq("workspace_id", workspaceId)
        .eq("domain", hostname)
        .maybeSingle();

      if (existingDomain) {
        return NextResponse.json(
          { error: "DOMAIN_EXISTS", domain: hostname },
          { status: 409 }
        );
      }
    }

    const entries = await fetchAndParseSitemap(url);

    let matched = entries;
    if (path_rules && path_rules.length > 0) {
      const logic = path_logic ?? "AND";
      matched = entries.filter((entry) => {
        const pathname = new URL(entry.loc).pathname;
        return logic === "AND"
          ? path_rules.every((rule) => evaluatePathRule(pathname, rule))
          : path_rules.some((rule) => evaluatePathRule(pathname, rule));
      });
    }

    return NextResponse.json({
      total: entries.length,
      matched: matched.length,
      matched_urls: matched.slice(0, 50).map((e) => e.loc),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "FETCH_FAILED" || message === "INVALID_SITEMAP") {
      return NextResponse.json({ error: message }, { status: 422 });
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

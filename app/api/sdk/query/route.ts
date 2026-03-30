import { NextRequest, NextResponse } from "next/server";
import { querySchema } from "@/lib/validations/query.schema";
import { executeRagQuery } from "@/lib/services/rag-query.service";

/**
 * POST /api/sdk/query
 *
 * Semantic search (RAG) endpoint for consumers.
 * Searches content chunks using vector similarity and charges per result.
 *
 * AUTH:
 * Authorization: Bearer lq_...  (API key, same as /api/sdk/authorize)
 * User-Agent: GPTBot/1.0       (used for access control per catalog)
 *
 * REQUEST BODY:
 * {
 *   "query": "How does billing work?",
 *   "catalog_ids": ["uuid1", "uuid2"],      // or search_config_id
 *   "max_results": 5,
 *   "dry_run": false
 * }
 *
 * RESPONSES:
 * - 200: Results with snippets + billing info (or empty results)
 * - 401: Invalid API key
 * - 402: Insufficient balance
 * - 403: User-Agent not authorized on catalog
 * - 404: Catalog not found, inactive, or RAG not enabled
 * - 422: Validation error
 * - 429: Rate limit exceeded (future)
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    // Step 1: Parse and validate the request body
    const body = await request.json();
    const validation = querySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "validation_error", issues: validation.error.issues },
        { status: 422 }
      );
    }

    // Step 2: Extract auth and user-agent headers
    const authHeader = request.headers.get("authorization");
    const userAgent = request.headers.get("user-agent");

    // Step 3: Execute the RAG query
    const result = await executeRagQuery(authHeader, userAgent, validation.data);

    // Step 4: Map the typed result to an HTTP response
    if ("error" in result) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.details ?? {}),
        },
        { status: result.status }
      );
    }

    // Success or dry_run — return 200
    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

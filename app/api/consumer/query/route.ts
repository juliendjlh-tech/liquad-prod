import { NextRequest, NextResponse } from "next/server";
import { querySchema } from "@/lib/validations/query.schema";
import { executeRagQuery } from "@/lib/services/rag-query";

/**
 * POST /api/consumer/query
 *
 * Semantic search (RAG) endpoint for consumers.
 * Searches content chunks using vector similarity and charges per result.
 * Returns bot-bound signed tokens for each result.
 *
 * AUTH:
 * Authorization: Bearer lq_...  (consumer API key)
 *
 * REQUEST BODY:
 * {
 *   "query": "How does billing work?",
 *   "agent_id": "uuid",
 *   "catalog_ids": ["uuid1", "uuid2"],      // or search_config_id
 *   "max_results": 5,
 *   "dry_run": false
 * }
 *
 * RESPONSES:
 * - 200: Results with snippets, tokens + billing info (or empty results)
 * - 401: Invalid API key
 * - 402: Insufficient balance
 * - 403: Agent not authorized on catalog
 * - 404: Catalog not found, inactive, or RAG not enabled
 * - 422: Validation error
 */
export async function POST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = await request.json();
    const validation = querySchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "validation_error", issues: validation.error.issues },
        { status: 422 }
      );
    }

    const authHeader = request.headers.get("authorization");

    const result = await executeRagQuery(authHeader, validation.data);

    if ("error" in result) {
      return NextResponse.json(
        {
          error: result.error,
          ...(result.details ?? {}),
        },
        { status: result.status }
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch {
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Step 3: Validate catalogs exist, are active, and have rag_enabled
// ---------------------------------------------------------------------------

import type { PipelineStep } from "../types";
import { getCatalogs } from "@/lib/db/queries/catalogs";

/**
 * Fetch catalog rows from the database and verify they are all
 * active with RAG enabled. Sets ctx.catalogs on success.
 */
export const validateCatalogs: PipelineStep = async (ctx) => {
  const { catalogIds } = ctx;

  const catalogs = await getCatalogs(catalogIds!);

  if (catalogs.length === 0) {
    return { error: "catalogs_not_found", status: 404 };
  }

  // Check all catalogs are active and RAG-enabled
  for (const cat of catalogs) {
    if (cat.status !== "active") {
      return {
        error: "catalog_inactive",
        status: 404,
        details: { catalog_id: cat.id },
      };
    }
    if (!cat.rag_enabled) {
      return {
        error: "rag_not_enabled",
        status: 404,
        details: { catalog_id: cat.id },
      };
    }
  }

  ctx.catalogs = catalogs;
};

"use client";

import { useState, useEffect, useCallback } from "react";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";
import ConfirmDialog from "@/app/components/ui/ConfirmDialog";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Operators available for path_filters (must match search-config.schema.ts). */
const PATH_OPERATORS = [
  { value: "starts_with", label: "Starts with" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "not_starts_with", label: "Does not start with" },
  { value: "ends_with", label: "Ends with" },
  { value: "equals", label: "Equals" },
] as const;

type PathOperator = (typeof PATH_OPERATORS)[number]["value"];

interface PathFilterRow {
  operator: PathOperator;
  value: string;
}

interface SearchConfig {
  id: string;
  name: string;
  catalog_ids: string[];
  path_filters: PathFilterRow[];
  max_price_eur: number | null;
  total_budget_eur: number | null;
  max_results: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Empty form state factory
// ---------------------------------------------------------------------------

function emptyForm() {
  return {
    name: "",
    // Raw textarea value — user pastes comma-separated UUIDs
    catalogIdsRaw: "",
    pathFilters: [] as PathFilterRow[],
    maxPriceEur: "",
    totalBudgetEur: "",
    maxResults: "5",
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function SearchConfigsTab() {
  const { id: workspaceId } = useWorkspace();

  // List state
  const [configs, setConfigs] = useState<SearchConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state: "list" | "create" | "edit"
  const [view, setView] = useState<"list" | "create" | "edit">("list");
  const [editingConfig, setEditingConfig] = useState<SearchConfig | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Deletion
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // ── Fetch list ────────────────────────────────────────────────────────────

  const fetchConfigs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/search-configs", {
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) {
        const data = await res.json();
        setConfigs(data.items ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => { void fetchConfigs(); }, [fetchConfigs]);

  // ── Form helpers ──────────────────────────────────────────────────────────

  /** Parse the raw catalog IDs textarea into a clean array of UUIDs. */
  function parseCatalogIds(raw: string): string[] {
    return raw
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  /** Open create form. */
  function openCreate() {
    setEditingConfig(null);
    setForm(emptyForm());
    setFormError(null);
    setView("create");
  }

  /** Open edit form pre-filled with an existing config. */
  function openEdit(config: SearchConfig) {
    setEditingConfig(config);
    setForm({
      name: config.name,
      catalogIdsRaw: config.catalog_ids.join(", "),
      pathFilters: config.path_filters.length > 0
        ? config.path_filters
        : [],
      maxPriceEur: config.max_price_eur != null ? String(config.max_price_eur) : "",
      totalBudgetEur: config.total_budget_eur != null ? String(config.total_budget_eur) : "",
      maxResults: String(config.max_results),
    });
    setFormError(null);
    setView("edit");
  }

  function cancelForm() {
    setView("list");
    setEditingConfig(null);
    setFormError(null);
  }

  // ── Path filter rows ──────────────────────────────────────────────────────

  function addPathFilter() {
    setForm((f) => ({
      ...f,
      pathFilters: [...f.pathFilters, { operator: "starts_with", value: "" }],
    }));
  }

  function removePathFilter(index: number) {
    setForm((f) => ({
      ...f,
      pathFilters: f.pathFilters.filter((_, i) => i !== index),
    }));
  }

  function updatePathFilter(index: number, field: keyof PathFilterRow, value: string) {
    setForm((f) => {
      const updated = [...f.pathFilters];
      updated[index] = { ...updated[index], [field]: value };
      return { ...f, pathFilters: updated };
    });
  }

  // ── Save (create or update) ───────────────────────────────────────────────

  async function handleSave() {
    setFormError(null);

    const catalogIds = parseCatalogIds(form.catalogIdsRaw);
    if (catalogIds.length === 0) {
      setFormError("At least one catalog ID is required.");
      return;
    }
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }

    // Validate path filters have non-empty values
    const invalidFilter = form.pathFilters.find((f) => !f.value.trim());
    if (invalidFilter) {
      setFormError("All path filters must have a non-empty value.");
      return;
    }

    const maxResults = parseInt(form.maxResults, 10);
    if (isNaN(maxResults) || maxResults < 1 || maxResults > 20) {
      setFormError("Max results must be between 1 and 20.");
      return;
    }

    const body: Record<string, unknown> = {
      name: form.name.trim(),
      catalog_ids: catalogIds,
      path_filters: form.pathFilters,
      max_results: maxResults,
      max_price_eur: form.maxPriceEur !== "" ? parseFloat(form.maxPriceEur) : undefined,
      total_budget_eur: form.totalBudgetEur !== "" ? parseFloat(form.totalBudgetEur) : undefined,
    };

    setSaving(true);
    try {
      const isEdit = view === "edit" && editingConfig;
      const url = isEdit
        ? `/api/search-configs/${editingConfig.id}`
        : "/api/search-configs";
      const method = isEdit ? "PATCH" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-workspace-id": workspaceId,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const json = await res.json();
        setFormError(json.error ?? "Failed to save.");
        return;
      }

      showToast(isEdit ? "Search config updated" : "Search config created", "success");
      await fetchConfigs();
      setView("list");
    } catch {
      setFormError("Network error. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  // ── Delete ────────────────────────────────────────────────────────────────

  async function handleDelete() {
    if (!deletingId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/search-configs/${deletingId}`, {
        method: "DELETE",
        headers: { "x-workspace-id": workspaceId },
      });
      if (res.ok) {
        showToast("Search config deleted", "success");
        await fetchConfigs();
      } else {
        showToast("Failed to delete", "error");
      }
    } finally {
      setDeleting(false);
      setDeletingId(null);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div>
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.type === "success" ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deletingId}
        title="Delete this search config?"
        description="Existing SDK integrations using this search_config_id will stop working. This action cannot be undone."
        confirmLabel={deleting ? "Deleting..." : "Delete"}
        variant="danger"
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
      />

      {/* ── LIST VIEW ── */}
      {view === "list" && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-gray-500">
              Search configs are reusable presets for SDK queries (catalogs, filters, budget).
            </p>
            <Button size="sm" onClick={openCreate}>
              New search config
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading...</div>
          ) : configs.length === 0 ? (
            <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
              <p className="text-gray-500 mb-2">No search configs yet</p>
              <p className="text-xs text-gray-400">
                Create a preset to simplify your SDK query calls.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Catalogs</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Path filters</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Max results</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Budget (EUR)</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {configs.map((config) => (
                    <tr key={config.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3">
                        <div className="text-sm font-medium text-gray-900">{config.name}</div>
                        <div className="text-xs text-gray-400 font-mono mt-0.5 truncate max-w-[180px]">
                          {config.id}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {config.catalog_ids.length} catalog{config.catalog_ids.length !== 1 ? "s" : ""}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        {config.path_filters.length > 0 ? (
                          <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs text-blue-700">
                            {config.path_filters.length} filter{config.path_filters.length !== 1 ? "s" : ""}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {config.max_results}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 text-right">
                        {config.total_budget_eur != null
                          ? `${config.total_budget_eur.toFixed(4)}`
                          : <span className="text-gray-400">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => openEdit(config)}
                            className="text-sm text-blue-600 hover:text-blue-800"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => setDeletingId(config.id)}
                            className="text-sm text-red-600 hover:text-red-800"
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ── FORM VIEW (create or edit) ── */}
      {(view === "create" || view === "edit") && (
        <div className="max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-gray-900">
              {view === "create" ? "New search config" : `Edit — ${editingConfig?.name}`}
            </h2>
            <button
              onClick={cancelForm}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              ← Back
            </button>
          </div>

          <div className="space-y-5">
            {/* Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="e.g. Docs API v2"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Catalog IDs */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Catalog IDs <span className="text-red-500">*</span>
              </label>
              <textarea
                value={form.catalogIdsRaw}
                onChange={(e) => setForm((f) => ({ ...f, catalogIdsRaw: e.target.value }))}
                placeholder={"Paste one or more catalog UUIDs, separated by commas or newlines.\ne.g. 3f2a..., 7b1c..."}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-400 mt-1">
                {parseCatalogIds(form.catalogIdsRaw).length} catalog ID
                {parseCatalogIds(form.catalogIdsRaw).length !== 1 ? "s" : ""} detected
              </p>
            </div>

            {/* Path filters */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">
                  Path filters
                  <span className="ml-1 text-xs font-normal text-gray-400">(OR logic — result matches any filter)</span>
                </label>
                <button
                  type="button"
                  onClick={addPathFilter}
                  className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                >
                  + Add filter
                </button>
              </div>

              {form.pathFilters.length === 0 ? (
                <p className="text-sm text-gray-400 italic">No path filters — all URLs in selected catalogs will be returned.</p>
              ) : (
                <div className="space-y-2">
                  {form.pathFilters.map((filter, i) => (
                    <div key={i} className="flex items-center gap-2">
                      {/* Operator select */}
                      <select
                        value={filter.operator}
                        onChange={(e) => updatePathFilter(i, "operator", e.target.value)}
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        {PATH_OPERATORS.map((op) => (
                          <option key={op.value} value={op.value}>{op.label}</option>
                        ))}
                      </select>

                      {/* Value input */}
                      <input
                        type="text"
                        value={filter.value}
                        onChange={(e) => updatePathFilter(i, "value", e.target.value)}
                        placeholder="/docs/api/"
                        className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />

                      {/* Remove */}
                      <button
                        type="button"
                        onClick={() => removePathFilter(i)}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                        aria-label="Remove filter"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Max results + pricing — side by side */}
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max results
                </label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={form.maxResults}
                  onChange={(e) => setForm((f) => ({ ...f, maxResults: e.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">1 – 20</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Max price / result (EUR)
                </label>
                <input
                  type="number"
                  min={0}
                  max={1}
                  step={0.0001}
                  value={form.maxPriceEur}
                  onChange={(e) => setForm((f) => ({ ...f, maxPriceEur: e.target.value }))}
                  placeholder="0.0100"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Optional</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Total budget (EUR)
                </label>
                <input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={form.totalBudgetEur}
                  onChange={(e) => setForm((f) => ({ ...f, totalBudgetEur: e.target.value }))}
                  placeholder="0.1000"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">Optional</p>
              </div>
            </div>

            {/* Error */}
            {formError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {formError}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 pt-2">
              <Button onClick={handleSave} loading={saving}>
                {view === "create" ? "Create" : "Save changes"}
              </Button>
              <Button variant="secondary" onClick={cancelForm} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

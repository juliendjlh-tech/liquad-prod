"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface SubscriptionOption {
  id: string;
  public_id: string;
  label: string | null;
  external_user_id: string | null;
  archived_at: string | null;
}

interface SubscriptionPickerProps {
  workspaceId: string;
  /** Selected subscription UUID, or null when nothing is picked. */
  value: string | null;
  onChange: (sub: SubscriptionOption | null) => void;
  /** Hide rows with archived_at set. Defaults to true. */
  excludeArchived?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}

const MIN_QUERY_LENGTH = 2;
const DEBOUNCE_MS = 250;

export default function SubscriptionPicker({
  workspaceId,
  value,
  onChange,
  excludeArchived = true,
  placeholder = "sub_…",
  autoFocus = false,
}: SubscriptionPickerProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SubscriptionOption[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const search = useCallback(
    async (prefix: string) => {
      setLoading(true);
      setError(null);
      try {
        const url = `/api/internal/workspaces/${workspaceId}/subscriptions?public_id_prefix=${encodeURIComponent(prefix)}&limit=20`;
        const res = await fetch(url);
        if (!res.ok) {
          setError("Search failed");
          setResults([]);
          return;
        }
        const items = (await res.json()) as SubscriptionOption[];
        const filtered = excludeArchived ? items.filter((s) => !s.archived_at) : items;
        setResults(filtered);
      } catch {
        setError("Search failed");
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [workspaceId, excludeArchived],
  );

  // Debounced search on query change
  useEffect(() => {
    if (query.length < MIN_QUERY_LENGTH) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => void search(query), DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [query, search]);

  const handleSelect = (sub: SubscriptionOption) => {
    setSelectedLabel(formatRow(sub));
    setQuery(sub.public_id);
    setOpen(false);
    onChange(sub);
  };

  const handleClear = () => {
    setQuery("");
    setSelectedLabel(null);
    setResults([]);
    setOpen(false);
    onChange(null);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={query}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedLabel(null);
            if (value) onChange(null);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
        />
        {value && (
          <button
            type="button"
            onClick={handleClear}
            className="text-xs text-gray-500 hover:text-gray-700"
          >
            Clear
          </button>
        )}
      </div>

      {selectedLabel && value && (
        <div className="mt-1 text-xs text-gray-600">{selectedLabel}</div>
      )}

      {open && query.length >= MIN_QUERY_LENGTH && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          {loading && (
            <div className="px-3 py-2 text-xs text-gray-500">Searching…</div>
          )}
          {!loading && error && (
            <div className="px-3 py-2 text-xs text-red-600">{error}</div>
          )}
          {!loading && !error && results.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">
              No subscription matches “{query}”.
            </div>
          )}
          {!loading && results.length > 0 && (
            <ul className="max-h-72 overflow-y-auto">
              {results.map((s) => (
                <li
                  key={s.id}
                  onClick={() => handleSelect(s)}
                  className="cursor-pointer px-3 py-2 text-sm hover:bg-blue-50"
                >
                  <div className="font-mono text-xs text-gray-900">{s.public_id}</div>
                  <div className="text-xs text-gray-500">
                    {s.label ?? "Unlabeled"}
                    {s.external_user_id ? ` · ${s.external_user_id}` : ""}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {query.length > 0 && query.length < MIN_QUERY_LENGTH && (
        <div className="mt-1 text-[11px] text-gray-400">
          Type at least {MIN_QUERY_LENGTH} characters.
        </div>
      )}
    </div>
  );
}

function formatRow(s: SubscriptionOption): string {
  const parts = [s.label ?? "Unlabeled"];
  if (s.external_user_id) parts.push(s.external_user_id);
  return parts.join(" · ");
}

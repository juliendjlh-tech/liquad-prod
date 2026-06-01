"use client";

// ---------------------------------------------------------------------------
// /dashboard/publisher/distribute/access-settings/new
//
// Shared access-settings creation wizard. Reached from two entry points:
//   1. Access Settings list  → "+ New access setting"   (no query params)
//   2. Subscription detail   → "+ Add integration"      (?subscription_id=…)
//
// One access_settings row is created per selected bot. Steps:
//   1. Pick one or more bots (+ shared name + price ceiling).
//   2. Pick catalogues from the UNION of catalogues eligible (catalog_bots)
//      across the selected bots.
//   3. Per-bot recap: for each access_settings that will be created, show
//      which selected catalogues are backed by a catalog_bot for that bot and
//      which are not. Only the matching catalogues are attached; a bot with no
//      matching catalogue is skipped (the API requires ≥1 catalogue).
// ---------------------------------------------------------------------------

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useWorkspace } from "@/app/dashboard/workspace-context";
import Button from "@/app/components/ui/Button";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Bot {
  id: string;
  public_id: string;
  name: string;
  ua_pattern: string;
  declared_ips: string[];
  type: "preset" | "custom";
  description?: string | null;
}

interface BotEligibleCatalog {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  workspace_id: string;
  is_own_workspace: boolean;
  price_eur: number;
  status: string;
  domains: string[];
  source_count: number;
}

type Step = 1 | 2 | 3;

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function NewAccessSettingsWizard() {
  const { id: workspaceId } = useWorkspace();
  const router = useRouter();
  const searchParams = useSearchParams();

  const subscriptionPublicId = searchParams.get("subscription_id");
  const botPublicIdParam = searchParams.get("bot_public_id");
  const returnHref = subscriptionPublicId
    ? `/dashboard/publisher/distribute/subscriptions/${subscriptionPublicId}`
    : botPublicIdParam
      ? `/dashboard/publisher/distribute/access-settings/${botPublicIdParam}`
      : "/dashboard/publisher/distribute/access-settings";

  // Wizard position
  const [step, setStep] = useState<Step>(1);

  // Step 1 — bots & shared settings
  const [workspaceBots, setWorkspaceBots] = useState<Bot[]>([]);
  const [recommended, setRecommended] = useState<Bot[]>([]);
  const [manualBots, setManualBots] = useState<Bot[]>([]);
  const [selectedBotIds, setSelectedBotIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState("");
  const [maxPriceRaw, setMaxPriceRaw] = useState("");
  const [loadingBots, setLoadingBots] = useState(true);

  // Add-by-public-id sub-form
  const [publicIdRaw, setPublicIdRaw] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

  // Step 2 — catalogues (cached per bot id)
  const [catalogCache, setCatalogCache] = useState<Record<string, BotEligibleCatalog[]>>({});
  const [loadingCatalogs, setLoadingCatalogs] = useState(false);
  const [selectedCatalogIds, setSelectedCatalogIds] = useState<Set<string>>(new Set());

  // Step 3 — submission
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Fetch bots on mount
  // -----------------------------------------------------------------------

  useEffect(() => {
    let cancel = false;
    setLoadingBots(true);
    Promise.all([
      fetch(`/api/internal/workspaces/${workspaceId}/bots`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/internal/workspaces/${workspaceId}/bots/recommended`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([ws, rec]) => {
        if (cancel) return;
        const wsBots = (ws ?? []) as Bot[];
        setWorkspaceBots(wsBots);
        setRecommended((rec ?? []) as Bot[]);

        // Prefill: bot_public_id from URL → pre-select matching bot.
        if (botPublicIdParam) {
          const match = wsBots.find((b) => b.public_id === botPublicIdParam);
          if (match) {
            setSelectedBotIds(new Set([match.id]));
          }
        }
      })
      .finally(() => { if (!cancel) setLoadingBots(false); });
    return () => { cancel = true; };
  }, [workspaceId, botPublicIdParam]);

  // -----------------------------------------------------------------------
  // Derived bot lists
  // -----------------------------------------------------------------------

  const wsBotIds = useMemo(() => new Set(workspaceBots.map((b) => b.id)), [workspaceBots]);
  const recommendedFiltered = useMemo(
    () => recommended.filter((b) => !wsBotIds.has(b.id)),
    [recommended, wsBotIds],
  );
  const manualFiltered = useMemo(
    () => manualBots.filter((b) => !wsBotIds.has(b.id) && !recommendedFiltered.some((r) => r.id === b.id)),
    [manualBots, wsBotIds, recommendedFiltered],
  );

  const allBots = useMemo(
    () => [...workspaceBots, ...recommendedFiltered, ...manualFiltered],
    [workspaceBots, recommendedFiltered, manualFiltered],
  );
  const selectedBots = useMemo(
    () => allBots.filter((b) => selectedBotIds.has(b.id)),
    [allBots, selectedBotIds],
  );

  const toggleBot = (id: string) => {
    setSelectedBotIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const lookupByPublicId = async () => {
    const pid = publicIdRaw.trim();
    if (!pid) return;
    setLookupError(null);
    setLookupLoading(true);
    try {
      const res = await fetch(
        `/api/internal/workspaces/${workspaceId}/bots/lookup?public_id=${encodeURIComponent(pid)}`,
      );
      if (res.status === 404) { setLookupError("No bot has that public id."); return; }
      if (!res.ok) { setLookupError("Lookup failed. Try again."); return; }
      const bot = (await res.json()) as Bot;
      setManualBots((prev) => (prev.some((b) => b.id === bot.id) ? prev : [...prev, bot]));
      setSelectedBotIds((prev) => new Set(prev).add(bot.id));
      setPublicIdRaw("");
    } finally {
      setLookupLoading(false);
    }
  };

  // -----------------------------------------------------------------------
  // Catalogue loading + derivations
  // -----------------------------------------------------------------------

  const loadCatalogsForSelected = useCallback(async () => {
    const missing = selectedBots.filter((b) => !(b.id in catalogCache));
    if (missing.length === 0) return;
    setLoadingCatalogs(true);
    try {
      const entries = await Promise.all(
        missing.map(async (b) => {
          const res = await fetch(
            `/api/internal/workspaces/${workspaceId}/bots/${b.id}/eligible-catalogs`,
          );
          const body = res.ok ? await res.json() : { catalogs: [] };
          return [b.id, (body.catalogs ?? []) as BotEligibleCatalog[]] as const;
        }),
      );
      setCatalogCache((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    } finally {
      setLoadingCatalogs(false);
    }
  }, [selectedBots, catalogCache, workspaceId]);

  const eligibleSetByBot = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const b of selectedBots) {
      m.set(b.id, new Set((catalogCache[b.id] ?? []).map((c) => c.id)));
    }
    return m;
  }, [selectedBots, catalogCache]);

  const unionCatalogs = useMemo(() => {
    const map = new Map<string, BotEligibleCatalog>();
    for (const b of selectedBots) {
      for (const c of catalogCache[b.id] ?? []) {
        if (!map.has(c.id)) map.set(c.id, c);
      }
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [selectedBots, catalogCache]);

  const catalogById = useMemo(
    () => new Map(unionCatalogs.map((c) => [c.id, c])),
    [unionCatalogs],
  );

  // How many of the selected bots accept each catalogue.
  const botCountByCatalog = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of selectedBots) {
      for (const c of catalogCache[b.id] ?? []) {
        m.set(c.id, (m.get(c.id) ?? 0) + 1);
      }
    }
    return m;
  }, [selectedBots, catalogCache]);

  const toggleCatalog = (id: string) => {
    setSelectedCatalogIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allCatalogsSelected =
    unionCatalogs.length > 0 && selectedCatalogIds.size === unionCatalogs.length;
  const toggleAllCatalogs = () => {
    if (allCatalogsSelected) setSelectedCatalogIds(new Set());
    else setSelectedCatalogIds(new Set(unionCatalogs.map((c) => c.id)));
  };

  // Drop any selected catalogue that is no longer in the union (bot deselected).
  useEffect(() => {
    setSelectedCatalogIds((prev) => {
      const next = new Set([...prev].filter((id) => catalogById.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [catalogById]);

  // -----------------------------------------------------------------------
  // Step 3 recap
  // -----------------------------------------------------------------------

  const nameFor = useCallback(
    (bot: Bot) =>
      selectedBots.length > 1 ? `${name.trim()} — ${bot.name}` : name.trim(),
    [selectedBots.length, name],
  );

  const recap = useMemo(
    () =>
      selectedBots.map((bot) => {
        const set = eligibleSetByBot.get(bot.id) ?? new Set<string>();
        const included: BotEligibleCatalog[] = [];
        const excluded: BotEligibleCatalog[] = [];
        for (const id of selectedCatalogIds) {
          const cat = catalogById.get(id);
          if (!cat) continue;
          if (set.has(id)) included.push(cat);
          else excluded.push(cat);
        }
        return { bot, included, excluded, creatable: included.length > 0 };
      }),
    [selectedBots, eligibleSetByBot, selectedCatalogIds, catalogById],
  );

  const creatableCount = recap.filter((r) => r.creatable).length;

  // -----------------------------------------------------------------------
  // Step transitions
  // -----------------------------------------------------------------------

  const maxPriceEur = useMemo(() => {
    const raw = maxPriceRaw.trim();
    return raw === "" ? null : Number(raw);
  }, [maxPriceRaw]);

  const step1Valid = useMemo(() => {
    if (selectedBotIds.size === 0 || name.trim().length === 0) return false;
    if (maxPriceEur !== null && (!Number.isFinite(maxPriceEur) || maxPriceEur < 0 || maxPriceEur > 1)) {
      return false;
    }
    return true;
  }, [selectedBotIds.size, name, maxPriceEur]);

  const goToStep2 = async () => {
    setError(null);
    await loadCatalogsForSelected();
    setStep(2);
  };

  // -----------------------------------------------------------------------
  // Submit
  // -----------------------------------------------------------------------

  const submit = async () => {
    setError(null);
    if (creatableCount === 0) {
      setError("None of the selected bots has a matching catalogue. Adjust your selection.");
      return;
    }
    setSubmitting(true);
    try {
      const failed: string[] = [];
      for (const r of recap) {
        if (!r.creatable) continue;
        const res = await fetch(
          `/api/internal/workspaces/${workspaceId}/access-settings`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: nameFor(r.bot),
              bot_id: r.bot.id,
              max_price_eur: maxPriceEur,
              catalog_ids: r.included.map((c) => c.id),
            }),
          },
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          failed.push(`${r.bot.name}: ${body.message ?? body.error ?? "failed"}`);
        }
      }
      if (failed.length > 0) {
        setError(`Some access settings could not be created — ${failed.join("; ")}`);
        return;
      }
      router.push(returnHref);
    } finally {
      setSubmitting(false);
    }
  };

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <button
            type="button"
            onClick={() => router.push(returnHref)}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← {subscriptionPublicId ? "Back to subscription" : botPublicIdParam ? "Back to integration" : "Integrations"}
          </button>
          <h1 className="mt-1 text-2xl font-bold text-gray-900">
            {botPublicIdParam ? "New plan" : "New integration"}
          </h1>
          <p className="mt-1 text-sm text-gray-500 max-w-2xl">
            One plan is created per bot. Pick the bots, the catalogues they
            should reach, then review what each plan will contain.
          </p>
        </div>
      </div>

      <StepIndicator step={step} />

      {step === 1 && (
        <StepBots
          loading={loadingBots}
          name={name}
          onName={setName}
          maxPriceRaw={maxPriceRaw}
          onMaxPrice={setMaxPriceRaw}
          workspaceBots={workspaceBots}
          recommended={recommendedFiltered}
          manualBots={manualFiltered}
          selectedBotIds={selectedBotIds}
          onToggleBot={toggleBot}
          publicIdRaw={publicIdRaw}
          onPublicId={setPublicIdRaw}
          lookupLoading={lookupLoading}
          lookupError={lookupError}
          onLookup={lookupByPublicId}
        />
      )}

      {step === 2 && (
        <StepCatalogs
          loading={loadingCatalogs}
          catalogs={unionCatalogs}
          selectedCatalogIds={selectedCatalogIds}
          onToggleCatalog={toggleCatalog}
          allSelected={allCatalogsSelected}
          onToggleAll={toggleAllCatalogs}
          botCountByCatalog={botCountByCatalog}
          totalBots={selectedBots.length}
        />
      )}

      {step === 3 && (
        <StepRecap recap={recap} nameFor={nameFor} maxPriceEur={maxPriceEur} />
      )}

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Sticky footer */}
      <div className="sticky bottom-0 -mx-6 border-t border-gray-200 bg-white px-6 py-4 md:-mx-8 md:px-8">
        <div className="flex items-center justify-between gap-3">
          <div className="text-sm text-gray-600">{footerHint(step, selectedBots.length, selectedCatalogIds.size, creatableCount)}</div>
          <div className="flex gap-2">
            {step === 1 ? (
              <Button variant="secondary" onClick={() => router.push(returnHref)}>Cancel</Button>
            ) : (
              <Button variant="secondary" onClick={() => setStep((s) => (s - 1) as Step)}>Back</Button>
            )}
            {step === 1 && (
              <Button onClick={goToStep2} disabled={!step1Valid}>Next</Button>
            )}
            {step === 2 && (
              <Button onClick={() => { setError(null); setStep(3); }} disabled={selectedCatalogIds.size === 0}>
                Review
              </Button>
            )}
            {step === 3 && (
              <Button onClick={submit} loading={submitting} disabled={creatableCount === 0}>
                {creatableCount > 1 ? `Create ${creatableCount} plans` : "Create plan"}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function footerHint(step: Step, bots: number, catalogs: number, creatable: number): string {
  if (step === 1) {
    return bots === 0 ? "Select at least one bot." : `${bots} bot${bots > 1 ? "s" : ""} selected.`;
  }
  if (step === 2) {
    return catalogs === 0 ? "Select catalogues to continue." : `${catalogs} catalogue${catalogs > 1 ? "s" : ""} selected.`;
  }
  return creatable === 0
    ? "No bot has a matching catalogue."
    : `${creatable} plan${creatable > 1 ? "s" : ""} will be created.`;
}

// ===========================================================================
// Step indicator
// ===========================================================================

function StepIndicator({ step }: { step: Step }) {
  const labels = ["Bots", "Catalogues", "Review"];
  return (
    <ol className="flex items-center gap-2 text-sm">
      {labels.map((label, i) => {
        const n = (i + 1) as Step;
        const active = n === step;
        const done = n < step;
        return (
          <li key={label} className="flex items-center gap-2">
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                active
                  ? "bg-blue-600 text-white"
                  : done
                    ? "bg-blue-100 text-blue-700"
                    : "bg-gray-100 text-gray-500"
              }`}
            >
              {n}
            </span>
            <span className={active ? "font-medium text-gray-900" : "text-gray-500"}>{label}</span>
            {i < labels.length - 1 && <span className="mx-1 h-px w-8 bg-gray-200" />}
          </li>
        );
      })}
    </ol>
  );
}

// ===========================================================================
// Step 1 — bots & settings
// ===========================================================================

function StepBots({
  loading, name, onName, maxPriceRaw, onMaxPrice,
  workspaceBots, recommended, manualBots, selectedBotIds, onToggleBot,
  publicIdRaw, onPublicId, lookupLoading, lookupError, onLookup,
}: {
  loading: boolean;
  name: string;
  onName: (v: string) => void;
  maxPriceRaw: string;
  onMaxPrice: (v: string) => void;
  workspaceBots: Bot[];
  recommended: Bot[];
  manualBots: Bot[];
  selectedBotIds: Set<string>;
  onToggleBot: (id: string) => void;
  publicIdRaw: string;
  onPublicId: (v: string) => void;
  lookupLoading: boolean;
  lookupError: string | null;
  onLookup: () => void;
}) {
  const hasAny = workspaceBots.length + recommended.length + manualBots.length > 0;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Name">
          <input
            type="text"
            value={name}
            onChange={(e) => onName(e.target.value)}
            placeholder="Premium news"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-400">
            With several bots, each setting is suffixed with the bot name.
          </p>
        </Field>
        <Field label="Max price per grant (EUR, optional)">
          <input
            type="number"
            min={0}
            max={1}
            step={0.0001}
            value={maxPriceRaw}
            onChange={(e) => onMaxPrice(e.target.value)}
            placeholder="Leave blank = no cap"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
          />
        </Field>
      </div>

      {/* Add by public id */}
      <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Reference a bot by public id
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={publicIdRaw}
            onChange={(e) => onPublicId(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onLookup(); } }}
            placeholder="bot_aBc12345"
            className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none"
          />
          <Button size="sm" variant="secondary" onClick={onLookup} loading={lookupLoading} disabled={!publicIdRaw.trim()}>
            Add
          </Button>
          {lookupError && <span className="text-xs text-red-600">{lookupError}</span>}
        </div>
      </div>

      {loading ? (
        <div className="rounded-md border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
          Loading bots…
        </div>
      ) : !hasAny ? (
        <div className="rounded-md border border-dashed border-gray-300 bg-white p-6 text-center text-sm text-gray-500">
          No bot available. Reference one by its public id above.
        </div>
      ) : (
        <div className="space-y-4">
          {workspaceBots.length > 0 && (
            <BotGroup label="Your integrations" bots={workspaceBots} selectedBotIds={selectedBotIds} onToggleBot={onToggleBot} badge="In workspace" />
          )}
          {recommended.length > 0 && (
            <BotGroup label="Recommended" bots={recommended} selectedBotIds={selectedBotIds} onToggleBot={onToggleBot} badge="Recommended" />
          )}
          {manualBots.length > 0 && (
            <BotGroup label="Added by public id" bots={manualBots} selectedBotIds={selectedBotIds} onToggleBot={onToggleBot} badge="Referenced" />
          )}
        </div>
      )}
    </div>
  );
}

function BotGroup({
  label, bots, selectedBotIds, onToggleBot, badge,
}: {
  label: string;
  bots: Bot[];
  selectedBotIds: Set<string>;
  onToggleBot: (id: string) => void;
  badge: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</h4>
        <span className="text-xs text-gray-400">({bots.length})</span>
      </div>
      {bots.map((bot) => {
        const selected = selectedBotIds.has(bot.id);
        return (
          <div
            key={bot.id}
            onClick={() => onToggleBot(bot.id)}
            className={`cursor-pointer rounded-md border p-3 transition-colors ${
              selected ? "border-blue-400 bg-blue-50" : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected}
                onChange={() => onToggleBot(bot.id)}
                onClick={(e) => e.stopPropagation()}
                aria-label={`Select ${bot.name}`}
                className="mt-1"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-gray-900">{bot.name}</span>
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-600">{badge}</span>
                  <span className="font-mono text-xs text-gray-500">{bot.ua_pattern}</span>
                </div>
                {bot.description && <div className="mt-0.5 text-xs text-gray-600">{bot.description}</div>}
                <div className="mt-1 text-xs text-gray-500">
                  {bot.declared_ips.length} declared IP range{bot.declared_ips.length !== 1 ? "s" : ""}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ===========================================================================
// Step 2 — catalogues (union of eligible across selected bots)
// ===========================================================================

function StepCatalogs({
  loading, catalogs, selectedCatalogIds, onToggleCatalog, allSelected, onToggleAll,
  botCountByCatalog, totalBots,
}: {
  loading: boolean;
  catalogs: BotEligibleCatalog[];
  selectedCatalogIds: Set<string>;
  onToggleCatalog: (id: string) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  botCountByCatalog: Map<string, number>;
  totalBots: number;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-500">
        Loading catalogues…
      </div>
    );
  }
  if (catalogs.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
        None of the selected bots is accepted by a marketplace catalogue yet.
        Pick different bots, or ask a publisher to add yours to a catalogue.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-3 py-3 w-10">
              <input type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Select all" />
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Name</th>
            <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">Domains</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Sources</th>
            <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Price</th>
            {totalBots > 1 && (
              <th className="px-4 py-3 text-right text-xs font-medium uppercase text-gray-500">Bots</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {catalogs.map((c) => {
            const isSelected = selectedCatalogIds.has(c.id);
            const botCount = botCountByCatalog.get(c.id) ?? 0;
            return (
              <tr key={c.id} onClick={() => onToggleCatalog(c.id)} className={`cursor-pointer ${isSelected ? "bg-blue-50" : "hover:bg-gray-50"}`}>
                <td className="px-3 py-3">
                  <input type="checkbox" checked={isSelected} onChange={() => onToggleCatalog(c.id)} onClick={(e) => e.stopPropagation()} aria-label={`Select ${c.name}`} />
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm font-medium text-gray-900">{c.name}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-gray-400">{c.public_id}</div>
                </td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {c.domains.length === 0 ? (
                    <span className="text-gray-400">—</span>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {c.domains.slice(0, 3).map((d) => (
                        <span key={d} className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-mono text-gray-700">{d}</span>
                      ))}
                      {c.domains.length > 3 && <span className="text-xs text-gray-500">+{c.domains.length - 3}</span>}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3 text-sm text-gray-600 text-right font-mono">{c.source_count}</td>
                <td className="px-4 py-3 text-sm text-gray-900 text-right font-mono">€{c.price_eur.toFixed(4)}</td>
                {totalBots > 1 && (
                  <td className="px-4 py-3 text-right">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      botCount === totalBots ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {botCount} / {totalBots}
                    </span>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ===========================================================================
// Step 3 — per-bot recap
// ===========================================================================

function StepRecap({
  recap, nameFor, maxPriceEur,
}: {
  recap: Array<{ bot: Bot; included: BotEligibleCatalog[]; excluded: BotEligibleCatalog[]; creatable: boolean }>;
  nameFor: (bot: Bot) => string;
  maxPriceEur: number | null;
}) {
  return (
    <div className="space-y-4">
      {recap.map(({ bot, included, excluded, creatable }) => (
        <div key={bot.id} className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">{nameFor(bot)}</span>
                <span className="font-mono text-xs text-gray-500">{bot.ua_pattern}</span>
              </div>
              <div className="mt-0.5 text-xs text-gray-500">
                Max price / grant: {maxPriceEur === null ? "no cap" : `€${maxPriceEur.toFixed(4)}`}
              </div>
            </div>
            {creatable ? (
              <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
                {included.length} catalogue{included.length !== 1 ? "s" : ""}
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-500">
                Skipped — no matching catalogue
              </span>
            )}
          </div>

          {included.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Will be attached ({included.length})
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {included.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50 px-2 py-1 text-xs text-green-800">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          {excluded.length > 0 && (
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                No catalog_bot for this bot — skipped ({excluded.length})
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {excluded.map((c) => (
                  <span key={c.id} className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800 line-through decoration-amber-400">
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// ===========================================================================
// Misc
// ===========================================================================

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium text-gray-700">{label}</div>
      {children}
    </label>
  );
}

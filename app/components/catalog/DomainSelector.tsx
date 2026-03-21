"use client";

import type { DomainRule, PathOperator } from "@/lib/validations/catalog.schema";
import PathRuleRow from "./PathRuleRow";

interface DomainWithCount {
  id: string;
  domain: string;
  content_count: number;
}

interface DomainSelectorProps {
  domains: DomainWithCount[];
  domainRules: DomainRule[];
  onDomainRulesChange: (rules: DomainRule[]) => void;
}

export default function DomainSelector({
  domains,
  domainRules,
  onDomainRulesChange,
}: DomainSelectorProps) {
  const getRuleForDomain = (domainId: string) =>
    domainRules.find((r) => r.domain_id === domainId);

  const isSelected = (domainId: string) =>
    domainRules.some((r) => r.domain_id === domainId);

  const toggleDomain = (domainId: string) => {
    if (isSelected(domainId)) {
      onDomainRulesChange(domainRules.filter((r) => r.domain_id !== domainId));
    } else {
      onDomainRulesChange([
        ...domainRules,
        { domain_id: domainId },
      ]);
    }
  };

  const setPathLogic = (domainId: string, logic: "AND" | "OR") => {
    onDomainRulesChange(
      domainRules.map((r) =>
        r.domain_id === domainId ? { ...r, path_logic: logic } : r
      )
    );
  };

  const addPathRule = (domainId: string) => {
    onDomainRulesChange(
      domainRules.map((r) =>
        r.domain_id === domainId
          ? {
              ...r,
              path_rules: [
                ...(r.path_rules ?? []),
                { operator: "starts_with" as PathOperator, value: "" },
              ],
            }
          : r
      )
    );
  };

  const updatePathRule = (
    domainId: string,
    index: number,
    field: "operator" | "value",
    newValue: string
  ) => {
    onDomainRulesChange(
      domainRules.map((r) => {
        if (r.domain_id !== domainId) return r;
        const rules = [...(r.path_rules ?? [])];
        rules[index] = { ...rules[index], [field]: newValue };
        return { ...r, path_rules: rules };
      })
    );
  };

  const removePathRule = (domainId: string, index: number) => {
    onDomainRulesChange(
      domainRules.map((r) => {
        if (r.domain_id !== domainId) return r;
        const rules = (r.path_rules ?? []).filter((_, i) => i !== index);
        return { ...r, path_rules: rules };
      })
    );
  };

  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium text-gray-700">
        Domains & Filters
      </label>

      {domains.length === 0 ? (
        <p className="text-sm text-gray-500">
          No domains found. Import a sitemap first.
        </p>
      ) : (
        <div className="space-y-3">
          {domains.map((domain) => {
            const rule = getRuleForDomain(domain.id);
            const selected = !!rule;
            const pathRules = rule?.path_rules ?? [];
            const pathLogic = rule?.path_logic ?? "AND";

            return (
              <div
                key={domain.id}
                className={`rounded-lg border ${
                  selected
                    ? "border-blue-200 bg-blue-50/50"
                    : "border-gray-200 bg-white"
                }`}
              >
                {/* Domain header */}
                <div className="flex items-center px-4 py-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleDomain(domain.id)}
                      className="rounded border-gray-300"
                      aria-label={`Select ${domain.domain}`}
                    />
                    <div>
                      <span className="text-sm font-medium text-gray-900">
                        {domain.domain}
                      </span>
                      <span
                        className={`ml-2 text-xs ${
                          domain.content_count === 0
                            ? "text-gray-400"
                            : "text-gray-500"
                        }`}
                      >
                        {domain.content_count} content{domain.content_count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </label>
                </div>

                {/* Path rules */}
                {selected && (
                  <div className="border-t border-blue-200 px-4 py-3 space-y-2">
                    {/* AND/OR toggle */}
                    {pathRules.length >= 2 && (
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500">Match:</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPathLogic(
                              domain.id,
                              pathLogic === "AND" ? "OR" : "AND"
                            )
                          }
                          className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                            pathLogic === "AND"
                              ? "bg-purple-100 text-purple-700"
                              : "bg-orange-100 text-orange-700"
                          }`}
                        >
                          {pathLogic === "AND"
                            ? "All conditions"
                            : "Any condition"}
                        </button>
                      </div>
                    )}

                    {/* Rule rows */}
                    {pathRules.map((pr, idx) => (
                      <PathRuleRow
                        key={idx}
                        operator={pr.operator}
                        value={pr.value}
                        onOperatorChange={(op) =>
                          updatePathRule(domain.id, idx, "operator", op)
                        }
                        onValueChange={(val) =>
                          updatePathRule(domain.id, idx, "value", val)
                        }
                        onRemove={() => removePathRule(domain.id, idx)}
                      />
                    ))}

                    {/* Add filter button */}
                    <button
                      type="button"
                      onClick={() => addPathRule(domain.id)}
                      className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      + Add filter
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

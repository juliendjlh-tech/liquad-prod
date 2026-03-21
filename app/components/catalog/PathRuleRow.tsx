"use client";

import type { PathOperator } from "@/lib/validations/catalog.schema";

interface PathRuleRowProps {
  operator: PathOperator;
  value: string;
  onOperatorChange: (operator: PathOperator) => void;
  onValueChange: (value: string) => void;
  onRemove: () => void;
}

const OPERATORS: Array<{ value: PathOperator; label: string }> = [
  { value: "starts_with", label: "Starts with" },
  { value: "not_starts_with", label: "Does not start with" },
  { value: "contains", label: "Contains" },
  { value: "not_contains", label: "Does not contain" },
  { value: "equals", label: "Is exactly" },
  { value: "ends_with", label: "Ends with" },
];

export default function PathRuleRow({
  operator,
  value,
  onOperatorChange,
  onValueChange,
  onRemove,
}: PathRuleRowProps) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={operator}
        onChange={(e) => onOperatorChange(e.target.value as PathOperator)}
        className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm text-gray-700 min-w-[160px]"
        aria-label="Filter operator"
      >
        {OPERATORS.map((op) => (
          <option key={op.value} value={op.value}>
            {op.label}
          </option>
        ))}
      </select>
      <input
        type="text"
        value={value}
        onChange={(e) => onValueChange(e.target.value)}
        placeholder="/path"
        className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
        aria-label="Filter value"
      />
      <button
        type="button"
        onClick={onRemove}
        className="rounded p-1 text-gray-400 hover:text-red-500 hover:bg-red-50"
        aria-label="Remove filter"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

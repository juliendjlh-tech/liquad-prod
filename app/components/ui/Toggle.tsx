"use client";

interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
}

export default function Toggle({
  checked,
  onChange,
  loading,
  disabled,
  label,
}: ToggleProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label ?? (checked ? "Active" : "Inactive")}
      onClick={isDisabled ? undefined : onChange}
      disabled={isDisabled}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
        ${checked ? "bg-blue-600" : "bg-gray-300"}
        ${loading ? "opacity-60 cursor-wait" : ""}
        ${isDisabled ? "pointer-events-none" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

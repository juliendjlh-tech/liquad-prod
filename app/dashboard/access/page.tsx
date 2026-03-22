export default function AccessOverviewPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Overview</h1>
      <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-50">
          <svg
            className="h-6 w-6 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Content Access Dashboard
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Monitor your API consumption, track spending across publishers, and
          manage your licensed content integrations &mdash; all in one place.
        </p>
        <span className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
          Coming soon
        </span>
      </div>
    </div>
  );
}

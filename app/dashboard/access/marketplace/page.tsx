export default function AccessMarketplacePage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Marketplace</h1>
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
              d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.15c0 .415.336.75.75.75z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Content Marketplace
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Browse available content catalogs from publishers. Compare pricing,
          explore covered domains and URLs, and find the right content packages
          for your AI applications.
        </p>
        <span className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
          Coming soon
        </span>
      </div>
    </div>
  );
}

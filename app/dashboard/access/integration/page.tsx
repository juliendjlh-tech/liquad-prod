export default function AccessIntegrationPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6">Integration</h1>
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
              d="M14.25 9.75L16.5 12l-2.25 2.25m-4.5 0L7.5 12l2.25-2.25M6 20.25h12A2.25 2.25 0 0020.25 18V6A2.25 2.25 0 0018 3.75H6A2.25 2.25 0 003.75 6v12A2.25 2.25 0 006 20.25z"
            />
          </svg>
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Integration Guides
        </h2>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Step-by-step guides for accessing licensed content. Connect with
          ChatGPT, Claude, Mistral, and other AI platforms through our API, or
          use direct REST endpoints.
        </p>
        <span className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
          Coming soon
        </span>
      </div>
    </div>
  );
}

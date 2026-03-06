"use client";

export default function SdkPage() {
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        SDK Integration
      </h1>

      <section className="rounded-lg border border-gray-200 bg-white p-6 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Quick Start
        </h2>
        <p className="text-sm text-gray-600 mb-4">
          Install the Liquad SDK and add it to your server in 3 steps.
        </p>

        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              1. Install the package
            </h3>
            <pre className="rounded-md bg-gray-900 p-3 text-sm text-green-400 overflow-x-auto">
              npm install @liquad/sdk
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              2. Add the middleware
            </h3>
            <pre className="rounded-md bg-gray-900 p-3 text-sm text-green-400 overflow-x-auto">
              {`const { createLiquadMiddleware } = require('@liquad/sdk');

app.use(createLiquadMiddleware({
  apiKey: 'YOUR_API_KEY',
}));`}
            </pre>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-1">
              3. Deploy and monitor
            </h3>
            <p className="text-sm text-gray-600">
              The SDK will automatically fetch your rules and start tracking AI
              bot access. Visit the Overview page to see analytics.
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-gray-200 bg-white p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">
          Configuration Options
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 pr-4 font-medium text-gray-700">
                  Option
                </th>
                <th className="text-left py-2 pr-4 font-medium text-gray-700">
                  Default
                </th>
                <th className="text-left py-2 font-medium text-gray-700">
                  Description
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">apiKey</td>
                <td className="py-2 pr-4 text-gray-500">required</td>
                <td className="py-2 text-gray-600">Workspace API key</td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">defaultPrice</td>
                <td className="py-2 pr-4 text-gray-500">0</td>
                <td className="py-2 text-gray-600">
                  Max price (EUR) to auto-grant access
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">
                  refreshInterval
                </td>
                <td className="py-2 pr-4 text-gray-500">300000</td>
                <td className="py-2 text-gray-600">
                  Rules refresh interval (ms)
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">batchSize</td>
                <td className="py-2 pr-4 text-gray-500">100</td>
                <td className="py-2 text-gray-600">
                  Events per batch before send
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">batchInterval</td>
                <td className="py-2 pr-4 text-gray-500">30000</td>
                <td className="py-2 text-gray-600">
                  Batch flush interval (ms)
                </td>
              </tr>
              <tr>
                <td className="py-2 pr-4 font-mono text-xs">onError</td>
                <td className="py-2 pr-4 text-gray-500">no-op</td>
                <td className="py-2 text-gray-600">Error handler callback</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

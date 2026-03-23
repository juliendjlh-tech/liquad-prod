"use client";

import { useState } from "react";
import Link from "next/link";

type Guide = "chatgpt" | "api";

const guides: { id: Guide; label: string; description: string }[] = [
  {
    id: "chatgpt",
    label: "Via ChatGPT",
    description:
      "Access premium content directly within your ChatGPT conversations",
  },
  {
    id: "api",
    label: "Via API",
    description:
      "Authorize your bot to access licensed content programmatically",
  },
];

function CodeBlock({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(children.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="rounded-md bg-gray-900 p-4 text-sm text-gray-100 overflow-x-auto leading-relaxed">
        {children.trim()}
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 px-2 py-1 text-xs rounded bg-gray-700 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-gray-600"
      >
        {copied ? "Copied!" : "Copy"}
      </button>
    </div>
  );
}

function SectionCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md bg-blue-50 border border-blue-100 p-3 mt-3">
      <span className="text-blue-500 text-sm flex-shrink-0">i</span>
      <p className="text-xs text-blue-700">{children}</p>
    </div>
  );
}

function Warning({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2 rounded-md bg-amber-50 border border-amber-100 p-3 mt-3">
      <span className="text-amber-500 text-sm flex-shrink-0">!</span>
      <p className="text-xs text-amber-700">{children}</p>
    </div>
  );
}

/* ──────────────────────────────────────────────
   ChatGPT Guide
   ────────────────────────────────────────────── */

function ChatGPTGuide() {
  return (
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
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
      </div>
      <h2 className="text-lg font-semibold text-gray-900 mb-2">
        ChatGPT Integration
      </h2>
      <p className="text-sm text-gray-500 max-w-md mx-auto">
        Connect your ChatGPT account to access licensed content directly in your
        conversations. Configure a Custom GPT with your Liquad credentials and
        let ChatGPT fetch premium content on your behalf.
      </p>
      <span className="mt-4 inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-500">
        Coming soon
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────
   API Guide
   ────────────────────────────────────────────── */

function APIGuide() {
  return (
    <div className="space-y-6">
      {/* Why */}
      <SectionCard title="Why Use This Method?">
        <p className="text-sm text-gray-600 mb-4">
          Use the API to authorize your bot to access licensed content on
          publisher websites. This is a two-step process: first you request a
          short-lived authorization token from Liquad, then your bot includes
          that token when visiting the publisher{"'"}s page.
        </p>
        <p className="text-xs font-medium text-gray-700 mb-2">
          Example use cases:
        </p>
        <ul className="text-sm text-gray-600 space-y-2 ml-4 list-disc">
          <li>
            <strong>Internal knowledge base</strong> — Your bot crawls premium
            news sites to build a knowledge base for your team.
          </li>
          <li>
            <strong>AI chatbot</strong> — Your assistant fetches licensed
            articles in real time to ground its answers.
          </li>
          <li>
            <strong>Research pipelines</strong> — You automate the collection
            of content from licensed sources for analysis.
          </li>
        </ul>
      </SectionCard>

      {/* Prerequisites */}
      <SectionCard title="Before You Start">
        <p className="text-sm text-gray-600 mb-4">
          Make sure you have the following ready:
        </p>
        <ul className="space-y-3 text-sm text-gray-600">
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
              &#10003;
            </span>
            <div>
              <strong className="text-gray-900">
                Your Liquad API key
              </strong>{" "}
              — Find it in your{" "}
              <Link
                href="/dashboard/access/settings"
                className="text-blue-600 hover:text-blue-800 underline"
              >
                Settings page
              </Link>
              . It starts with{" "}
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                lq_
              </code>
              . Copy it and keep it handy.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
              &#10003;
            </span>
            <div>
              <strong className="text-gray-900">
                Sufficient balance
              </strong>{" "}
              — Accessing paid content costs credits. Make sure your workspace
              balance covers the content you want to access.
            </div>
          </li>
          <li className="flex gap-3">
            <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
              &#10003;
            </span>
            <div>
              <strong className="text-gray-900">
                A way to send HTTP requests
              </strong>{" "}
              — A terminal (for{" "}
              <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
                curl
              </code>
              ), Python, JavaScript, or any language that can send web requests.
            </div>
          </li>
        </ul>
      </SectionCard>

      {/* How it works */}
      <SectionCard title="How It Works">
        <p className="text-sm text-gray-600 mb-4">
          Accessing licensed content through the API is a two-step process:
        </p>
        <div className="space-y-3 text-sm text-gray-600">
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
              1
            </span>
            <div>
              <strong className="text-gray-900">Authorize</strong>
              <p className="text-gray-500 text-xs mt-0.5">
                Your bot calls{" "}
                <code className="bg-gray-100 px-1 rounded font-mono">
                  POST /api/sdk/authorize
                </code>{" "}
                with your API key and the URL it wants to access. Liquad checks
                your license, debits your balance, and returns a signed JWT
                token valid for 5 minutes.
              </p>
            </div>
          </div>
          <div className="flex gap-3">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
              2
            </span>
            <div>
              <strong className="text-gray-900">Access</strong>
              <p className="text-gray-500 text-xs mt-0.5">
                Your bot requests the publisher{"'"}s page with the JWT in the{" "}
                <code className="bg-gray-100 px-1 rounded font-mono">
                  Authorization: License
                </code>{" "}
                header. The publisher{"'"}s Liquad SDK verifies the token and
                serves the content.
              </p>
            </div>
          </div>
        </div>
      </SectionCard>

      {/* Step 1 */}
      <SectionCard title="Step 1 — Get Your API Key">
        <ol className="text-sm text-gray-600 space-y-2 ml-4 list-decimal">
          <li>
            Go to your{" "}
            <Link
              href="/dashboard/access/settings"
              className="text-blue-600 hover:text-blue-800 underline"
            >
              Settings page
            </Link>
          </li>
          <li>
            Copy your API key (it starts with{" "}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
              lq_
            </code>
            )
          </li>
        </ol>
        <Warning>
          Treat your API key like a password. Never commit it to Git or share it
          in public code. Use environment variables instead.
        </Warning>
        <Tip>
          You can regenerate your API key at any time from Settings. Note:
          regenerating immediately invalidates the previous key.
        </Tip>
      </SectionCard>

      {/* Step 2 */}
      <SectionCard title="Step 2 — Request an Authorization Token">
        <p className="text-sm text-gray-600 mb-3">
          Before your bot visits a publisher{"'"}s page, it needs to obtain a
          short-lived authorization token from Liquad. Send a{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
            POST
          </code>{" "}
          request to the authorize endpoint:
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Using curl:
            </p>
            <CodeBlock>
              {`curl -X POST https://api.liquad.app/api/sdk/authorize \\
  -H "Authorization: Bearer lq_your_api_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"url": "https://example-publisher.com/article-123"}'`}
            </CodeBlock>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Using Python:
            </p>
            <CodeBlock>
              {`import requests

response = requests.post(
    "https://api.liquad.app/api/sdk/authorize",
    json={"url": "https://example-publisher.com/article-123"},
    headers={"Authorization": "Bearer lq_your_api_key_here"},
)

data = response.json()
print(data)`}
            </CodeBlock>
          </div>
        </div>

        <p className="text-sm text-gray-600 mt-4 mb-3">
          When successful, the API returns a JWT token you{"'"}ll use in the next
          step:
        </p>
        <CodeBlock>
          {`{
  "access": "granted",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expires_at": "2026-03-22T14:35:00Z",
  "price_eur": 0.05,
  "balance_remaining_eur": 99.95
}`}
        </CodeBlock>

        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">
            <strong>What does each field mean?</strong>
          </p>
          <ul className="text-xs text-gray-500 space-y-1 ml-4 list-disc">
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">token</code>{" "}
              — The signed JWT to include when accessing the publisher{"'"}s page
            </li>
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">
                expires_at
              </code>{" "}
              — The token is valid for 5 minutes from issuance
            </li>
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">
                price_eur
              </code>{" "}
              — The price debited from your balance for this access
            </li>
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">
                balance_remaining_eur
              </code>{" "}
              — Your remaining balance after this transaction
            </li>
          </ul>
        </div>

        <Tip>
          You can optionally pass{" "}
          <code className="text-xs font-mono">
            {"\""}max_price_eur{"\""}: 0.10
          </code>{" "}
          in the request body to set a price ceiling. If the content costs more,
          the request is rejected without debiting your balance.
        </Tip>
      </SectionCard>

      {/* Step 3 */}
      <SectionCard title="Step 3 — Access the Publisher's Content">
        <p className="text-sm text-gray-600 mb-3">
          Now have your bot request the publisher{"'"}s page, including the JWT
          token in the{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
            Authorization
          </code>{" "}
          header with the{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
            License
          </code>{" "}
          scheme:
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Using curl:
            </p>
            <CodeBlock>
              {`curl -H "Authorization: License eyJhbGciOiJIUzI1NiIs..." \\
     "https://example-publisher.com/article-123"`}
            </CodeBlock>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Full Python example (authorize + access):
            </p>
            <CodeBlock>
              {`import os
import requests

API_KEY = os.environ["LIQUAD_API_KEY"]
TARGET_URL = "https://example-publisher.com/article-123"

# Step 1: Get authorization token
auth_response = requests.post(
    "https://api.liquad.app/api/sdk/authorize",
    json={"url": TARGET_URL},
    headers={"Authorization": f"Bearer {API_KEY}"},
)
auth_response.raise_for_status()
token = auth_response.json()["token"]

# Step 2: Access the publisher's page with the token
content_response = requests.get(
    TARGET_URL,
    headers={"Authorization": f"License {token}"},
)
print(content_response.text)`}
            </CodeBlock>
          </div>
        </div>

        <Warning>
          The token is valid for <strong>5 minutes</strong> and is scoped to the
          exact URL you authorized. You need a new token for each different URL.
          Requesting the same URL again within 5 minutes returns a cached token
          at no extra cost.
        </Warning>
      </SectionCard>

      {/* Troubleshooting */}
      <SectionCard title="Troubleshooting">
        <div className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-900">
              401 Unauthorized
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Your API key is missing or invalid. Check that you{"'"}re including
              the{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">
                Authorization: Bearer lq_...
              </code>{" "}
              header in the authorize request.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              402 Payment Required
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Either your balance is insufficient to cover the content price, or
              the price exceeds the{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">
                max_price_eur
              </code>{" "}
              ceiling you set. Top up your balance or adjust your price limit.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              403 No Matching Catalog
            </p>
            <p className="text-xs text-gray-500 mt-1">
              The publisher has no catalog that covers this content for your bot.
              The publisher may not have made this URL available for licensed
              access.
            </p>
          </div>
          <div>
            <p className="text-sm font-medium text-gray-900">
              404 Domain Not Found
            </p>
            <p className="text-xs text-gray-500 mt-1">
              No publisher has registered and verified this domain on Liquad. The
              content at this URL is not available through the Liquad network.
            </p>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}

/* ──────────────────────────────────────────────
   Main Page
   ────────────────────────────────────────────── */

export default function AccessIntegrationPage() {
  const [guide, setGuide] = useState<Guide>("chatgpt");

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">
        Integration Guide
      </h1>
      <p className="text-sm text-gray-500 mb-6">
        Follow these guides to start accessing licensed content through Liquad.
        The ChatGPT method requires no technical skills. The API method requires
        basic familiarity with making web requests.
      </p>

      {/* Guide selector */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        Choose your method
      </h2>
      <div className="flex gap-2 mb-6">
        {guides.map((g) => (
          <button
            key={g.id}
            onClick={() => setGuide(g.id)}
            className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
              guide === g.id
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div
              className={`text-sm font-medium ${
                guide === g.id ? "text-blue-700" : "text-gray-900"
              }`}
            >
              {g.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{g.description}</div>
          </button>
        ))}
      </div>

      {/* Guide content */}
      {guide === "chatgpt" && <ChatGPTGuide />}
      {guide === "api" && <APIGuide />}

      {/* Need help */}
      <div className="mt-6">
        <SectionCard title="Need Help?">
          <p className="text-sm text-gray-600">
            If you run into any issue during setup, reach us at{" "}
            <span className="text-blue-600 font-medium">support@liquad.app</span>
            . Include your workspace name and which method you{"'"}re using (ChatGPT
            or API), and we{"'"}ll help you get set up.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

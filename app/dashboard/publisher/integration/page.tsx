"use client";

import { useState } from "react";
import Link from "next/link";

type Platform = "express" | "cloudflare" | "vercel";

const platforms: { id: Platform; label: string; description: string }[] = [
  {
    id: "express",
    label: "Express / Node.js",
    description: "Traditional Node.js server with Express, Fastify, or Connect",
  },
  {
    id: "cloudflare",
    label: "Cloudflare Workers",
    description: "Deploy at the edge with Cloudflare Workers or Pages Functions",
  },
  {
    id: "vercel",
    label: "Vercel Edge",
    description: "Next.js middleware or Vercel Edge Functions",
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

function Prerequisites() {
  return (
    <SectionCard title="Before You Start">
      <p className="text-sm text-gray-600 mb-4">
        Make sure you have the following ready before starting the integration:
      </p>
      <ul className="space-y-3 text-sm text-gray-600">
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
            &#10003;
          </span>
          <div>
            <strong className="text-gray-900">A gateway API key</strong> — Create one (and pick which catalogs it exposes) on the{" "}
            <Link href="/dashboard/publisher/gateways" className="text-blue-600 hover:text-blue-800 underline">
              Gateways page
            </Link>
            . The key is shown once and starts with{" "}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">lq_</code>.
            Copy it and keep it handy.
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
            &#10003;
          </span>
          <div>
            <strong className="text-gray-900">Node.js installed on your computer</strong> — Version 18 or higher.
            This is needed to install packages and develop locally. To check, open a terminal and run{" "}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">node -v</code>.
            If you see <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">v18</code> or higher, you{"'"}re all set.
            If not, download it from{" "}
            <span className="text-blue-600">nodejs.org</span>.
            You do not need to install Node.js on Cloudflare or Vercel — they handle this automatically.
          </div>
        </li>
        <li className="flex gap-3">
          <span className="flex-shrink-0 w-5 h-5 rounded bg-green-100 text-green-700 flex items-center justify-center text-xs font-bold">
            &#10003;
          </span>
          <div>
            <strong className="text-gray-900">An existing project</strong> — You need a working
            website or application where you want to protect content from AI bots.
            The Liquad SDK plugs into your existing code.
          </div>
        </li>
      </ul>
      <Tip>
        Not sure which platform to choose? If your site is hosted on Vercel (Next.js), choose{" "}
        <strong>Vercel Edge</strong>. If you use Cloudflare, choose <strong>Cloudflare Workers</strong>.
        For any other Node.js server (Express, Fastify, Hapi...), choose <strong>Express / Node.js</strong>.
      </Tip>
    </SectionCard>
  );
}

function ExpressDocs() {
  return (
    <div className="space-y-6">
      <SectionCard title="Step 1 — Install the Liquad SDK">
        <p className="text-sm text-gray-600 mb-3">
          Open a <strong>terminal</strong> (also called command line or console) in your project
          folder — the folder that contains your{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">package.json</code>{" "}
          file. Then run:
        </p>
        <CodeBlock>{`npm install @liquad/sdk`}</CodeBlock>
        <Tip>
          If you use <strong>yarn</strong> instead of npm, run{" "}
          <code className="text-xs font-mono">yarn add @liquad/sdk</code>. For{" "}
          <strong>pnpm</strong>, run{" "}
          <code className="text-xs font-mono">pnpm add @liquad/sdk</code>.
          All three work the same way.
        </Tip>
        <p className="text-sm text-gray-500 mt-3">
          This downloads the SDK and adds it to your project dependencies. You only need
          to run this once.
        </p>
      </SectionCard>

      <SectionCard title="Step 2 — Add the middleware to your server">
        <p className="text-sm text-gray-600 mb-3">
          Open the main file of your Express server (usually called{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">app.js</code>,{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">server.js</code>, or{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">index.js</code>).
          Add the following lines <strong>near the top of the file</strong>, before your routes:
        </p>
        <CodeBlock>
          {`import { createLiquadHandler, toExpressMiddleware } from "@liquad/sdk";

const handler = createLiquadHandler({
  apiKey: process.env.LIQUAD_API_KEY,
});

// Add this BEFORE your routes
app.use(toExpressMiddleware(handler));`}
        </CodeBlock>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">
            <strong>What does this code do?</strong>
          </p>
          <ul className="text-xs text-gray-500 space-y-1 ml-4 list-disc">
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">createLiquadHandler</code>{" "}
              creates the Liquad protection engine using your API key
            </li>
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">toExpressMiddleware</code>{" "}
              makes it compatible with Express
            </li>
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">app.use(...)</code>{" "}
              tells Express to run the Liquad check on every incoming request
            </li>
          </ul>
        </div>
        <Warning>
          The middleware must be placed <strong>before</strong> your routes. If you place it after,
          the requests will reach your content before Liquad can check them.
        </Warning>
      </SectionCard>

      <SectionCard title="Step 3 — Set your API key as an environment variable">
        <p className="text-sm text-gray-600 mb-3">
          The SDK needs your API key to authenticate with Liquad. For security, it reads the key
          from an <strong>environment variable</strong> (not hardcoded in your code).
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option A — Using a <code className="bg-gray-100 px-1 rounded font-mono">.env</code> file (recommended for development)
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Create a file called{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">.env</code>{" "}
              at the root of your project and add this line:
            </p>
            <CodeBlock>{`LIQUAD_API_KEY=lq_your_api_key_here`}</CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              Replace{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">lq_your_api_key_here</code>{" "}
              with your actual API key from your{" "}
              <Link href="/dashboard/settings" className="text-blue-600 hover:text-blue-800 underline">
                Settings
              </Link>
              .
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option B — Setting it in your hosting provider
            </p>
            <p className="text-xs text-gray-500">
              Most hosting platforms (Railway, Render, Heroku, AWS...) let you set environment
              variables through their dashboard. Look for {"\""}Environment Variables{"\""},{"\""}Secrets{"\""}, or {"\""}Config Vars{"\""} in your host{"'"}s settings panel, then add a variable named{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">LIQUAD_API_KEY</code>{" "}
              with your key as the value.
            </p>
          </div>
        </div>

        <Warning>
          Never paste your API key directly in your code or commit it to Git.
          Always use environment variables.
        </Warning>
      </SectionCard>

      <SectionCard title="Step 4 — Deploy and verify">
        <p className="text-sm text-gray-600 mb-3">
          Deploy your server as you normally would. Once it{"'"}s running, the SDK will
          automatically:
        </p>
        <ul className="text-sm text-gray-600 space-y-1 ml-4 list-disc mb-3">
          <li>Fetch your licensing rules from Liquad</li>
          <li>Intercept AI bot requests based on your configuration</li>
          <li>Report access events to your dashboard</li>
        </ul>
        <p className="text-sm text-gray-600">
          Go to your{" "}
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 underline">
            Overview dashboard
          </Link>{" "}
          to verify that events are appearing. You should see activity within a
          few minutes of your first bot visit.
        </p>
        <Tip>
          Normal visitors (humans) are never affected. The SDK only acts on requests
          identified as AI bots. Your website will continue to work normally for all
          regular users.
        </Tip>
      </SectionCard>
    </div>
  );
}

function CloudflareDocs() {
  return (
    <div className="space-y-6">
      <SectionCard title="Step 1 — Install the Liquad SDK">
        <p className="text-sm text-gray-600 mb-3">
          Open a <strong>terminal</strong> in your Cloudflare Worker project folder — the folder
          that contains your{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">wrangler.toml</code>{" "}
          (or{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">wrangler.jsonc</code>
          ) configuration file. Then run:
        </p>
        <CodeBlock>{`npm install @liquad/sdk`}</CodeBlock>
        <Tip>
          If you use <strong>yarn</strong>, run{" "}
          <code className="text-xs font-mono">yarn add @liquad/sdk</code>. For{" "}
          <strong>pnpm</strong>, run{" "}
          <code className="text-xs font-mono">pnpm add @liquad/sdk</code>.
        </Tip>
        <p className="text-sm text-gray-500 mt-3">
          This adds the SDK to your project. Cloudflare{"'"}s build tool (Wrangler) will
          automatically bundle it with your Worker when you deploy.
        </p>

        <div className="mt-4 p-3 bg-gray-50 rounded-md border border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">
            Don{"'"}t have a Worker project yet?
          </p>
          <p className="text-xs text-gray-500 mb-2">
            Create one from scratch by running these commands in your terminal:
          </p>
          <CodeBlock>
            {`npm create cloudflare@latest my-liquad-worker
cd my-liquad-worker
npm install @liquad/sdk`}
          </CodeBlock>
          <p className="text-xs text-gray-500 mt-2">
            This creates a new Cloudflare Worker project called{" "}
            <code className="bg-gray-100 px-1 rounded font-mono">my-liquad-worker</code>{" "}
            and installs the Liquad SDK inside it.
          </p>
        </div>
      </SectionCard>

      <SectionCard title="Step 2 — Write the Worker code">
        <p className="text-sm text-gray-600 mb-3">
          Open the main Worker file in your project. It{"'"}s usually located at{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">src/index.ts</code>{" "}
          or{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">src/index.js</code>.
          Replace its content with the following code:
        </p>
        <CodeBlock>
          {`import { createLiquadHandler } from "@liquad/sdk";

export default {
  async fetch(request, env, ctx) {
    const handler = createLiquadHandler({
      apiKey: env.LIQUAD_API_KEY,
      waitUntil: ctx.waitUntil.bind(ctx),
    });

    const result = await handler(request);

    // If the bot is blocked or requires payment, return the SDK response
    if (result.blocked) {
      return result.response;
    }

    // Otherwise, pass through to your origin
    return fetch(request);
  },
};`}
        </CodeBlock>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">
            <strong>What does this code do?</strong>
          </p>
          <ul className="text-xs text-gray-500 space-y-1 ml-4 list-disc">
            <li>
              Every time someone visits your site, Cloudflare runs this Worker <strong>before</strong>{" "}
              serving your content
            </li>
            <li>
              The SDK checks if the visitor is an AI bot and whether it should be allowed
            </li>
            <li>
              If the bot is blocked, the SDK returns a block response and your content is never exposed
            </li>
            <li>
              If the visitor is allowed (human or authorized bot), the request passes through
              to your actual website
            </li>
            <li>
              <code className="bg-gray-100 px-1 rounded font-mono">waitUntil</code>{" "}
              lets the SDK send analytics to your dashboard without slowing down the response
            </li>
          </ul>
        </div>
      </SectionCard>

      <SectionCard title="Step 3 — Add your API key">
        <p className="text-sm text-gray-600 mb-3">
          Your Worker needs your Liquad API key. There are two ways to set it up:
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option A — Using the command line (recommended)
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Run this command in your terminal. It will prompt you to paste your API key:
            </p>
            <CodeBlock>{`npx wrangler secret put LIQUAD_API_KEY`}</CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              When prompted, paste your API key (from your{" "}
              <Link href="/dashboard/settings" className="text-blue-600 hover:text-blue-800 underline">
                Settings
              </Link>
              ) and press Enter. The key is stored securely by Cloudflare and never visible in your code.
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option B — Using the Cloudflare Dashboard
            </p>
            <ol className="text-xs text-gray-500 space-y-1 ml-4 list-decimal">
              <li>
                Go to{" "}
                <span className="text-blue-600">dash.cloudflare.com</span>{" "}
                and log in to your Cloudflare account
              </li>
              <li>
                In the left sidebar, click <strong>Workers & Pages</strong>
              </li>
              <li>Click on your Worker name</li>
              <li>
                Go to the <strong>Settings</strong> tab, then <strong>Variables and Secrets</strong>
              </li>
              <li>
                Click <strong>Add</strong>, enter{" "}
                <code className="bg-gray-100 px-1 rounded font-mono">LIQUAD_API_KEY</code>{" "}
                as the name
              </li>
              <li>
                Paste your API key as the value, make sure <strong>Encrypt</strong> is selected
              </li>
              <li>
                Click <strong>Save</strong>
              </li>
            </ol>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Step 4 — Deploy your Worker">
        <p className="text-sm text-gray-600 mb-3">
          Run the following command to deploy your Worker to Cloudflare{"'"}s global network:
        </p>
        <CodeBlock>{`npx wrangler deploy`}</CodeBlock>
        <p className="text-sm text-gray-600 mt-3 mb-3">
          After deployment, Wrangler will display the URL of your Worker (e.g.{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">
            my-liquad-worker.your-account.workers.dev
          </code>
          ).
        </p>

        <div className="p-3 bg-gray-50 rounded-md border border-gray-100">
          <p className="text-xs font-medium text-gray-700 mb-2">
            How to route traffic through your Worker
          </p>
          <p className="text-xs text-gray-500 mb-2">
            To protect your actual website, you need to tell Cloudflare to route your domain{"'"}s
            traffic through this Worker:
          </p>
          <ol className="text-xs text-gray-500 space-y-1 ml-4 list-decimal">
            <li>
              In <span className="text-blue-600">dash.cloudflare.com</span>,
              go to <strong>Workers & Pages</strong> and click your Worker
            </li>
            <li>
              Go to the <strong>Settings</strong> tab, then <strong>Domains & Routes</strong>
            </li>
            <li>
              Click <strong>Add</strong> and choose <strong>Route</strong>
            </li>
            <li>
              Enter your domain pattern (e.g.{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">example.com/*</code>{" "}
              or{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">blog.example.com/*</code>)
            </li>
            <li>Select the zone (your domain) and click <strong>Add route</strong></li>
          </ol>
        </div>

        <Tip>
          The Worker runs at Cloudflare{"'"}s edge — in 300+ data centers worldwide. This means
          bot detection happens in milliseconds, closest to each visitor{"'"}s location.
          Your{" "}
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 underline">
            dashboard
          </Link>{" "}
          will show events within minutes of your first bot visit.
        </Tip>
      </SectionCard>
    </div>
  );
}

function VercelDocs() {
  return (
    <div className="space-y-6">
      <SectionCard title="Step 1 — Install the Liquad SDK">
        <p className="text-sm text-gray-600 mb-3">
          Open a <strong>terminal</strong> in your Next.js project folder — the folder that
          contains your{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">next.config.js</code>{" "}
          (or{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">next.config.ts</code>
          ) file. Then run:
        </p>
        <CodeBlock>{`npm install @liquad/sdk`}</CodeBlock>
        <Tip>
          If you use <strong>yarn</strong>, run{" "}
          <code className="text-xs font-mono">yarn add @liquad/sdk</code>. For{" "}
          <strong>pnpm</strong>, run{" "}
          <code className="text-xs font-mono">pnpm add @liquad/sdk</code>.
        </Tip>
        <p className="text-sm text-gray-500 mt-3">
          This adds the SDK to your project dependencies. Next.js will automatically bundle it
          with your middleware when you deploy.
        </p>
      </SectionCard>

      <SectionCard title="Step 2 — Create the Edge Middleware">
        <p className="text-sm text-gray-600 mb-3">
          Create a new file called{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">middleware.ts</code>{" "}
          at the <strong>root</strong> of your Next.js project (next to{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">next.config.js</code>{" "}
          and{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">package.json</code>,
          <strong> not</strong> inside the{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">app/</code>{" "}
          or{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">src/</code>{" "}
          folder). If you already have a{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">middleware.ts</code>,
          add the Liquad logic to it.
        </p>
        <p className="text-sm text-gray-600 mb-3">
          Paste the following code:
        </p>
        <CodeBlock>
          {`import { createLiquadHandler } from "@liquad/sdk";
import { NextResponse } from "next/server";

const handler = createLiquadHandler({
  apiKey: process.env.LIQUAD_API_KEY,
});

export default async function middleware(request: Request) {
  const result = await handler(request);

  // If the bot is blocked or requires payment, return the SDK response
  if (result.blocked) {
    return result.response;
  }

  // Otherwise, continue to the page normally
  return NextResponse.next();
}

// Only run on paths you want to protect
// Edit the list below to match YOUR website's content pages
export const config = {
  matcher: ["/blog/:path*", "/articles/:path*", "/docs/:path*"],
};`}
        </CodeBlock>
        <div className="mt-4 space-y-2">
          <p className="text-xs text-gray-500">
            <strong>What does this code do?</strong>
          </p>
          <ul className="text-xs text-gray-500 space-y-1 ml-4 list-disc">
            <li>
              Next.js runs this middleware <strong>before</strong> serving any matched page
            </li>
            <li>
              The SDK checks if the visitor is an AI bot and whether it should be allowed
            </li>
            <li>
              If the bot is blocked, the SDK returns a block response immediately
            </li>
            <li>
              If the visitor is allowed (human or authorized bot), the page loads normally
            </li>
          </ul>
        </div>

        <Warning>
          The{" "}
          <code className="bg-gray-100 px-1 rounded font-mono text-xs">matcher</code>{" "}
          setting controls which pages are protected. Edit the paths to match your actual content.
          For example, if your content is at{" "}
          <code className="bg-gray-100 px-1 rounded font-mono text-xs">/posts</code>,
          change it to{" "}
          <code className="bg-gray-100 px-1 rounded font-mono text-xs">{`["/posts/:path*"]`}</code>.
          To protect all pages, use{" "}
          <code className="bg-gray-100 px-1 rounded font-mono text-xs">{`["/(.*)"]`}</code>.
        </Warning>
      </SectionCard>

      <SectionCard title="Step 3 — Add your API key">
        <p className="text-sm text-gray-600 mb-3">
          Your middleware needs your Liquad API key. There are two ways to set it up:
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option A — Using the Vercel Dashboard (recommended)
            </p>
            <ol className="text-xs text-gray-500 space-y-1 ml-4 list-decimal">
              <li>
                Go to{" "}
                <span className="text-blue-600">vercel.com/dashboard</span>{" "}
                and log in to your Vercel account
              </li>
              <li>Click on your project</li>
              <li>
                Go to <strong>Settings</strong> (top navigation bar)
              </li>
              <li>
                Click <strong>Environment Variables</strong> in the left sidebar
              </li>
              <li>
                In the <strong>Key</strong> field, type{" "}
                <code className="bg-gray-100 px-1 rounded font-mono">LIQUAD_API_KEY</code>
              </li>
              <li>
                In the <strong>Value</strong> field, paste your API key (from your{" "}
                <Link href="/dashboard/settings" className="text-blue-600 hover:text-blue-800 underline">
                  Settings
                </Link>
                )
              </li>
              <li>
                Make sure all three checkboxes are selected: <strong>Production</strong>,{" "}
                <strong>Preview</strong>, and <strong>Development</strong>
              </li>
              <li>
                Click <strong>Save</strong>
              </li>
            </ol>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option B — Using the command line
            </p>
            <CodeBlock>{`vercel env add LIQUAD_API_KEY`}</CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              The CLI will ask you to paste the value and select which environments to apply it to.
              Select all three (Production, Preview, Development).
            </p>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option C — For local development only
            </p>
            <p className="text-xs text-gray-500 mb-2">
              Create a{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">.env.local</code>{" "}
              file at the root of your project:
            </p>
            <CodeBlock>{`LIQUAD_API_KEY=lq_your_api_key_here`}</CodeBlock>
            <p className="text-xs text-gray-500 mt-2">
              This file is automatically ignored by Git (it{"'"}s in the default{" "}
              <code className="bg-gray-100 px-1 rounded font-mono">.gitignore</code>).
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Step 4 — Deploy and verify">
        <p className="text-sm text-gray-600 mb-3">
          Deploy your project to Vercel. There are two ways:
        </p>

        <div className="space-y-4">
          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option A — Push to Git (recommended, automatic)
            </p>
            <p className="text-xs text-gray-500">
              If your project is connected to GitHub, GitLab, or Bitbucket, simply push your
              code changes. Vercel will automatically detect the update and redeploy:
            </p>
            <div className="mt-2">
              <CodeBlock>
                {`git add middleware.ts package.json package-lock.json
git commit -m "Add Liquad SDK for AI bot protection"
git push`}
              </CodeBlock>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-gray-700 mb-2">
              Option B — Manual deploy via CLI
            </p>
            <CodeBlock>{`vercel deploy --prod`}</CodeBlock>
          </div>
        </div>

        <p className="text-sm text-gray-600 mt-4">
          Once deployed, the middleware will automatically protect the pages matching your{" "}
          <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">matcher</code>{" "}
          configuration. Go to your{" "}
          <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 underline">
            Overview dashboard
          </Link>{" "}
          to verify that events are appearing.
        </p>
        <Tip>
          The middleware runs at Vercel{"'"}s edge network — in data centers around the world.
          This means bot detection happens in milliseconds, before your page even starts rendering.
          Normal visitors are never affected.
        </Tip>
      </SectionCard>
    </div>
  );
}

export default function IntegrationPage() {
  const [platform, setPlatform] = useState<Platform>("cloudflare");

  return (
    <div className="max-w-3xl">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-sm text-gray-500">
          <li>
            <Link
              href="/dashboard/publisher/gateways"
              className="hover:text-gray-700 transition-colors"
            >
              Gateways
            </Link>
          </li>
          <li className="flex items-center gap-1.5">
            <svg
              className="h-3.5 w-3.5 text-gray-400"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span className="font-medium text-gray-900">Integration</span>
          </li>
        </ol>
      </nav>

      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Integration</h1>
        <p className="text-sm text-gray-500 max-w-2xl">
          Install Liquad on your website in a few steps. Once in place, AI
          crawlers go through Liquad before reaching your pages — humans are
          never impacted. No prior SDK experience required: each step is
          spelled out.
        </p>
      </div>

      {/* Prerequisites */}
      <div className="mb-8">
        <Prerequisites />
      </div>

      {/* Platform selector */}
      <h2 className="text-base font-semibold text-gray-900 mb-3">
        Choose your platform
      </h2>
      <div className="flex gap-2 mb-6">
        {platforms.map((p) => (
          <button
            key={p.id}
            onClick={() => setPlatform(p.id)}
            className={`flex-1 rounded-lg border p-3 text-left transition-colors ${
              platform === p.id
                ? "border-blue-500 bg-blue-50 ring-1 ring-blue-500"
                : "border-gray-200 bg-white hover:border-gray-300"
            }`}
          >
            <div
              className={`text-sm font-medium ${
                platform === p.id ? "text-blue-700" : "text-gray-900"
              }`}
            >
              {p.label}
            </div>
            <div className="text-xs text-gray-500 mt-0.5">{p.description}</div>
          </button>
        ))}
      </div>

      {/* Platform-specific docs */}
      {platform === "express" && <ExpressDocs />}
      {platform === "cloudflare" && <CloudflareDocs />}
      {platform === "vercel" && <VercelDocs />}

      {/* Configuration reference */}
      <div className="mt-8">
        <SectionCard title="Configuration Options (Advanced)">
          <p className="text-sm text-gray-600 mb-2">
            The SDK works out of the box with just your API key. If you need more control,
            here are all available options:
          </p>
          <p className="text-xs text-gray-500 mb-4">
            These are passed to{" "}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded font-mono">createLiquadHandler({"{ ... }"})</code>.
            Only <code className="bg-gray-100 px-1 rounded font-mono text-xs">apiKey</code> is required.
          </p>
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
                  <td className="py-2 pr-4 text-gray-500 text-xs">required</td>
                  <td className="py-2 text-gray-600 text-xs">
                    A gateway API key. Starts with{" "}
                    <code className="bg-gray-100 px-1 rounded">lq_</code>. Create it on the{" "}
                    <Link href="/dashboard/publisher/gateways" className="text-blue-600 hover:text-blue-800 underline">
                      Gateways
                    </Link>
                    {" "}page.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">defaultPrice</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">0</td>
                  <td className="py-2 text-gray-600 text-xs">
                    Maximum price (in EUR) to automatically grant access without requiring a license
                    token. Set to{" "}
                    <code className="bg-gray-100 px-1 rounded">0</code>{" "}
                    to block all paid content by default.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">refreshInterval</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">300000</td>
                  <td className="py-2 text-gray-600 text-xs">
                    How often the SDK refreshes your rules from Liquad, in milliseconds.
                    Default is 5 minutes (300,000 ms). Lower values mean rule changes apply faster
                    but use more API calls.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">waitUntil</td>
                  <td className="py-2 pr-4 text-gray-500 text-xs">-</td>
                  <td className="py-2 text-gray-600 text-xs">
                    Only needed for <strong>Cloudflare Workers</strong>. Pass{" "}
                    <code className="bg-gray-100 px-1 rounded">ctx.waitUntil.bind(ctx)</code>{" "}
                    so analytics events are sent after the response, without slowing it down.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">onError</td>
                  <td className="py-2 pr-4 text-gray-500 text-xs">ignored</td>
                  <td className="py-2 text-gray-600 text-xs">
                    A function that gets called if something goes wrong inside the SDK.
                    The SDK never crashes your server — errors are silently caught. Use this
                    if you want to log them.
                  </td>
                </tr>
                <tr>
                  <td className="py-2 pr-4 font-mono text-xs">apiBaseUrl</td>
                  <td className="py-2 pr-4 font-mono text-xs text-gray-500">https://liquad.app</td>
                  <td className="py-2 text-gray-600 text-xs">
                    The URL of the Liquad API. You should <strong>not</strong> change this unless
                    you are running a self-hosted deployment.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionCard>
      </div>

      {/* How it works */}
      <div className="mt-6">
        <SectionCard title="How It Works">
          <p className="text-sm text-gray-600 mb-4">
            Once integrated, the SDK automatically protects your content. Here{"'"}s what
            happens on every request:
          </p>
          <div className="space-y-3 text-sm text-gray-600">
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                1
              </span>
              <div>
                <strong className="text-gray-900">Rules sync</strong>
                <p className="text-gray-500 text-xs mt-0.5">
                  The SDK fetches your licensing rules (which bots to allow, block, or charge)
                  from Liquad and caches them locally. Rules are refreshed every 5 minutes by
                  default.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                2
              </span>
              <div>
                <strong className="text-gray-900">Bot detection</strong>
                <p className="text-gray-500 text-xs mt-0.5">
                  On each request, the SDK checks if the visitor is an AI bot (like GPTBot,
                  ClaudeBot, etc.) by looking at the User-Agent header. Regular visitors (humans)
                  always pass through untouched — the SDK has zero impact on normal traffic.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                3
              </span>
              <div>
                <strong className="text-gray-900">Rule enforcement</strong>
                <p className="text-gray-500 text-xs mt-0.5">
                  For recognized bots, the SDK applies your rules: grant free access, require a
                  valid license token for paid content, or block the bot entirely.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                4
              </span>
              <div>
                <strong className="text-gray-900">Identity verification</strong>
                <p className="text-gray-500 text-xs mt-0.5">
                  The SDK verifies that bots are who they claim to be using DNS checks. This
                  prevents fake bots from impersonating real ones (e.g. someone pretending to be
                  GoogleBot). This runs transparently in the background.
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                5
              </span>
              <div>
                <strong className="text-gray-900">Analytics reporting</strong>
                <p className="text-gray-500 text-xs mt-0.5">
                  Every bot access is reported to your{" "}
                  <Link href="/dashboard" className="text-blue-600 hover:text-blue-800 underline">
                    dashboard
                  </Link>{" "}
                  for real-time analytics — see which bots are visiting, how often, and which content
                  they access.
                </p>
              </div>
            </div>
          </div>
        </SectionCard>
      </div>

      {/* Need help */}
      <div className="mt-6">
        <SectionCard title="Need Help?">
          <p className="text-sm text-gray-600">
            If you run into any issue during setup, reach us at{" "}
            <span className="text-blue-600 font-medium">support@liquad.app</span>.
            Include your workspace name and the platform you{"'"}re deploying to, and we{"'"}ll
            help you get set up.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}

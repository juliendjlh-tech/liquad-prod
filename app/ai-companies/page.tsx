import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LIQUAD — AI COMPANIES LANDING PAGE                                 ║
// ║  Persona: AI Crawler Operator / AI Product Team                     ║
// ║  Tone: Technical, partnership-forward, compliance-positive          ║
// ║  Visual: Same pitch deck dark theme                                 ║
// ╚══════════════════════════════════════════════════════════════════════╝

const HERO = {
  badge: "For AI Companies",
  headline_line1: "Access publisher content",
  headline_line2: "legally and reliably.",
  subheadline:
    "Liquad is the single API that gives your AI agents licensed access to a growing network of European publishers — with clear terms, real-time authentication, and full compliance.",
  cta_primary: { label: "Get API Access", href: "https://tally.so/r/xXNeZr" },
  cta_secondary: { label: "How it works", href: "#how-it-works" },
  stats: [
    { value: "1 API", label: "to access all publishers in the network" },
    { value: "< 50ms", label: "token generation per URL batch" },
    { value: "EU-compliant", label: "GDPR + EU Copyright Directive" },
  ],
};

const PROBLEM = {
  eyebrow: "The challenge",
  headline:
    "Your AI agents need content. Getting it legally is getting harder.",
  pains: [
    {
      stat: "60%",
      stat_context: "of publishers blocking AI crawlers",
      title: "robots.txt is tightening",
      desc: "More publishers are blocking AI bots via robots.txt. Your crawlers lose access to critical knowledge sources every month.",
    },
    {
      stat: "6-12mo",
      stat_context: "average deal cycle",
      title: "Direct deals don't scale",
      desc: "Negotiating individually with each publisher requires legal teams, months of back-and-forth, and custom technical integrations.",
    },
    {
      stat: "€1.5B+",
      stat_context: "in recent settlements",
      title: "Legal risk is real",
      desc: "From the NYT lawsuit to the Anthropic settlement — using unlicensed content exposes your company to significant legal and reputational risk.",
    },
  ],
  pivot:
    "What if you could access licensed, structured, up-to-date knowledge from thousands of publishers — through a single integration?",
};

const SOLUTION = {
  eyebrow: "The platform",
  headline: "One API. Thousands of publishers. Full compliance.",
  subheadline:
    "Liquad is the AI content licensing marketplace. Publishers define their terms. You access their content through a single, authenticated API.",
  pillars: [
    {
      step: "Single API",
      title: "Authenticate once, access everything",
      desc: "No more publisher-by-publisher integrations. Liquad provides a single transactional API that gives your agents licensed access to all content in the network.",
      detail: "Batch URL requests — get signed tokens for thousands of URLs in one call",
    },
    {
      step: "Licensed access",
      title: "Every access is authorized and traceable",
      desc: "Each content retrieval is backed by a signed token tied to your agent, the URL, and a timestamp. Full audit trail for compliance teams.",
      detail: "HMAC-SHA256 signed tokens — cryptographically verifiable, bot-bound, non-transferable",
    },
    {
      step: "Fresh knowledge",
      title: "Real-time content, not stale training data",
      desc: "Access up-to-date editorial content directly from publisher sites. Structured, indexed, and available the moment it's published.",
      detail: "Ideal for RAG pipelines, agentic workflows, and real-time knowledge retrieval",
    },
  ],
};

const HOW_IT_WORKS = {
  eyebrow: "How it works",
  headline: "From zero to licensed content in 4 steps",
  steps: [
    {
      number: "01",
      title: "Create your account",
      desc: "Sign up and get your API key. Define which AI agents will access content through Liquad.",
    },
    {
      number: "02",
      title: "Fund your balance",
      desc: "Add funds to your EUR balance. Each content access is debited at the publisher's price. Free content costs nothing.",
    },
    {
      number: "03",
      title: "Call the batch API",
      desc: "Submit a list of URLs your agents need to access. Liquad resolves each URL to its publisher, catalog, and pricing — and returns signed access tokens.",
    },
    {
      number: "04",
      title: "Present tokens, get content",
      desc: "Your agents present the signed token in the HTTP header when accessing publisher sites. The SDK verifies locally in 0.01ms — zero latency for publishers, instant access for you.",
    },
  ],
  partner_nudge: {
    label: "Already working with a publisher?",
    desc: "Some publishers issue API keys directly to their AI partners — no account needed on your side, they cover the cost. Talk to your publisher contact or reach out to ours.",
    cta_label: "Contact our partnerships team →",
    cta_href: "https://tally.so/r/VL1kYJ",
  },
};

const VALUE_PROPS = {
  eyebrow: "Why Liquad",
  headline: "Built for AI product teams",
  items: [
    {
      title: "No legal overhead",
      desc: "Liquad handles the licensing framework. You access content under publisher-defined terms without negotiating individual deals.",
    },
    {
      title: "Transparent pricing",
      desc: "Every publisher sets their own price per catalog. You see the cost before you commit. No hidden fees, no surprise invoices.",
    },
    {
      title: "Batch-first API",
      desc: "Request thousands of URLs in a single call. Multi-publisher, multi-domain — resolved and tokenized in one response.",
    },
    {
      title: "Compliance by design",
      desc: "GDPR-native, EU Copyright Directive aligned, full audit trail. Every access is logged, signed, and traceable.",
    },
    {
      title: "Network effect",
      desc: "As more publishers join, your single integration gives you access to more content. No additional work on your side.",
    },
    {
      title: "Agent-ready",
      desc: "Designed for agentic AI workflows, RAG pipelines, and real-time knowledge retrieval — not just training crawling.",
    },
  ],
};

const API_PREVIEW = {
  eyebrow: "Developer experience",
  headline: "Clean API. Predictable responses.",
  request: `POST /api/consumer/v1/licenses
Authorization: Bearer YOUR_API_KEY
Content-Type: application/json

{
  "urls": [
    "https://publisher-a.com/article/123",
    "https://publisher-b.com/research/ai-trends",
    "https://publisher-c.com/unknown-article"
  ],
  "max_price_eur": 0.50
}

# Bot identity is derived from your API key — no bot_id needed.
# max_price_eur is optional: skip URLs that exceed your ceiling.`,
  response: `{
  "results": [
    {
      "url": "https://publisher-a.com/article/123",
      "crawl_url": "https://publisher-a.com/article/123?_lq=dG9rZW4t...",
      "reason": "granted",
      "token": "dG9rZW4tZXhhbXBsZS1obWFjLXNpZ...",
      "price_eur": 0.10,
      "catalog_id": "cat_abc123",
      "expires_at": "2026-04-24T13:00:00Z",
      "cached": false,
      "allowed_ips": ["203.0.113.0/24", "198.51.100.42/32"]
    },
    {
      "url": "https://publisher-b.com/research/ai-trends",
      "crawl_url": "https://publisher-b.com/research/ai-trends?_lq=dG9rZW4t...",
      "reason": "granted",
      "token": "dG9rZW4tZXhhbXBsZS1obWFjLXNpZ...",
      "price_eur": 0.25,
      "catalog_id": "cat_def456",
      "expires_at": "2026-04-24T13:00:00Z",
      "cached": true,
      "allowed_ips": ["203.0.113.0/24"]
    },
    {
      "url": "https://publisher-c.com/unknown-article",
      "crawl_url": "https://publisher-c.com/unknown-article",
      "reason": "no_match"
    }
  ],
  "total_cost_eur": 0.10,
  "balance_remaining_eur": 99.90
}`,
};

const PRICING = {
  eyebrow: "Pricing",
  headline: "Pay only for what you access.",
  subheadline:
    "Prepaid EUR balance. Each content access costs what the publisher charges — from free to a few cents. No platform fee, no minimum commitment during beta.",
  tiers: [
    { credits: "€100", label: "Starter", desc: "Test the network, validate your pipeline" },
    { credits: "€500", label: "Growth", desc: "Scale access across multiple publishers" },
    { credits: "Custom", label: "Enterprise", desc: "Volume pricing, dedicated support" },
  ],
  cta: { label: "Get API Access", href: "https://tally.so/r/xXNeZr" },
};

const FAQ = {
  eyebrow: "FAQ",
  headline: "Questions from AI teams",
  items: [
    {
      q: "How do publishers set their pricing?",
      a: "Each publisher defines a price per content catalog (a group of URL patterns). Some catalogs are free, others cost a few cents per access. You see the price before committing credits.",
    },
    {
      q: "What content is available in the network?",
      a: "Liquad is in early access. We're onboarding European publishers across media, trade press, and expert content. The network grows every week.",
    },
    {
      q: "How do signed tokens work?",
      a: "When you purchase access to a URL, Liquad generates an HMAC-SHA256 signed token bound to your bot's identity, the specific URL, and an expiration. The token is verified locally by the publisher's SDK in under 0.1ms — no network call needed.",
    },
    {
      q: "Can I use this for RAG and agentic workflows?",
      a: "Yes — that's the primary use case. Liquad provides real-time, licensed access to fresh publisher content. Ideal for retrieval-augmented generation, AI agents that need authoritative sources, and any workflow requiring up-to-date knowledge.",
    },
    {
      q: "What happens if a publisher blocks my bot?",
      a: "If your bot is on a publisher's watchlist but not authorized on any catalog, you'll get an error explaining why. Purchasing access through Liquad's API is how you get authorized — the publisher defines the terms, you accept them by buying credits.",
    },
    {
      q: "Do I need to create an account to use Liquad?",
      a: "No — not if a publisher partner has already issued you a key. You can start calling the API in minutes with their key, and they cover the cost for content accessed on their site. Create your own account when you want multi-publisher access, your own billing, or a custom bot identity.",
    },
    {
      q: "What if I need my bot to use a custom User-Agent?",
      a: "You can create a custom bot identity in your Liquad account. Each publisher must explicitly enable it on their catalogs. For standard bots (GPTBot, ClaudeBot, etc.), you inherit access from publishers who already opted-in to those presets — no per-publisher negotiation needed.",
    },
  ],
};

const CTA_FINAL = {
  headline: "Stop scraping. Start licensing.",
  subheadline:
    "One API key. Thousands of publishers. Full compliance. Get access to licensed content your AI agents can trust.",
  cta_primary: { label: "Get API Access", href: "https://tally.so/r/xXNeZr" },
  cta_secondary: { label: "For publishers", href: "/" },
};

const FOOTER = {
  links: [
    { label: "Platform", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "API", href: "#api" },
    { label: "FAQ", href: "#faq" },
    { label: "For publishers", href: "/" },
    { label: "Sign in", href: "/login" },
  ],
  copyright: "© 2026 Liquad. All rights reserved.",
};

export default function AICompaniesPage() {
  return (
    <div className="min-h-screen bg-deck-bg">

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(30,41,59,0.3)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,41,59,0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pt-28 pb-20 text-center">

          <div className="inline-flex items-center gap-2 rounded-full border border-deck-green/30 bg-deck-green/10 px-4 py-1.5 text-xs font-semibold text-deck-green mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-deck-green animate-pulse" />
            {HERO.badge}
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.05]">
            <span className="block">{HERO.headline_line1}</span>
            <span className="block text-deck-green">{HERO.headline_line2}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-deck-text-dim leading-relaxed">
            {HERO.subheadline}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={HERO.cta_primary.href}
              className="rounded-xl bg-deck-green px-8 py-3.5 text-sm font-semibold text-deck-bg shadow-lg shadow-deck-green/20 hover:bg-deck-green/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {HERO.cta_primary.label} →
            </Link>
            <a
              href={HERO.cta_secondary.href}
              className="text-sm font-semibold text-deck-text-dim hover:text-white transition-colors"
            >
              {HERO.cta_secondary.label} ↓
            </a>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-6 border-t border-deck-border pt-10">
            {HERO.stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="mt-1 text-xs text-deck-text-dim">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PROBLEM ──────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-8 text-center">
            {PROBLEM.eyebrow}
          </p>

          <h2 className="text-2xl font-bold text-white text-center mb-14 max-w-3xl mx-auto leading-relaxed">
            {PROBLEM.headline}
          </h2>

          <div className="grid gap-6 sm:grid-cols-3 mb-16">
            {PROBLEM.pains.map((pain) => (
              <div key={pain.title} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-black text-deck-green">{pain.stat}</span>
                  <span className="text-xs text-deck-text-dim">{pain.stat_context}</span>
                </div>
                <h3 className="font-semibold text-white mb-2">{pain.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{pain.desc}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-deck-border pt-12 text-center max-w-3xl mx-auto">
            <h3 className="text-3xl font-bold text-white sm:text-4xl leading-tight">
              {PROBLEM.pivot}
            </h3>
          </div>
        </div>
      </section>

      {/* ─── SOLUTION ─────────────────────────────────────────────── */}
      <section className="py-24" id="features">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
              {SOLUTION.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">
              {SOLUTION.headline}
            </h2>
            <p className="mx-auto max-w-2xl text-base text-deck-text-dim leading-relaxed">
              {SOLUTION.subheadline}
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {SOLUTION.pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-2xl border border-deck-border bg-deck-card p-8 hover:border-deck-green/40 transition-all duration-200"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
                  {pillar.step}
                </p>
                <h3 className="text-base font-semibold text-white mb-3">{pillar.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed mb-4">{pillar.desc}</p>
                <p className="text-xs text-deck-green font-medium">{pillar.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="py-24" id="how-it-works">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
              {HOW_IT_WORKS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {HOW_IT_WORKS.headline}
            </h2>
          </div>
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-5xl font-black text-deck-green/20 leading-none mb-3 select-none">
                  {step.number}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>

          {/* Partner nudge */}
          <div className="mt-14 rounded-2xl border border-deck-green/20 bg-deck-green/5 px-8 py-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-white mb-1">
                {HOW_IT_WORKS.partner_nudge.label}
              </p>
              <p className="text-sm text-deck-text-dim leading-relaxed max-w-xl">
                {HOW_IT_WORKS.partner_nudge.desc}
              </p>
            </div>
            <a
              href={HOW_IT_WORKS.partner_nudge.cta_href}
              className="shrink-0 text-sm font-semibold text-deck-green hover:text-white transition-colors whitespace-nowrap"
            >
              {HOW_IT_WORKS.partner_nudge.cta_label}
            </a>
          </div>
        </div>
      </section>

      {/* ─── VALUE PROPS ──────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
              {VALUE_PROPS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {VALUE_PROPS.headline}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {VALUE_PROPS.items.map((item) => (
              <div key={item.title} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── API PREVIEW ──────────────────────────────────────────── */}
      <section className="py-24" id="api">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
              {API_PREVIEW.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {API_PREVIEW.headline}
            </h2>
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="rounded-2xl border border-deck-border bg-deck-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-deck-green/60" />
                <span className="text-xs text-deck-text-dim font-mono">Request</span>
              </div>
              <pre className="text-sm text-deck-text font-mono leading-relaxed overflow-x-auto">
                <code>{API_PREVIEW.request}</code>
              </pre>
            </div>
            <div className="rounded-2xl border border-deck-border bg-deck-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-deck-blue/60" />
                <span className="text-xs text-deck-text-dim font-mono">Response</span>
              </div>
              <pre className="text-sm text-deck-text font-mono leading-relaxed overflow-x-auto">
                <code>{API_PREVIEW.response}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      <section className="py-24" id="pricing">
        <div className="mx-auto max-w-4xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
            {PRICING.eyebrow}
          </p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">
            {PRICING.headline}
          </h2>
          <p className="text-base text-deck-text-dim leading-relaxed mb-12 max-w-2xl mx-auto">
            {PRICING.subheadline}
          </p>

          {/*<div className="grid gap-6 sm:grid-cols-3 mb-10">
            {PRICING.tiers.map((tier) => (
              <div key={tier.label} className="rounded-2xl border border-deck-border bg-deck-card p-8 text-center">
                <div className="text-3xl font-black text-deck-green mb-1">{tier.credits}</div>
                <div className="text-sm font-semibold text-white mb-2">{tier.label}</div>
                <p className="text-xs text-deck-text-dim">{tier.desc}</p>
              </div>
            ))}
          </div>*/}

          <Link
            href={PRICING.cta.href}
            className="inline-block rounded-xl bg-deck-green px-8 py-3.5 text-sm font-semibold text-deck-bg shadow-lg shadow-deck-green/20 hover:bg-deck-green/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
          >
            {PRICING.cta.label} →
          </Link>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────── */}
      <section className="py-24" id="faq">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
              {FAQ.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {FAQ.headline}
            </h2>
          </div>
          <div className="space-y-4">
            {FAQ.items.map((item) => (
              <div key={item.q} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <h3 className="font-semibold text-white mb-2">{item.q}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24 border-t border-deck-border">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(34,197,94,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,197,94,0.05)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight">
            {CTA_FINAL.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-deck-text-dim leading-relaxed">
            {CTA_FINAL.subheadline}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={CTA_FINAL.cta_primary.href}
              className="inline-block rounded-xl bg-deck-green px-8 py-3.5 text-sm font-semibold text-deck-bg shadow-lg shadow-deck-green/20 hover:bg-deck-green/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {CTA_FINAL.cta_primary.label} →
            </Link>
            <Link
              href={CTA_FINAL.cta_secondary.href}
              className="text-sm font-semibold text-deck-text-dim hover:text-white transition-colors"
            >
              {CTA_FINAL.cta_secondary.label} →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────── */}
      <footer className="border-t border-deck-border py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <Link href="/" className="flex items-center gap-2">
              <svg height="28" width="auto" viewBox="0 0 81 202" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M53.8636 173.182V135.818H53.2727C52.3636 137.758 51.0758 139.682 49.4091 141.591C47.7727 143.47 45.6364 145.03 43 146.273C40.3939 147.515 37.2121 148.136 33.4545 148.136C28.1515 148.136 23.3485 146.773 19.0455 144.045C14.7727 141.288 11.3788 137.242 8.86364 131.909C6.37879 126.545 5.13636 119.97 5.13636 112.182C5.13636 104.182 6.42424 97.5303 9 92.2273C11.5758 86.8939 15 82.9091 19.2727 80.2727C23.5758 77.6061 28.2879 76.2727 33.4091 76.2727C37.3182 76.2727 40.5758 76.9394 43.1818 78.2727C45.8182 79.5758 47.9394 81.2121 49.5455 83.1818C51.1818 85.1212 52.4242 87.0303 53.2727 88.9091H54.0909V77.1818H73.1818V173.182H53.8636ZM39.5909 132.727C42.7121 132.727 45.3485 131.879 47.5 130.182C49.6818 128.455 51.3485 126.045 52.5 122.955C53.6818 119.864 54.2727 116.242 54.2727 112.091C54.2727 107.939 53.697 104.333 52.5455 101.273C51.3939 98.2121 49.7273 95.8485 47.5455 94.1818C45.3636 92.5151 42.7121 91.6818 39.5909 91.6818C36.4091 91.6818 33.7273 92.5455 31.5455 94.2727C29.3636 96 27.7121 98.3939 26.5909 101.455C25.4697 104.515 24.9091 108.061 24.9091 112.091C24.9091 116.152 25.4697 119.742 26.5909 122.864C27.7424 125.955 29.3939 128.379 31.5455 130.136C33.7273 131.864 36.4091 132.727 39.5909 132.727Z" fill="white"/>
                <path d="M53.8636 51.8182V89.1818H53.2727C52.3636 87.2424 51.0758 85.3182 49.4091 83.4091C47.7727 81.5303 45.6364 79.9697 43 78.7273C40.3939 77.4848 37.2121 76.8636 33.4545 76.8636C28.1515 76.8636 23.3485 78.2273 19.0455 80.9545C14.7727 83.7121 11.3788 87.7576 8.86364 93.0909C6.37879 98.4545 5.13636 105.03 5.13636 112.818C5.13636 120.818 6.42424 127.47 9 132.773C11.5758 138.106 15 142.091 19.2727 144.727C23.5758 147.394 28.2879 148.727 33.4091 148.727C37.3182 148.727 40.5758 148.061 43.1818 146.727C45.8182 145.424 47.9394 143.788 49.5455 141.818C51.1818 139.879 52.4242 137.97 53.2727 136.091H54.0909V147.818H73.1818V51.8182H53.8636ZM39.5909 92.2727C42.7121 92.2727 45.3485 93.1212 47.5 94.8182C49.6818 96.5455 51.3485 98.9545 52.5 102.045C53.6818 105.136 54.2727 108.758 54.2727 112.909C54.2727 117.061 53.697 120.667 52.5455 123.727C51.3939 126.788 49.7273 129.152 47.5455 130.818C45.3636 132.485 42.7121 133.318 39.5909 133.318C36.4091 133.318 33.7273 132.455 31.5455 130.727C29.3636 129 27.7121 126.606 26.5909 123.545C25.4697 120.485 24.9091 116.939 24.9091 112.909C24.9091 108.848 25.4697 105.258 26.5909 102.136C27.7424 99.0455 29.3939 96.6212 31.5455 94.8636C33.7273 93.1364 36.4091 92.2727 39.5909 92.2727Z" fill="white"/>
                <path d="M53.7273 124V54.1818H73.0909V124H53.7273ZM63.4545 45.1818C60.5758 45.1818 58.1061 44.2273 56.0455 42.3182C54.0152 40.3788 53 38.0606 53 35.3636C53 32.697 54.0152 30.4091 56.0455 28.5C58.1061 26.5606 60.5758 25.5909 63.4545 25.5909C66.3333 25.5909 68.7879 26.5606 70.8182 28.5C72.8788 30.4091 73.9091 32.697 73.9091 35.3636C73.9091 38.0606 72.8788 40.3788 70.8182 42.3182C68.7879 44.2273 66.3333 45.1818 63.4545 45.1818Z" fill="white"/>
              </svg>
              <span className="font-semibold text-white">Liquad</span>
            </Link>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-deck-text-dim">
              {FOOTER.links.map((link) => (
                <Link key={link.label} href={link.href} className="hover:text-white transition-colors">
                  {link.label}
                </Link>
              ))}
            </div>
            <p className="text-xs text-deck-text-dim/50">{FOOTER.copyright}</p>
          </div>
        </div>
      </footer>

    </div>
  );
}

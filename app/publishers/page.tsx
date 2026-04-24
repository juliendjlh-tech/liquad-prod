import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LIQUAD LANDING PAGE v6 — Pitch Deck Dark Theme                     ║
// ║  Visual: dark navy bg, blue accents, card-based layout              ║
// ║  Messaging: See. Control. Earn. (partnership + knowledge)           ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── HERO ────────────────────────────────────────────────────────────────
const HERO = {
  badge: "AI Content Licensing for Publishers",
  headline_line1: "Stop giving your content",
  headline_line2: "to AI for free.",
  subheadline:
    "AI services access your content daily without compensation. Liquad lets European publishers see who's crawling, set their own rules, and earn revenue — in one platform.",
  cta_primary: { label: "Get Early Access", href: "https://tally.so/r/VL1kLN" },
  cta_secondary: { label: "See how it works", href: "#how-it-works" },
  stats: [
    { value: "50,000+", label: "EU publishers with no AI licensing solution" },
    { value: "-25%", label: "search volume decline by 2026 (Gartner)" },
    { value: "<5ms", label: "SDK latency impact on your site" },
  ],
  stats_note:
    "Press Gazette 2024–2025 · Gartner Feb 2024 · Internal benchmark",
};

// ── PROBLEM ─────────────────────────────────────────────────────────────
const PROBLEM = {
  eyebrow: "Our statement",
  headline:
    "Knowledge search and consumption habits are undergoing a major transformation, which will have a considerable impact on the content monetization industry.",
  pains: [
    {
      stat: "69%",
      stat_context: "of Google searches with zero clicks",
      title: "Acquisition channels are broken",
      desc: "AI captures the top of funnel before you do. SEO, paid campaigns, newsletters — all losing ground.",
      source: "Similarweb / SE Roundtable, Jul 2025",
      source_url:
        "https://www.seroundtable.com/similarweb-google-zero-click-search-growth-39706.html",
    },
    {
      stat: "-43%",
      stat_context: "search traffic decline by 2029",
      title: "Loss of audience data",
      desc: "Without on-site traffic, segmentation, personalization and retention all weaken.",
      source: "Reuters Institute, Jan 2026",
      source_url:
        "https://reutersinstitute.politics.ox.ac.uk/journalism-media-and-technology-trends-and-predictions-2026",
    },
    {
      stat: "-65%",
      stat_context: "ad revenue loss",
      title: "Ad revenue is eroding",
      desc: "Fewer visits, fewer impressions, lower advertiser demand. Some publishers saw display revenue drop 65%.",
      source: "AdExchanger, 2025",
      source_url:
        "https://www.adexchanger.com/publishers/the-ai-search-reckoning-is-dismantling-open-web-traffic-and-publishers-may-never-recover/",
    },
  ],
  pivot_line1:
    "50,000+ mid-size European publishers have no seat at the table.",
  pivot_line2:
    "What if the AI services consuming your content became your best customers?",
  pivot_context:
    "Today they access your content without asking. Tomorrow they need reliable, traceable, up-to-date knowledge sources their agents can integrate legally. The shift from free access to paid licensing is already underway.",
};

// ── SOLUTION ────────────────────────────────────────────────────────────
const SOLUTION = {
  eyebrow: "The solution",
  headline: "See. Control. Earn.",
  subheadline:
    "Liquad connects your content to AI services willing to pay for it. You set the rules. We handle the licensing.",
  pillars: [
    {
      step: "Step 1",
      title: "See your AI traffic",
      desc: "Know exactly which AI agents access your content, how often, and what knowledge they value most. Real-time dashboard from day one.",
      detail:
        "Tracks GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider + custom agents",
    },
    {
      step: "Step 2",
      title: "Set your own rules",
      desc: "Define which AI services can access what content, under which conditions, and at what price. Per catalog, per AI partner, per price point.",
      detail:
        "Your licensing policies, enforced automatically — content-level granularity, not domain-level",
    },
    {
      step: "Step 3",
      title: "Earn from every AI access",
      desc: "Built-in transaction platform. Every access is tracked, priced, and paid. Revenue from your content expertise — on your terms.",
      detail:
        "Monthly payouts with full analytics — zero double-billing guarantee",
    },
  ],
};

// ── HOW IT WORKS ────────────────────────────────────────────────────────
const HOW_IT_WORKS = {
  eyebrow: "How it works",
  headline: "The Complete AI Content Licensing Stack",
  pillars: [
    {
      icon: "🤖",
      title: "Monitored AI Agent Watchlist",
      desc_top:
        "We monitor, qualify and keep up to date a list of the principal AI bots & crawlers to embed in your watchlist.",
      desc_bottom:
        "Gain visibility over what contents are the most scraped, what AI bots are the most active and for what usage.",
    },
    {
      icon: "🤝",
      title: "Integrated partnership policies",
      desc_top:
        "Easily define granular policies per AI agents and path rules. Our embedded SDK loads your rules to control path access.",
      desc_bottom:
        "Prevent abusive extraction of your content, and secure your AI licensed partnerships over content access.",
    },
    {
      icon: "💳",
      title: "Transaction platform",
      desc_top:
        "We automatically index your contents to make it accessible by your partners through a transactional, secured and monitored API.",
      desc_bottom:
        "Seamlessly grant paid licensed access over your content to legit AI Partners, and get automatically retributed.",
    },
  ],
};

// ── PARTNER KEYS ────────────────────────────────────────────────────────
const PARTNER_KEYS = {
  eyebrow: "Distribution",
  headline: "Onboard your AI partners in one click.",
  subheadline:
    "Issue API keys to your AI partners directly from your dashboard. They access your content instantly — no Liquad account required on their side. You stay in control of who gets access and can revoke anytime.",
  bullets: [
    {
      title: "Zero friction for your partners",
      desc: "They use the key you gave them. First API call in minutes, not weeks. No signup, no billing setup on their end.",
    },
    {
      title: "You set the terms",
      desc: "Each key is bound to a specific bot identity. Revoke individually, anytime, from your dashboard.",
    },
    {
      title: "Consolidated billing",
      desc: "Partner usage is billed to your account at the catalog price you set. One line in your Liquad dashboard — full visibility.",
    },
  ],
};

// ── TECHNICAL PROOF ─────────────────────────────────────────────────────
const TECH_PROOF = {
  eyebrow: "Built for production",
  headline: "Your site stays fast. We guarantee it.",
  stats: [
    {
      value: "0.1ms",
      label: "Token verification",
      desc: "HMAC-SHA256 verified locally — zero network calls on the hot path",
    },
    {
      value: "5 min",
      label: "Integration",
      desc: "Built on Web Standard APIs — no third-party runtime dependencies",
    },
    {
      value: "5 min",
      label: "Rule cache TTL",
      desc: "Policies cached locally, configurable per publisher. Events batched async",
    },
    {
      value: "0",
      label: "Downtime risk",
      desc: "SDK fails open. Your site is never impacted — even if Liquad is unreachable",
    },
  ],
  code_snippet: `import { createLiquadHandler } from '@liquad/sdk';

const handler = createLiquadHandler({
  apiKey: process.env.LIQUAD_API_KEY,
  refreshInterval: 300_000, // 5 min (default)
});

// In your middleware or request handler:
const result = await handler(request);
if (result.blocked) return result.response;`,
};

// ── MARKET PROOF ────────────────────────────────────────────────────────
const MARKET_PROOF = {
  eyebrow: "The market is real",
  stat_headline: "$2.9B",
  stat_desc: "committed in AI content licensing deals over 2024–2025.",
  stat_caveat: "But concentrated in just 34 mega-deals.",
  headline: "Only the largest publishers have a seat today.",
  deals: [
    {
      publisher: "News Corp",
      partner: "OpenAI",
      amount: "$250M",
      detail: "Wall Street Journal, NY Post, MarketWatch — over 5 years",
    },
    {
      publisher: "Reuters",
      partner: "Meta",
      amount: "$65M",
      detail: "Access to the Reuters archive",
    },
    {
      publisher: "Axel Springer",
      partner: "OpenAI",
      amount: "$50M",
      detail: "Bild, Politico, Business Insider",
    },
  ],
  bottom_line:
    "These deals took months of legal negotiation. Liquad lets you do it in days — with licensing policies you control.",
  disclaimer:
    "Sources: Press Gazette, Media and the Machine (2024–2025). Liquad is not affiliated with these publishers.",
};

// ── NETWORK ─────────────────────────────────────────────────────────────
const NETWORK = {
  headline:
    "You're not alone. A growing network of publishers is already defining how AI accesses their content.",
  desc: "More publishers join, more content becomes available, more AI partners pay — and more revenue flows back to everyone. Your knowledge becomes more valuable as the network scales.",
};

// ── COMPARISON ──────────────────────────────────────────────────────────
const COMPARISON = {
  eyebrow: "Why Liquad",
  headline: "Why existing options fall short",
  competitors: [
    {
      name: "robots.txt",
      verdict: "Binary. Block or allow, no revenue.",
      limitations: [
        "No monetization",
        "No analytics",
        "No granularity",
        "Often ignored by crawlers",
      ],
    },
    {
      name: "CDN-level tools",
      verdict: "Domain-wide. Not content-level.",
      limitations: [
        "Domain-level control only",
        "CDN lock-in required",
        "No content marketplace",
        "No licensing policies",
      ],
    },
    {
      name: "Direct deals",
      verdict: "Months of legal work. Enterprise only.",
      limitations: [
        "Requires legal teams",
        "6-12 month negotiation cycles",
        "Only viable for top publishers",
        "No self-serve option",
      ],
    },
  ],
  liquad: {
    name: "Liquad",
    points: [
      "Content-level granularity (per URL, per AI partner, per price)",
      "Self-serve, live in 30 minutes",
      "Flat fee — predictable, affordable",
      "EU-native, GDPR-compliant by design",
      "Built-in transaction platform",
      "Network effect — more publishers, more value",
    ],
  },
};

// ── EU ADVANTAGE ────────────────────────────────────────────────────────
const EU_ADVANTAGE = {
  eyebrow: "Built for Europe",
  points: [
    {
      title: "GDPR-native",
      desc: "No personal data collected. No US data transfers.",
    },
    {
      title: "EU Copyright Directive aligned",
      desc: "Article 15 — your legal leverage, our infrastructure.",
    },
    {
      title: "EU-hosted",
      desc: "European infrastructure. Deploy without legal review.",
    },
    {
      title: "IAB CoMP v1.0 compatible",
      desc: "Ready for the emerging industry standard.",
    },
  ],
};

// ── PRICING ─────────────────────────────────────────────────────────────
const PRICING = {
  eyebrow: "Pricing",
  headline: "Flat fee. No surprises.",
  subheadline:
    "No per-pageview pricing, no surprise bills. Predictable monthly cost your finance team will approve.",
  plan: {
    name: "Early Access",
    price: "Free during beta",
    price_note: "Flat monthly fee after launch",
    features: [
      "Full dashboard & AI traffic analytics",
      "Unlimited content catalog imports",
      "Granular licensing policies (per URL, per AI partner)",
      "Built-in EUR transaction platform",
      "Framework-agnostic SDK — no third-party runtime dependencies",
      "EU-hosted, GDPR-compliant",
    ],
    cta: { label: "Get Early Access", href: "https://tally.so/r/VL1kLN" },
  },
  model_note:
    "Our model is aligned with yours: we earn when you distribute, not before.",
};

// ── FAQ ─────────────────────────────────────────────────────────────────
const FAQ = {
  eyebrow: "FAQ",
  headline: "Common questions",
  items: [
    {
      q: "Will this affect my SEO?",
      a: "No. Liquad only manages AI agent access — Googlebot, Bingbot, and all search engine crawlers are never affected. Your organic search rankings remain fully intact.",
    },
    {
      q: "How does Liquad replace lost ad revenue?",
      a: "By creating a direct revenue channel independent of traffic volume. AI services pay to access your content through the Liquad network. The more specialized and current your knowledge, the more it's valued. Recurring revenue that doesn't depend on visitor count.",
    },
    {
      q: "What is the single-API authentication?",
      a: "Instead of negotiating separate deals with each AI service, Liquad provides a shared API. AI partners authenticate once and access all publishers according to their licensing policies. One deployment connects you to the entire network.",
    },
    {
      q: "What's my revenue share?",
      a: "A significant portion of each transaction goes directly to the originating publisher. Exact terms depend on content type, access frequency, and distribution volume. We define them together during onboarding. Our model is aligned — we only earn when you distribute.",
    },
    {
      q: "Do I need a developer to set this up?",
      a: "You need a developer for a one-time SDK integration (under 30 minutes). The SDK is framework-agnostic and works with any runtime that supports Web Standard APIs (Node.js 18+, Cloudflare Workers, Vercel Edge, Deno). After that, everything — watchlist, policies, pricing, analytics — is managed from your dashboard.",
    },
    {
      q: "What if the SDK adds latency to my site?",
      a: "The SDK adds less than 5ms of latency. Token verification is done locally via HMAC-SHA256 in under 0.1ms — zero network calls. Policies are cached locally with a configurable refresh interval (default: 5 min). If anything fails, the SDK fails open — your site is never impacted.",
    },
    {
      q: "Can I onboard AI partners without them creating an account?",
      a: "Yes. From your dashboard you can issue API keys directly to your AI partners, each bound to a specific bot identity. They use the key — no Liquad account needed on their side. You stay in control of access and absorb the usage cost, which is consistent with the licensing terms you've already set on your catalogs.",
    },
  ],
};

// ── FINAL CTA ───────────────────────────────────────────────────────────
const CTA_FINAL = {
  headline: "Every day without Liquad, your content serves AI for free.",
  subheadline:
    "Join the network. See your AI traffic. Set your rules. Start earning.",
  cta_primary: { label: "Get Early Access", href: "https://tally.so/r/VL1kLN" },
  cta_secondary: { label: "See how it works", href: "#how-it-works" },
};

// ── FOOTER ──────────────────────────────────────────────────────────────
const FOOTER = {
  links: [
    { label: "Platform", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
    { label: "For AI companies", href: "/ai-companies" },
    { label: "Sign in", href: "/login" },
  ],
  copyright: "© 2026 Liquad. All rights reserved.",
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                        PAGE COMPONENT                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-deck-bg">

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(30,41,59,0.3)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,41,59,0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pt-28 pb-20 text-center">

          <div className="inline-flex items-center gap-2 rounded-full border border-deck-blue/30 bg-deck-blue/10 px-4 py-1.5 text-xs font-semibold text-deck-blue mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-deck-blue animate-pulse" />
            {HERO.badge}
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.05]">
            <span className="block">{HERO.headline_line1}</span>
            <span className="block text-deck-blue">{HERO.headline_line2}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-deck-text-dim leading-relaxed">
            {HERO.subheadline}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={HERO.cta_primary.href}
              className="rounded-xl bg-deck-blue px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-deck-blue/20 hover:bg-deck-blue-dim transition-all hover:-translate-y-0.5 active:translate-y-0"
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
          <p className="mt-3 text-xs text-deck-text-dim/50">{HERO.stats_note}</p>
        </div>
      </section>

      {/* ─── PROBLEM ──────────────────────────────────────────────── */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-8 text-center">
            {PROBLEM.eyebrow}
          </p>

          <h2 className="text-xl text-deck-text text-center mb-14 max-w-3xl mx-auto leading-relaxed">
            {PROBLEM.headline}
          </h2>

          <div className="grid gap-6 sm:grid-cols-3 mb-16">
            {PROBLEM.pains.map((pain) => (
              <div key={pain.title} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="text-2xl font-black text-deck-blue">{pain.stat}</span>
                  <span className="text-xs text-deck-text-dim">{pain.stat_context}</span>
                </div>
                <h3 className="font-semibold text-white mb-2">{pain.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed mb-3">{pain.desc}</p>
                <a
                  href={pain.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-deck-text-dim/50 hover:text-deck-text-dim transition-colors"
                >
                  — {pain.source} ↗
                </a>
              </div>
            ))}
          </div>

          {/* Integrated pivot */}
          <div className="border-t border-deck-border pt-12 text-center max-w-3xl mx-auto">
            <p className="text-sm font-semibold text-deck-blue mb-6">
              {PROBLEM.pivot_line1}
            </p>
            <h3 className="text-3xl font-bold text-white sm:text-4xl leading-tight mb-6">
              {PROBLEM.pivot_line2}
            </h3>
            <p className="text-base text-deck-text-dim leading-relaxed">
              {PROBLEM.pivot_context}
            </p>
          </div>
        </div>
      </section>

      {/* ─── SOLUTION: See. Control. Earn. ────────────────────────── */}
      <section className="py-24" id="features">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
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
                className="rounded-2xl border border-deck-border bg-deck-card p-8 hover:border-deck-blue/40 transition-all duration-200"
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
                  {pillar.step}
                </p>
                <h3 className="text-base font-semibold text-white mb-3">{pillar.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed mb-4">{pillar.desc}</p>
                <p className="text-xs text-deck-blue font-medium">{pillar.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="py-24" id="how-it-works">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
              {HOW_IT_WORKS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {HOW_IT_WORKS.headline}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.pillars.map((pillar) => (
              <div key={pillar.title} className="rounded-2xl border border-deck-border bg-deck-card p-8">
                <div className="text-3xl mb-4">{pillar.icon}</div>
                <h3 className="text-base font-semibold text-white mb-4">{pillar.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed mb-4">{pillar.desc_top}</p>
                <p className="text-sm text-deck-text-dim leading-relaxed">{pillar.desc_bottom}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PARTNER KEYS ─────────────────────────────────────────── */}
      <section className="py-24" id="partner-keys">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
              {PARTNER_KEYS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">
              {PARTNER_KEYS.headline}
            </h2>
            <p className="mx-auto max-w-2xl text-base text-deck-text-dim leading-relaxed">
              {PARTNER_KEYS.subheadline}
            </p>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {PARTNER_KEYS.bullets.map((b) => (
              <div key={b.title} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <h3 className="font-semibold text-white mb-2">{b.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TECHNICAL PROOF ──────────────────────────────────────── */}
      <section className="py-24" id="tech">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
              {TECH_PROOF.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {TECH_PROOF.headline}
            </h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 items-start">
            <div className="grid grid-cols-2 gap-4">
              {TECH_PROOF.stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                  <div className="text-3xl font-black text-deck-blue mb-1">{stat.value}</div>
                  <div className="text-sm font-semibold text-white mb-2">{stat.label}</div>
                  <p className="text-xs text-deck-text-dim leading-relaxed">{stat.desc}</p>
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-deck-border bg-deck-card p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-red-500/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                <div className="h-3 w-3 rounded-full bg-green-500/60" />
                <span className="ml-2 text-xs text-deck-text-dim/50 font-mono">server.js</span>
              </div>
              <pre className="text-sm text-deck-text font-mono leading-relaxed overflow-x-auto">
                <code>{TECH_PROOF.code_snippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── MARKET PROOF ─────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
              {MARKET_PROOF.eyebrow}
            </p>
            <div className="mb-4">
              <span className="text-7xl font-black text-deck-blue leading-none">
                {MARKET_PROOF.stat_headline}
              </span>
            </div>
            <p className="text-lg text-deck-text-dim mb-1">{MARKET_PROOF.stat_desc}</p>
            <p className="text-sm font-medium text-white">{MARKET_PROOF.stat_caveat}</p>
          </div>

          <h3 className="text-2xl font-bold text-white text-center mb-10">
            {MARKET_PROOF.headline}
          </h3>

          <div className="grid gap-4 sm:grid-cols-3 mb-10">
            {MARKET_PROOF.deals.map((deal) => (
              <div key={deal.publisher} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-white">{deal.publisher}</div>
                    <div className="text-xs text-deck-text-dim">x {deal.partner}</div>
                  </div>
                  <div className="text-xl font-black text-deck-blue">{deal.amount}</div>
                </div>
                <p className="text-xs text-deck-text-dim leading-relaxed">{deal.detail}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-deck-text mb-2">{MARKET_PROOF.bottom_line}</p>
            <p className="text-xs text-deck-text-dim/50">{MARKET_PROOF.disclaimer}</p>
          </div>
        </div>
      </section>

      {/* ─── NETWORK EFFECT ───────────────────────────────────────── */}
      <section className="py-16 border-y border-deck-border">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl leading-tight mb-4">
            {NETWORK.headline}
          </h2>
          <p className="text-deck-text-dim leading-relaxed">
            {NETWORK.desc}
          </p>
        </div>
      </section>

      {/* ─── COMPARISON ───────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
              {COMPARISON.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {COMPARISON.headline}
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-4">
            {COMPARISON.competitors.map((comp) => (
              <div key={comp.name} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <h3 className="font-semibold text-white mb-2">{comp.name}</h3>
                <p className="text-xs text-deck-text-dim mb-4">{comp.verdict}</p>
                <ul className="space-y-2">
                  {comp.limitations.map((lim) => (
                    <li key={lim} className="flex items-start gap-2 text-xs text-deck-text-dim">
                      <span className="text-deck-text-dim/30 mt-0.5 shrink-0">✗</span>
                      {lim}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="rounded-2xl border-2 border-deck-blue/40 bg-deck-blue/5 p-6">
              <h3 className="font-semibold text-white mb-2">{COMPARISON.liquad.name}</h3>
              <p className="text-xs text-deck-blue mb-4">Built for mid-size European publishers.</p>
              <ul className="space-y-2">
                {COMPARISON.liquad.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs text-deck-text">
                    <span className="text-deck-blue mt-0.5 shrink-0">✓</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── EU ADVANTAGE ─────────────────────────────────────────── */}
      <section className="py-16 border-y border-deck-border">
        <div className="mx-auto max-w-6xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-8 text-center">
            {EU_ADVANTAGE.eyebrow}
          </p>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {EU_ADVANTAGE.points.map((point) => (
              <div key={point.title} className="text-center">
                <h3 className="text-sm font-semibold text-white mb-1">{point.title}</h3>
                <p className="text-xs text-deck-text-dim leading-relaxed">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      <section className="py-24" id="pricing">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
            {PRICING.eyebrow}
          </p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl mb-4">
            {PRICING.headline}
          </h2>
          <p className="text-base text-deck-text-dim leading-relaxed mb-12">
            {PRICING.subheadline}
          </p>

          <div className="rounded-2xl border-2 border-deck-blue/30 bg-deck-card p-10 max-w-md mx-auto text-left">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-white mb-1">{PRICING.plan.name}</h3>
              <div className="text-3xl font-black text-deck-blue">{PRICING.plan.price}</div>
              <p className="text-xs text-deck-text-dim mt-1">{PRICING.plan.price_note}</p>
            </div>
            <ul className="space-y-3 mb-8">
              {PRICING.plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-deck-text">
                  <span className="text-deck-blue mt-0.5 shrink-0">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={PRICING.plan.cta.href}
              className="block w-full text-center rounded-xl bg-deck-blue px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-deck-blue/20 hover:bg-deck-blue-dim transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {PRICING.plan.cta.label} →
            </Link>
          </div>

          <p className="mt-6 text-sm text-deck-text-dim">{PRICING.model_note}</p>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────── */}
      <section className="py-24" id="faq">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
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
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(76,139,245,0.05)_1px,transparent_1px),linear-gradient(to_bottom,rgba(76,139,245,0.05)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
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
              className="inline-block rounded-xl bg-deck-blue px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-deck-blue/20 hover:bg-deck-blue-dim transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {CTA_FINAL.cta_primary.label} →
            </Link>
            <a
              href={CTA_FINAL.cta_secondary.href}
              className="text-sm font-semibold text-deck-text-dim hover:text-white transition-colors"
            >
              {CTA_FINAL.cta_secondary.label} ↓
            </a>
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

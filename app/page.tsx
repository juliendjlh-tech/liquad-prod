import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LIQUAD LANDING PAGE v4 — Conversion-Optimized (English)            ║
// ║  Based on: Strategic Launch Analysis Phases 1-6                     ║
// ║  Positioning: "Big Fish, Small Pond" — EU mid-size publishers       ║
// ║  Messaging Architecture: See, Control, Earn                         ║
// ║  Each section maps to a conversion psychology principle.            ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── HERO — Outcome-first, single clear CTA ──────────────────────────
const HERO = {
  badge: "Early Access — Limited spots",
  headline_line1: "AI bots consume your content daily.",
  headline_line2: "Start getting paid for it.",
  subheadline:
    "Liquad gives European publishers visibility into AI bot traffic, granular licensing rules, and built-in payments — in a self-serve platform you can deploy in 30 minutes.",
  cta_primary: { label: "Request Early Access", href: "/login" },
  cta_secondary: { label: "See how it works", href: "#how-it-works" },
  stats: [
    { value: "-25%", label: "Search volume decline by 2026 due to AI" },
    { value: "2.5B", label: "AI prompts processed every day" },
    { value: "<5ms", label: "SDK latency impact on your site" },
  ],
  stats_note:
    "Gartner Feb 2024 · OpenAI via TechCrunch Jul 2025 · Internal benchmark",
};

// ── PROBLEM — Three converging pain signals ─────────────────────────
const PROBLEM = {
  eyebrow: "The problem",
  stat_headline: "-25%",
  stat_desc:
    "of traditional search volume expected by 2026 as users migrate to AI chatbots and virtual agents.",
  stat_source: "Gartner, February 2024",
  stat_source_url:
    "https://www.gartner.com/en/newsroom/press-releases/2024-02-19-gartner-predicts-search-engine-volume-will-drop-25-percent-by-2026-due-to-ai-chatbots-and-other-virtual-agents",
  headline: "Three signals converging. One outcome.",
  pains: [
    {
      icon: "📉",
      stat: "-65%",
      stat_context: "ad revenue loss",
      title: "Your ad revenue is eroding",
      desc: "Fewer visits, fewer impressions, lower advertiser demand. Some publishers have already seen display revenue drops of up to 65% after their search traffic collapsed.",
      source: "AdExchanger, 2025",
      source_url:
        "https://www.adexchanger.com/publishers/the-ai-search-reckoning-is-dismantling-open-web-traffic-and-publishers-may-never-recover/",
    },
    {
      icon: "🧭",
      stat: "69%",
      stat_context: "of Google searches with zero clicks",
      title: "Your acquisition channels are broken",
      desc: "69% of Google searches generate zero clicks to any website — up from 56% a year ago. SEO, paid campaigns, newsletters: AI captures the top of funnel before you do.",
      source: "Similarweb / SE Roundtable, Jul 2025",
      source_url:
        "https://www.seroundtable.com/similarweb-google-zero-click-search-growth-39706.html",
    },
    {
      icon: "🧬",
      stat: "-43%",
      stat_context: "search traffic decline by 2029",
      title: "You're losing your audience data",
      desc: "280 media executives from 51 countries expect a 43% decline in search referrals by 2029. Without on-site traffic, your behavioral data evaporates — segmentation, personalization, retention all weaken.",
      source: "Reuters Institute Trends Report, Jan 2026",
      source_url:
        "https://reutersinstitute.politics.ox.ac.uk/journalism-media-and-technology-trends-and-predictions-2026",
    },
  ],
};

// ── REFRAME — Shift from threat to opportunity ──────────────────────
const REFRAME = {
  question:
    "What if the AI services consuming your content became your best customers?",
  context:
    "Today they access your content without asking. Tomorrow they need reliable, traceable, up-to-date sources their agents can integrate legally. The shift from free access to paid licensing is already underway. Liquad is the bridge.",
};

// ── SOLUTION — Three value pillars (from Phase 6 Message House) ─────
const SOLUTION = {
  eyebrow: "The platform",
  headline: "See. Control. Earn.",
  subheadline:
    "Liquad is the AI content licensing platform that connects your content to AI services willing to pay — on terms you define.",
  pillars: [
    {
      number: "1",
      title: "See your AI traffic",
      desc: "Know exactly which AI bots access your content, how often, and what they read most. Real-time dashboard from day one of deployment.",
      detail: "Tracks GPTBot, ClaudeBot, PerplexityBot, Google-Extended, Bytespider + custom bots",
    },
    {
      number: "2",
      title: "Set your own terms",
      desc: "Define precisely which AI services can access what content, under which conditions, and at what price. Per article, per bot, per catalog.",
      detail: "Content-level granularity — not domain-level like CDN solutions",
    },
    {
      number: "3",
      title: "Earn revenue per access",
      desc: "Built-in EUR credit system with micro-pricing. Every AI access is tracked, billed, and paid. Revenue arrives monthly with full analytics.",
      detail: "Zero double-billing — atomic PostgreSQL transactions with dedup cache",
    },
  ],
};

// ── TECHNICAL PROOF — For the CTO persona ───────────────────────────
const TECH_PROOF = {
  eyebrow: "Built for production",
  headline: "Your site stays fast. We guarantee it.",
  stats: [
    {
      value: "0.01ms",
      label: "Token verification",
      desc: "JWT verified locally using HS256 — zero network calls on the hot path",
    },
    {
      value: "3 lines",
      label: "Integration code",
      desc: "Zero-dependency Node.js middleware. npm install, add middleware, deploy",
    },
    {
      value: "5 min",
      label: "Rule cache TTL",
      desc: "Rules cached locally — no API calls for every request. Events batched async",
    },
    {
      value: "0",
      label: "Downtime risk",
      desc: "If the SDK encounters an error, it fails open. Your site is never impacted",
    },
  ],
  code_snippet: `import { liquad } from '@liquad/sdk';

app.use(liquad({
  apiKey: process.env.LIQUAD_API_KEY
}));
// That's it. Deploy.`,
};

// ── HOW IT WORKS — 3 steps ──────────────────────────────────────────
const HOW_IT_WORKS = {
  eyebrow: "How it works",
  headline: "Live in 30 minutes. Three steps.",
  steps: [
    {
      number: "01",
      title: "Connect your catalog",
      desc: "Import your content via sitemap or API. Liquad indexes and structures your knowledge base automatically — no manual entry.",
    },
    {
      number: "02",
      title: "Define your rules and pricing",
      desc: "Choose which AI services access what, under which conditions, and at what rate. One article at a time, one partner at a time, at your pace.",
    },
    {
      number: "03",
      title: "Deploy, monitor, earn",
      desc: "AI services in the network authenticate via a single API. Every access is tracked and monetized. Revenue arrives monthly with full analytics.",
    },
  ],
};

// ── EU ADVANTAGE — Positioning pillar 3 ─────────────────────────────
const EU_ADVANTAGE = {
  eyebrow: "Built for Europe",
  headline: "The only AI licensing platform designed for European publishers.",
  points: [
    {
      title: "GDPR-native by design",
      desc: "No personal data collected — only bot identifiers (user-agent strings) and URLs. No US data transfers.",
    },
    {
      title: "EU Copyright Directive aligned",
      desc: "Designed around Article 15 — publisher rights for AI content usage. Exercise your legal leverage with the right infrastructure.",
    },
    {
      title: "Deploy without legal review",
      desc: "EU-hosted infrastructure, transparent data handling, no consent complexity. Your legal team will thank you.",
    },
  ],
};

// ── MARKET PROOF — Deals already happening ──────────────────────────
const MARKET_PROOF = {
  eyebrow: "The market already exists",
  headline: "Major publishers have already negotiated.\nNow it's your turn.",
  note: "These deals were made public. Hundreds more are in negotiation.",
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
    "These publishers had legal teams and leverage. Liquad gives you the same tools — without the overhead.",
  disclaimer:
    "Sources: Press Gazette, Media and the Machine Substack (2024–2025). Liquad is not affiliated with these publishers.",
};

// ── COMPETITIVE COMPARISON — Differentiation at a glance ────────────
const COMPARISON = {
  eyebrow: "Why Liquad",
  headline: "Not a better mousetrap. A different approach.",
  competitors: [
    {
      name: "robots.txt",
      verdict: "Binary. Block or allow, no revenue.",
      limitations: ["No monetization", "No analytics", "No granularity", "Ignored by some bots"],
    },
    /**{
      name: "Enterprise solutions",
      verdict: "Built for the biggest publishers.",
      limitations: ["Enterprise sales cycles", "Usage-based pricing", "US-centric", "No self-serve"],
    },*/
    {
      name: "CDN-level tools",
      verdict: "Domain-wide. Not content-level.",
      limitations: ["Domain-level control only", "CDN lock-in required", "No content marketplace", "No credit system"],
    },
  ],
  liquad: {
    name: "Liquad",
    points: [
      "Content-level granularity (per URL, per bot, per price)",
      "Self-serve, deploy in 30 minutes",
      "Flat fee — predictable, affordable",
      "EU-native, GDPR-compliant by design",
      "Built-in EUR credit system",
      "Bidirectional marketplace",
    ],
  },
};

// ── PRICING — Clear, simple, flat fee ───────────────────────────────
const PRICING = {
  eyebrow: "Pricing",
  headline: "Flat fee. No surprises.",
  subheadline: "We don't charge per pageview or per bot. You pay a predictable monthly fee to join the network.",
  plan: {
    name: "Early Access",
    price: "Free during beta",
    price_note: "Flat monthly fee after public launch",
    features: [
      "Full dashboard & AI bot analytics",
      "Unlimited content catalog imports",
      "Granular licensing rules (per URL, per bot)",
      "Built-in EUR credit system",
      "Node.js SDK with zero dependencies",
      "EU-hosted, GDPR-compliant",
    ],
    cta: { label: "Request Early Access", href: "/login" },
  },
  model_note:
    "Our model is aligned with yours: we earn when you distribute, not before.",
};

// ── FAQ — Objection handling (from persona analysis) ────────────────
const FAQ = {
  eyebrow: "FAQ",
  headline: "Everything you want to know",
  items: [
    {
      q: "Will this affect my SEO?",
      a: "No. Liquad only manages AI bot access — Googlebot, Bingbot, and all search engine crawlers are never affected. Your organic search rankings remain fully intact.",
    },
    {
      q: "How does Liquad help me replace lost ad revenue?",
      a: "By creating a direct revenue channel independent of traffic. AI services pay to access your content through the Liquad network. The more specialized and current your content, the more it's valued. It's recurring revenue that doesn't depend on visitor volume.",
    },
    {
      q: "What is the single-API authentication?",
      a: "Instead of negotiating separate agreements with each AI service — requiring months of legal discussions — Liquad provides a shared API. AI services authenticate once and access all partner publishers according to their rules. This creates the network effect: your content becomes accessible to all partners in one deployment.",
    },
    {
      q: "Who can join the network?",
      a: "Any content publisher: media outlets, trade press, academic institutions, expert firms, professional data platforms. The selection process ensures network quality — which protects the value of your content for AI partners.",
    },
    {
      q: "When do I start generating revenue?",
      a: "As soon as your content is accessible in the network and an AI partner service accesses it. Revenue is calculated per retrieval and paid out monthly under the subscription + revenue share model.",
    },
    {
      q: "How many AI services are already connected?",
      a: "Liquad is in early access. The network is being deployed with selected partners. Joining now means being integrated first when AI service connections launch — with preferential entry conditions.",
    },
    {
      q: "What's my revenue share? How much do I actually earn?",
      a: "A significant portion of each transaction goes directly to the originating publisher. Exact terms depend on content type, access frequency, and distribution volume. We define them together during onboarding. Our model is aligned with yours — we only earn when you distribute.",
    },
    {
      q: "What if the SDK adds latency to my site?",
      a: "The SDK adds less than 5ms of latency. Token verification is done locally in 0.01ms using JWT — zero network calls on the hot path. Rules are cached locally. If anything fails, the SDK fails open — your site is never impacted.",
    },
  ],
};

// ── FINAL CTA ───────────────────────────────────────────────────────
const CTA_FINAL = {
  headline: "Every day without Liquad, your content serves AI for free.",
  subheadline:
    "Join the network. See your AI traffic. Set your terms. Start earning.",
  cta_primary: { label: "Request Early Access", href: "/login" },
  cta_secondary: { label: "See how it works", href: "#how-it-works" },
};

// ── FOOTER ──────────────────────────────────────────────────────────
const FOOTER = {
  links: [
    { label: "Platform", href: "#features" },
    { label: "How it works", href: "#how-it-works" },
    { label: "Pricing", href: "#pricing" },
    { label: "FAQ", href: "#faq" },
    { label: "Sign in", href: "/login" },
  ],
  copyright: "© 2025 Liquad. All rights reserved.",
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║                        PAGE COMPONENT                               ║
// ╚══════════════════════════════════════════════════════════════════════╝

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">

          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            {HERO.badge}
          </div>

          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl leading-[1.05]">
            <span className="block">{HERO.headline_line1}</span>
            <span className="block text-blue-600">{HERO.headline_line2}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 leading-relaxed">
            {HERO.subheadline}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={HERO.cta_primary.href}
              className="rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {HERO.cta_primary.label} →
            </Link>
            <a
              href={HERO.cta_secondary.href}
              className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition-colors"
            >
              {HERO.cta_secondary.label} ↓
            </a>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-6 border-t border-gray-100 pt-10">
            {HERO.stats.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-gray-900">{s.value}</div>
                <div className="mt-1 text-xs text-gray-500">{s.label}</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-gray-400">{HERO.stats_note}</p>
        </div>
      </section>

      {/* ─── PROBLEM ──────────────────────────────────────────────── */}
      <section className="bg-gray-950 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-8 text-center">
            {PROBLEM.eyebrow}
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-6 mb-14 max-w-3xl mx-auto">
            <div className="text-8xl font-black text-blue-400 shrink-0 leading-none">
              {PROBLEM.stat_headline}
            </div>
            <div>
              <p className="text-lg text-gray-300 leading-relaxed mb-2">
                {PROBLEM.stat_desc}
              </p>
              <a
                href={PROBLEM.stat_source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                — {PROBLEM.stat_source} ↗
              </a>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white text-center mb-10">
            {PROBLEM.headline}
          </h2>

          <div className="grid gap-6 sm:grid-cols-3">
            {PROBLEM.pains.map((pain) => (
              <div key={pain.title} className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                <div className="text-3xl mb-3">{pain.icon}</div>
                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-black text-blue-400">{pain.stat}</span>
                  <span className="text-xs text-gray-500">{pain.stat_context}</span>
                </div>
                <h3 className="font-semibold text-white mb-2">{pain.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed mb-3">{pain.desc}</p>
                <a
                  href={pain.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  — {pain.source} ↗
                </a>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── REFRAME ──────────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl lg:text-5xl leading-tight mb-8">
            {REFRAME.question}
          </h2>
          <p className="text-base text-gray-500 leading-relaxed max-w-2xl mx-auto">
            {REFRAME.context}
          </p>
        </div>
      </section>

      {/* ─── SOLUTION: 3 VALUE PILLARS ────────────────────────────── */}
      <section className="py-24 bg-gray-50" id="features">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-6">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {SOLUTION.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
              {SOLUTION.headline}
            </h2>
            <p className="mx-auto max-w-2xl text-base text-gray-500 leading-relaxed">
              {SOLUTION.subheadline}
            </p>
          </div>

          <div className="mt-14 grid gap-6 sm:grid-cols-3">
            {SOLUTION.pillars.map((pillar) => (
              <div
                key={pillar.title}
                className="rounded-2xl border border-gray-100 bg-white p-8 hover:border-blue-200 hover:shadow-sm transition-all duration-200"
              >
                <div className="flex items-center justify-center h-10 w-10 rounded-full border-2 border-blue-200 text-blue-600 font-bold text-lg mb-6">
                  {pillar.number}
                </div>
                <h3 className="text-base font-semibold text-gray-900 mb-3">{pillar.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{pillar.desc}</p>
                <p className="text-xs text-blue-600 font-medium">{pillar.detail}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TECHNICAL PROOF (CTO persona) ────────────────────────── */}
      <section className="py-24 bg-gray-950" id="tech">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
              {TECH_PROOF.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {TECH_PROOF.headline}
            </h2>
          </div>

          <div className="grid gap-8 lg:grid-cols-2 items-start">
            {/* Performance stats */}
            <div className="grid grid-cols-2 gap-4">
              {TECH_PROOF.stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
                  <div className="text-3xl font-black text-blue-400 mb-1">{stat.value}</div>
                  <div className="text-sm font-semibold text-white mb-2">{stat.label}</div>
                  <p className="text-xs text-gray-500 leading-relaxed">{stat.desc}</p>
                </div>
              ))}
            </div>

            {/* Code snippet */}
            <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-3 w-3 rounded-full bg-red-500/60" />
                <div className="h-3 w-3 rounded-full bg-yellow-500/60" />
                <div className="h-3 w-3 rounded-full bg-green-500/60" />
                <span className="ml-2 text-xs text-gray-600 font-mono">server.js</span>
              </div>
              <pre className="text-sm text-gray-300 font-mono leading-relaxed overflow-x-auto">
                <code>{TECH_PROOF.code_snippet}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS (3 steps) ───────────────────────────────── */}
      <section className="py-24 bg-white" id="how-it-works">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {HOW_IT_WORKS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {HOW_IT_WORKS.headline}
            </h2>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {HOW_IT_WORKS.steps.map((step, index) => (
              <div key={step.number} className="relative">
                {index < HOW_IT_WORKS.steps.length - 1 && (
                  <div className="hidden sm:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-blue-200 to-transparent z-0" />
                )}
                <div className="relative z-10">
                  <div className="text-6xl font-black text-blue-100 leading-none mb-4 select-none">
                    {step.number}
                  </div>
                  <h3 className="text-base font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-600 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── EU ADVANTAGE ─────────────────────────────────────────── */}
      <section className="py-24 bg-blue-50">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {EU_ADVANTAGE.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl max-w-3xl mx-auto">
              {EU_ADVANTAGE.headline}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {EU_ADVANTAGE.points.map((point) => (
              <div
                key={point.title}
                className="rounded-2xl bg-white border border-blue-100 p-8"
              >
                <h3 className="text-base font-semibold text-gray-900 mb-3">{point.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{point.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── MARKET PROOF ─────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {MARKET_PROOF.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl leading-tight whitespace-pre-line">
              {MARKET_PROOF.headline}
            </h2>
            <p className="mt-4 text-sm text-gray-500">{MARKET_PROOF.note}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-10">
            {MARKET_PROOF.deals.map((deal) => (
              <div key={deal.publisher} className="rounded-2xl border border-gray-100 bg-gray-50 p-6">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-gray-900">{deal.publisher}</div>
                    <div className="text-xs text-gray-500">x {deal.partner}</div>
                  </div>
                  <div className="text-xl font-black text-blue-600">{deal.amount}</div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{deal.detail}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <p className="text-sm font-medium text-gray-700 mb-2">{MARKET_PROOF.bottom_line}</p>
            <p className="text-xs text-gray-400">{MARKET_PROOF.disclaimer}</p>
          </div>
        </div>
      </section>

      {/* ─── COMPETITIVE COMPARISON ───────────────────────────────── */}
      <section className="py-24 bg-gray-50">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {COMPARISON.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {COMPARISON.headline}
            </h2>
          </div>

          <div className="grid gap-6 lg:grid-cols-4">
            {/* Competitor columns */}
            {COMPARISON.competitors.map((comp) => (
              <div key={comp.name} className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{comp.name}</h3>
                <p className="text-xs text-gray-500 mb-4">{comp.verdict}</p>
                <ul className="space-y-2">
                  {comp.limitations.map((lim) => (
                    <li key={lim} className="flex items-start gap-2 text-xs text-gray-500">
                      <span className="text-gray-300 mt-0.5 shrink-0">✗</span>
                      {lim}
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            {/* Liquad column — highlighted */}
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-6">
              <h3 className="font-semibold text-blue-900 mb-2">{COMPARISON.liquad.name}</h3>
              <p className="text-xs text-blue-700 mb-4">Built for your segment.</p>
              <ul className="space-y-2">
                {COMPARISON.liquad.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-xs text-blue-800">
                    <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                    {point}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ─── PRICING ──────────────────────────────────────────────── */}
      <section className="py-24 bg-white" id="pricing">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
            {PRICING.eyebrow}
          </p>
          <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
            {PRICING.headline}
          </h2>
          <p className="text-base text-gray-500 leading-relaxed mb-12">
            {PRICING.subheadline}
          </p>

          <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-10 max-w-md mx-auto text-left">
            <div className="text-center mb-6">
              <h3 className="text-lg font-bold text-gray-900 mb-1">{PRICING.plan.name}</h3>
              <div className="text-3xl font-black text-blue-600">{PRICING.plan.price}</div>
              <p className="text-xs text-gray-500 mt-1">{PRICING.plan.price_note}</p>
            </div>
            <ul className="space-y-3 mb-8">
              {PRICING.plan.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-gray-700">
                  <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                  {feature}
                </li>
              ))}
            </ul>
            <Link
              href={PRICING.plan.cta.href}
              className="block w-full text-center rounded-xl bg-blue-600 px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-blue-600/30 hover:bg-blue-700 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {PRICING.plan.cta.label} →
            </Link>
          </div>

          <p className="mt-6 text-sm text-gray-500">{PRICING.model_note}</p>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────────── */}
      <section className="py-24 bg-gray-50" id="faq">
        <div className="mx-auto max-w-3xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {FAQ.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {FAQ.headline}
            </h2>
          </div>
          <div className="space-y-4">
            {FAQ.items.map((item) => (
              <div key={item.q} className="rounded-2xl border border-gray-200 bg-white p-6">
                <h3 className="font-semibold text-gray-900 mb-2">{item.q}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-600 py-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight">
            {CTA_FINAL.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-blue-100 leading-relaxed">
            {CTA_FINAL.subheadline}
          </p>
          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={CTA_FINAL.cta_primary.href}
              className="inline-block rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-blue-600 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {CTA_FINAL.cta_primary.label} →
            </Link>
            <a
              href={CTA_FINAL.cta_secondary.href}
              className="text-sm font-semibold text-blue-200 hover:text-white transition-colors"
            >
              {CTA_FINAL.cta_secondary.label} ↓
            </a>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────────── */}
      <footer className="bg-gray-950 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-600" />
              <span className="font-semibold text-white">Liquad</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
              {FOOTER.links.map((link) => (
                <a key={link.label} href={link.href} className="hover:text-gray-300 transition-colors">
                  {link.label}
                </a>
              ))}
            </div>
            <p className="text-xs text-gray-600">{FOOTER.copyright}</p>
          </div>
        </div>
      </footer>

    </div>
  );
}

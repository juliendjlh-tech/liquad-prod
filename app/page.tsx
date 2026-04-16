import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║  LIQUAD — GENERIC HOMEPAGE                                          ║
// ║  Speaks to both personas: Publishers + AI Companies                 ║
// ║  Routes to dedicated LPs: /publishers and /ai-companies             ║
// ╚══════════════════════════════════════════════════════════════════════╝

const HERO = {
  headline_line1: "Where publishers and AI",
  headline_line2: "transact over knowledge.",
  subheadline:
    "Liquad is the AI content licensing marketplace. Publishers define the terms. AI companies get licensed access. One platform, fair for both sides.",
  cta_publishers: { label: "I'm a publisher", href: "/publishers" },
  cta_ai: { label: "I'm an AI company", href: "/ai-companies" },
};

const STATS = [
  { value: "$2.9B", label: "committed in AI content deals (2024–2025)" },
  { value: "50,000+", label: "EU publishers with no licensing solution" },
  { value: "1 API", label: "to connect publishers and AI" },
];

const TWO_SIDES = {
  eyebrow: "Two sides. One platform.",
  publisher: {
    label: "For Publishers",
    headline: "Your content has value. Start licensing it.",
    points: [
      "See which AI agents access your content",
      "Define licensing policies per catalog, per AI partner",
      "Earn revenue from every AI access",
      "Deploy in 30 minutes with a lightweight SDK",
    ],
    cta: { label: "Explore for publishers", href: "/publishers" },
    accent: "deck-blue",
  },
  ai: {
    label: "For AI Companies",
    headline: "Access licensed content your agents can trust.",
    points: [
      "Single API to access thousands of publishers",
      "Signed tokens for every content retrieval",
      "Batch URL requests — thousands in one call",
      "Full compliance: GDPR, EU Copyright Directive",
    ],
    cta: { label: "Explore for AI companies", href: "/ai-companies" },
    accent: "deck-green",
  },
};

const HOW_IT_WORKS = {
  eyebrow: "How it works",
  headline: "The AI Content Licensing Marketplace",
  steps: [
    {
      number: "01",
      title: "Publishers set the rules",
      desc: "Define which AI services can access what content, at what price. Policies are enforced automatically by a lightweight SDK.",
    },
    {
      number: "02",
      title: "AI companies get access",
      desc: "A single API call returns signed tokens for any URL in the network. No individual deals, no legal overhead.",
    },
    {
      number: "03",
      title: "Everyone gets paid",
      desc: "Every access is tracked, priced, and settled. Publishers earn revenue. AI companies get compliant, fresh knowledge.",
    },
  ],
};

const WHY_NOW = {
  eyebrow: "Why now",
  items: [
    {
      stat: "⚖️",
      title: "EU Copyright Directive",
      desc: "Article 15 gives publishers legal leverage. The regulatory framework now supports enforcement.",
    },
    {
      stat: "⚙️",
      title: "IAB CoMP v1.0",
      desc: "The industry standard for AI-publisher agreements is forming. First-movers gain credibility.",
    },
    {
      stat: "⚡",
      title: "Rise of Agentic AI",
      desc: "AI agents need authorized, real-time content — not just training crawling. New patterns demand new infrastructure.",
    },
    {
      stat: "💰",
      title: "$2.9B already committed",
      desc: "AI companies are willing to pay. But only the largest publishers have been served. The long tail is next.",
    },
  ],
};

const NETWORK = {
  headline: "A growing network that benefits both sides.",
  publisher_line:
    "More publishers join → more content available → stronger collective leverage → higher revenue per access.",
  ai_line:
    "More content in the network → richer knowledge for your agents → one integration, ever-expanding coverage.",
};

const CTA_FINAL = {
  headline: "The AI content marketplace is forming. Pick your side.",
  cta_publishers: { label: "I'm a publisher", href: "/publishers" },
  cta_ai: { label: "I'm an AI company", href: "/ai-companies" },
};

const FOOTER = {
  links: [
    { label: "For publishers", href: "/publishers" },
    { label: "For AI companies", href: "/ai-companies" },
    { label: "Sign in", href: "/login" },
  ],
  copyright: "© 2026 Liquad. All rights reserved.",
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-deck-bg">

      {/* ─── HERO ─────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(30,41,59,0.3)_1px,transparent_1px),linear-gradient(to_bottom,rgba(30,41,59,0.3)_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />
        <div className="relative mx-auto max-w-4xl px-6 pt-28 pb-20 text-center">

          <h1 className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.05]">
            <span className="block">{HERO.headline_line1}</span>
            <span className="block bg-gradient-to-r from-deck-blue to-deck-green bg-clip-text text-transparent">
              {HERO.headline_line2}
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-deck-text-dim leading-relaxed">
            {HERO.subheadline}
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={HERO.cta_publishers.href}
              className="rounded-xl bg-deck-blue px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-deck-blue/20 hover:bg-deck-blue-dim transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {HERO.cta_publishers.label} →
            </Link>
            <Link
              href={HERO.cta_ai.href}
              className="rounded-xl bg-deck-green px-8 py-3.5 text-sm font-semibold text-deck-bg shadow-lg shadow-deck-green/20 hover:bg-deck-green/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {HERO.cta_ai.label} →
            </Link>
          </div>

          <div className="mt-16 grid grid-cols-3 gap-6 border-t border-deck-border pt-10">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl font-bold text-white">{s.value}</div>
                <div className="mt-1 text-xs text-deck-text-dim">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── TWO SIDES ────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-text-dim mb-14 text-center">
            {TWO_SIDES.eyebrow}
          </p>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Publisher card */}
            <div className="rounded-2xl border border-deck-blue/30 bg-deck-card p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-4">
                {TWO_SIDES.publisher.label}
              </p>
              <h3 className="text-xl font-bold text-white mb-6">
                {TWO_SIDES.publisher.headline}
              </h3>
              <ul className="space-y-3 mb-8">
                {TWO_SIDES.publisher.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-deck-text">
                    <span className="text-deck-blue mt-0.5 shrink-0">✓</span>
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href={TWO_SIDES.publisher.cta.href}
                className="inline-block rounded-xl bg-deck-blue px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-deck-blue/20 hover:bg-deck-blue-dim transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                {TWO_SIDES.publisher.cta.label} →
              </Link>
            </div>

            {/* AI card */}
            <div className="rounded-2xl border border-deck-green/30 bg-deck-card p-8">
              <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-4">
                {TWO_SIDES.ai.label}
              </p>
              <h3 className="text-xl font-bold text-white mb-6">
                {TWO_SIDES.ai.headline}
              </h3>
              <ul className="space-y-3 mb-8">
                {TWO_SIDES.ai.points.map((point) => (
                  <li key={point} className="flex items-start gap-2 text-sm text-deck-text">
                    <span className="text-deck-green mt-0.5 shrink-0">✓</span>
                    {point}
                  </li>
                ))}
              </ul>
              <Link
                href={TWO_SIDES.ai.cta.href}
                className="inline-block rounded-xl bg-deck-green px-6 py-3 text-sm font-semibold text-deck-bg shadow-lg shadow-deck-green/20 hover:bg-deck-green/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
              >
                {TWO_SIDES.ai.cta.label} →
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ─── HOW IT WORKS ─────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-deck-text-dim mb-4">
              {HOW_IT_WORKS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl">
              {HOW_IT_WORKS.headline}
            </h2>
          </div>
          <div className="grid gap-10 sm:grid-cols-3">
            {HOW_IT_WORKS.steps.map((step) => (
              <div key={step.number} className="relative">
                <div className="text-5xl font-black text-deck-border leading-none mb-3 select-none">
                  {step.number}
                </div>
                <h3 className="text-base font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── WHY NOW ──────────────────────────────────────────────── */}
      <section className="py-24">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-deck-text-dim mb-14 text-center">
            {WHY_NOW.eyebrow}
          </p>
          <div className="grid gap-6 sm:grid-cols-2">
            {WHY_NOW.items.map((item) => (
              <div key={item.title} className="rounded-2xl border border-deck-border bg-deck-card p-6">
                <div className="text-2xl mb-3">{item.stat}</div>
                <h3 className="font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-sm text-deck-text-dim leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NETWORK ──────────────────────────────────────────────── */}
      <section className="py-16 border-y border-deck-border">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-2xl font-bold text-white sm:text-3xl leading-tight mb-6">
            {NETWORK.headline}
          </h2>
          <div className="grid gap-6 sm:grid-cols-2 text-left">
            <div className="rounded-xl border border-deck-blue/20 bg-deck-blue/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-deck-blue mb-2">Publishers</p>
              <p className="text-sm text-deck-text-dim leading-relaxed">{NETWORK.publisher_line}</p>
            </div>
            <div className="rounded-xl border border-deck-green/20 bg-deck-green/5 p-5">
              <p className="text-xs font-semibold uppercase tracking-widest text-deck-green mb-2">AI Companies</p>
              <p className="text-sm text-deck-text-dim leading-relaxed">{NETWORK.ai_line}</p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FINAL CTA ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden py-24">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(76,139,245,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(34,197,94,0.03)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight mb-10">
            {CTA_FINAL.headline}
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <Link
              href={CTA_FINAL.cta_publishers.href}
              className="rounded-xl bg-deck-blue px-8 py-3.5 text-sm font-semibold text-white shadow-lg shadow-deck-blue/20 hover:bg-deck-blue-dim transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {CTA_FINAL.cta_publishers.label} →
            </Link>
            <Link
              href={CTA_FINAL.cta_ai.href}
              className="rounded-xl bg-deck-green px-8 py-3.5 text-sm font-semibold text-deck-bg shadow-lg shadow-deck-green/20 hover:bg-deck-green/90 transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {CTA_FINAL.cta_ai.label} →
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

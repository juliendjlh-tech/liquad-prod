import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════╗
// ║           CONTENU DE LA HOMEPAGE — MODIFIABLE ICI           ║
// ║  Pas besoin de connaissances techniques pour éditer ce bloc  ║
// ╚══════════════════════════════════════════════════════════════╝

// ── SECTION HERO ──────────────────────────────────────────────
const HERO = {
  badge: "Accès anticipé ouvert",
  headline_line1: "Votre contenu entraîne les IA.",
  headline_line2: "Il est temps d'être rémunéré.",
  subheadline:
    "Liquad permet aux éditeurs de surveiller, contrôler et monétiser l'accès de leurs contenus par les bots IA — sans modifier une seule ligne de code existante.",
  cta_primary: { label: "Commencer gratuitement", href: "/login" },
  cta_secondary: { label: "Voir comment ça marche", href: "#how-it-works" },
  stats: [
    { value: "< 5 min", label: "Temps d'intégration" },
    { value: "0 ligne", label: "De code à modifier*" },
    { value: "100%", label: "Compatible tout stack" },
  ],
  stats_note: "* Via l'intégration Cloudflare Worker",
};

// ── SECTION PROBLÈME ──────────────────────────────────────────
const PROBLEM = {
  eyebrow: "Le problème",
  headline: "Les IA scrapent votre contenu. Vous n'en voyez rien.",
  body: "GPTBot, ClaudeBot et des dizaines d'autres crawlers accèdent à vos articles, données et créations chaque jour, à grande échelle. Ils s'en servent pour entraîner des modèles qui valent des milliards. Vous n'avez aucune visibilité, aucun contrôle — et aucune compensation.",
};

// ── SECTION FONCTIONNALITÉS ────────────────────────────────────
const FEATURES = {
  eyebrow: "Ce que fait Liquad",
  headline: "Visibilité totale et contrôle sur l'accès IA",
  items: [
    {
      icon: "👁",
      title: "Voyez tout ce qui se passe",
      desc: "Identifiez en temps réel quels bots IA accèdent à votre contenu, quelles pages, et à quelle fréquence. Fini l'angle mort.",
    },
    {
      icon: "🎛",
      title: "Définissez vos règles",
      desc: "Autorisez ou bloquez chaque bot sur des patterns d'URL précis. Un contrôle granulaire, par contenu, par bot, par contexte.",
    },
    {
      icon: "💰",
      title: "Monétisez chaque accès",
      desc: "Créez des catalogues tarifaires par type de contenu. Fixez votre prix par accès et commencez à générer des revenus directs.",
    },
  ],
};

// ── SECTION COMMENT ÇA MARCHE ──────────────────────────────────
const HOW_IT_WORKS = {
  eyebrow: "Comment ça marche",
  headline: "Opérationnel en 4 étapes",
  steps: [
    {
      number: "01",
      title: "Importez votre contenu",
      desc: "Collez l'URL de votre sitemap.xml. Liquad indexe automatiquement toutes vos URLs — aucune saisie manuelle.",
    },
    {
      number: "02",
      title: "Déclarez les bots IA",
      desc: "Choisissez les crawlers à surveiller : GPTBot, ClaudeBot, Gemini, ou ajoutez vos propres user-agents.",
    },
    {
      number: "03",
      title: "Créez vos catalogues",
      desc: "Regroupez vos contenus par pattern d'URL. Définissez quel bot peut accéder à quoi, et à quel prix.",
    },
    {
      number: "04",
      title: "Déployez en 5 minutes",
      desc: "Ajoutez un Cloudflare Worker. Aucune modification de votre site. Vous êtes en ligne immédiatement.",
    },
  ],
};

// ── SECTION INTÉGRATION ────────────────────────────────────────
const INTEGRATION = {
  eyebrow: "Intégration simple",
  headline_line1: "Pas de modification de code.",
  headline_line2: "Un déploiement en 5 minutes.",
  desc: "Utilisez l'intégration Cloudflare Worker — compatible avec tout stack, tout framework. Ou optez pour le SDK Node.js avec 3 lignes si vous préférez.",
  option_worker: "Recommandé — Cloudflare Worker",
  option_sdk: "Alternative — SDK Node.js",
};

// ── SECTION FAQ ────────────────────────────────────────────────
const FAQ = {
  eyebrow: "Questions fréquentes",
  headline: "Tout ce que vous voulez savoir",
  items: [
    {
      q: "Est-ce que ça impacte mes utilisateurs ou mon SEO ?",
      a: "Non. Liquad n'intercepte que les requêtes des bots IA, jamais celles de vos vrais utilisateurs ni des crawlers SEO (Googlebot, etc.). Votre référencement est totalement préservé.",
    },
    {
      q: "Que se passe-t-il si un bot refuse de payer ?",
      a: "Vous pouvez bloquer totalement l'accès à tout bot qui n'est pas conforme à vos règles. Le contrôle vous appartient entièrement.",
    },
    {
      q: "Combien de temps prend l'intégration ?",
      a: "La plupart des éditeurs sont en ligne en moins de 5 minutes via le Cloudflare Worker. Aucune modification de votre infrastructure existante.",
    },
    {
      q: "Quels bots IA sont supportés ?",
      a: "Liquad inclut des presets pour GPTBot (OpenAI), ClaudeBot (Anthropic), Google Extended, et plus encore. Vous pouvez aussi ajouter n'importe quel user-agent personnalisé.",
    },
  ],
};

// ── SECTION CTA FINAL ──────────────────────────────────────────
const CTA_FINAL = {
  headline: "Prenez le contrôle de votre contenu.",
  subheadline:
    "Rejoignez les éditeurs qui suivent et monétisent l'accès IA dès aujourd'hui. Gratuit pour commencer.",
  cta: { label: "Commencer gratuitement", href: "/login" },
};

// ── FOOTER ────────────────────────────────────────────────────
const FOOTER = {
  links: [
    { label: "Fonctionnalités", href: "#features" },
    { label: "Comment ça marche", href: "#how-it-works" },
    { label: "FAQ", href: "#faq" },
    { label: "Se connecter", href: "/login" },
  ],
  copyright: "© 2025 Liquad. Tous droits réservés.",
};

// ╔══════════════════════════════════════════════════════════════╗
// ║              COMPOSANT PAGE — Ne pas modifier               ║
// ╚══════════════════════════════════════════════════════════════╝

export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* ─── HERO ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-white">
        {/* Fond grille subtil */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#f0f0f0_1px,transparent_1px),linear-gradient(to_bottom,#f0f0f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,#000_70%,transparent_110%)]" />

        <div className="relative mx-auto max-w-4xl px-6 pt-24 pb-20 text-center">

          {/* Badge */}
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-xs font-semibold text-blue-700 mb-8">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            {HERO.badge}
          </div>

          {/* Titre */}
          <h1 className="text-5xl font-extrabold tracking-tight text-gray-900 sm:text-6xl lg:text-7xl leading-[1.05]">
            <span className="block">{HERO.headline_line1}</span>
            <span className="block text-blue-600">{HERO.headline_line2}</span>
          </h1>

          {/* Sous-titre */}
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-500 leading-relaxed">
            {HERO.subheadline}
          </p>

          {/* Boutons */}
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

          {/* Stats */}
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

      {/* ─── PROBLÈME ────────────────────────────────────────── */}
      <section className="bg-gray-950 py-20">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
            {PROBLEM.eyebrow}
          </p>
          <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight">
            {PROBLEM.headline}
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-base text-gray-400 leading-relaxed">
            {PROBLEM.body}
          </p>
        </div>
      </section>

      {/* ─── FONCTIONNALITÉS ──────────────────────────────────── */}
      <section className="py-24 bg-white" id="features">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {FEATURES.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {FEATURES.headline}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-3">
            {FEATURES.items.map((item) => (
              <div
                key={item.title}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-8 hover:border-blue-200 hover:bg-blue-50/30 transition-all duration-200"
              >
                <div className="text-4xl mb-5">{item.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMMENT ÇA MARCHE ────────────────────────────────── */}
      <section className="py-24 bg-gray-50" id="how-it-works">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {HOW_IT_WORKS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {HOW_IT_WORKS.headline}
            </h2>
          </div>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
            {HOW_IT_WORKS.steps.map((step, index) => (
              <div key={step.number} className="relative">
                {/* Connecteur entre étapes */}
                {index < HOW_IT_WORKS.steps.length - 1 && (
                  <div className="hidden lg:block absolute top-6 left-full w-full h-px bg-gradient-to-r from-blue-200 to-transparent z-0" />
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

      {/* ─── INTÉGRATION ──────────────────────────────────────── */}
      <section className="py-24 bg-white" id="integration">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 items-center">

            {/* Texte */}
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
                {INTEGRATION.eyebrow}
              </p>
              <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl leading-tight">
                {INTEGRATION.headline_line1}
                <br />
                <span className="text-blue-600">{INTEGRATION.headline_line2}</span>
              </h2>
              <p className="mt-6 text-base text-gray-600 leading-relaxed">
                {INTEGRATION.desc}
              </p>
              <Link
                href="/login"
                className="inline-block mt-8 rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
              >
                Commencer gratuitement →
              </Link>
            </div>

            {/* Blocs de code */}
            <div className="space-y-4">
              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-green-700 bg-green-50 border border-green-200 rounded-full px-3 py-1 mb-3">
                  ✓ {INTEGRATION.option_worker}
                </div>
                <div className="rounded-2xl bg-gray-950 p-6 font-mono text-sm overflow-x-auto">
                  <div className="text-gray-500 text-xs mb-3"># wrangler.toml</div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">name</span>
                    <span className="text-gray-500"> = </span>
                    <span className="text-green-400">"liquad-proxy"</span>
                  </div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">main</span>
                    <span className="text-gray-500"> = </span>
                    <span className="text-green-400">"worker.js"</span>
                  </div>
                  <div className="mt-4 text-gray-500 text-xs"># Déployez en une commande :</div>
                  <div className="text-yellow-400 mt-1">$ wrangler deploy</div>
                </div>
              </div>

              <div>
                <div className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 bg-gray-50 border border-gray-200 rounded-full px-3 py-1 mb-3">
                  {INTEGRATION.option_sdk}
                </div>
                <div className="rounded-2xl bg-gray-950 p-6 font-mono text-sm overflow-x-auto">
                  <div className="text-gray-500 text-xs mb-3">// 3 lignes. C&apos;est tout.</div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">import</span>
                    <span className="text-gray-300"> {"{ Liquad }"} </span>
                    <span className="text-blue-400">from</span>
                    <span className="text-green-400"> &quot;@liquad/sdk&quot;</span>
                  </div>
                  <div className="text-gray-300 mt-1">
                    <span className="text-purple-400">const</span>
                    <span className="text-gray-300"> liquad = </span>
                    <span className="text-yellow-400">new Liquad</span>
                    <span className="text-gray-300">{"({ apiKey })"}</span>
                  </div>
                  <div className="text-gray-300 mt-1">
                    <span className="text-gray-400">app.</span>
                    <span className="text-yellow-400">use</span>
                    <span className="text-gray-300">{"("}</span>
                    <span className="text-yellow-400">liquad.middleware</span>
                    <span className="text-gray-300">{"())"}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ──────────────────────────────────────────────── */}
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

      {/* ─── CTA FINAL ────────────────────────────────────────── */}
      <section className="bg-blue-600 py-24">
        <div className="mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight">
            {CTA_FINAL.headline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-blue-100 leading-relaxed">
            {CTA_FINAL.subheadline}
          </p>
          <div className="mt-10">
            <Link
              href={CTA_FINAL.cta.href}
              className="inline-block rounded-xl bg-white px-8 py-3.5 text-sm font-semibold text-blue-600 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 active:translate-y-0"
            >
              {CTA_FINAL.cta.label} →
            </Link>
          </div>
        </div>
      </section>

      {/* ─── FOOTER ───────────────────────────────────────────── */}
      <footer className="bg-gray-950 py-12">
        <div className="mx-auto max-w-7xl px-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6">
            {/* Logo */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-7 rounded-lg bg-blue-600" />
              <span className="font-semibold text-white">Liquad</span>
            </div>

            {/* Liens */}
            <div className="flex items-center gap-6 text-sm text-gray-500">
              {FOOTER.links.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  className="hover:text-gray-300 transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>

            {/* Copyright */}
            <p className="text-xs text-gray-600">{FOOTER.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

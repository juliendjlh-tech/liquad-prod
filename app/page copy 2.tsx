import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║           CONTENU DE LA HOMEPAGE — MODIFIABLE ICI                   ║
// ║  Pas besoin de connaissances techniques pour éditer ces blocs.      ║
// ║  Chaque section est clairement délimitée et commentée.              ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── SECTION HERO ──────────────────────────────────────────────────────
const HERO = {
  badge: "Accès anticipé — places limitées",
  headline_line1: "Votre contenu vaut des milliards.",
  headline_line2: "Vous n'en voyez pas un centime.",
  subheadline:
    "Les IA scrapent vos articles des milliers de fois par mois pour entraîner leurs modèles. Liquad vous donne la visibilité, le contrôle et les outils pour enfin en tirer des revenus — sans toucher à votre code.",
  cta_primary: { label: "Commencer gratuitement", href: "/login" },
  cta_secondary: { label: "Voir comment ça marche", href: "#how-it-works" },
  // Stats affichées sous le hero — modifiez valeurs et libellés librement
  stats: [
    { value: "< 5 min", label: "Pour être opérationnel" },
    { value: "0 ligne", label: "De code à modifier*" },
    { value: "8 692×", label: "Plus de crawls que de clics†" },
  ],
  stats_note:
    "* Via Cloudflare Worker  †Source : Cloudflare, ratio ClaudeBot crawl/referral",
};

// ── SECTION ALERTE MARCHÉ (chiffres réels, sources vérifiées) ─────────
// Modifiez les chiffres si des sources plus récentes sont disponibles.
const MARKET_ALERT = {
  eyebrow: "Ce qui se passe en ce moment sur votre site",
  headline: "Pendant que vous lisez ces lignes,\ndes bots IA pillent votre contenu.",
  stats: [
    {
      value: "7×",
      label: "Les éditeurs sont 7 fois plus ciblés par les crawlers IA que la moyenne.",
      source: "Cloudflare, 2025",
      source_url: "https://blog.cloudflare.com/ai-crawler-traffic-by-purpose-and-industry/",
    },
    {
      value: "79%",
      label: "Des accès IA servent à entraîner des modèles — pas à vous envoyer du trafic.",
      source: "Cloudflare, juillet 2025",
      source_url: "https://blog.cloudflare.com/crawlers-click-ai-bots-training/",
    },
    {
      value: "+40%",
      label: "De scraping non autorisé entre le T3 et le T4 2024, malgré les blocages.",
      source: "Streaming Learning Center, 2024",
      source_url: "https://streaminglearningcenter.com/learning/ai-scraping-and-publisher-revenue-the-great-content-robbery.html",
    },
  ],
  body: "GPTBot (OpenAI), ClaudeBot (Anthropic), PerplexityBot… Chacun accède à vos pages des centaines de milliers de fois par mois. En échange : zéro référencement, zéro compensation. Le seul marché qui émerge — celui de la licence IA — vous passe sous le nez.",
};

// ── SECTION PREUVE MARCHÉ ─────────────────────────────────────────────
// Montre que les grandes maisons ont déjà négocié — le marché existe.
const MARKET_PROOF = {
  eyebrow: "Le marché de la licence IA existe déjà",
  headline: "Les grands éditeurs ont déjà négocié. Et vous ?",
  note: "Les deals suivants ont été rendus publics. Des centaines d'autres sont en cours de négociation.",
  deals: [
    {
      publisher: "News Corp",
      partner: "OpenAI",
      amount: "250 M$",
      detail: "sur 5 ans (Wall Street Journal, NY Post, MarketWatch)",
    },
    {
      publisher: "Reuters",
      partner: "Meta",
      amount: "65 M$",
      detail: "pour l'accès à l'archive Reuters",
    },
    {
      publisher: "Axel Springer",
      partner: "OpenAI",
      amount: "50 M$",
      detail: "Bild, Politico, Business Insider",
    },
  ],
  cta_label: "Ne laissez pas votre contenu hors de ces négociations →",
  disclaimer:
    "Sources : Press Gazette, Media and the Machine Substack (2024–2025). Liquad n'est pas affilié à ces éditeurs.",
};

// ── SECTION FONCTIONNALITÉS (les 3 piliers de la valeur) ──────────────
const FEATURES = {
  eyebrow: "La plateforme",
  headline: "Tout ce qu'il vous faut pour reprendre la main",
  items: [
    {
      icon: "👁",
      tag: "Visibilité",
      title: "Sachez exactement ce qui se passe",
      desc: "Identifiez en temps réel quels bots IA accèdent à votre contenu, sur quelles URL, à quelle fréquence. Un tableau de bord clair, sans jargon technique.",
      detail: "GPTBot, ClaudeBot, Gemini, Perplexity — et tous les crawlers non identifiés.",
    },
    {
      icon: "🎛",
      tag: "Contrôle",
      title: "Vos règles. Votre contenu.",
      desc: "Autorisez ou bloquez chaque bot sur des patterns d'URL précis. Un contenu premium ? Réservez-le aux bots qui ont signé. Un article gratuit ? Laissez-le accessible.",
      detail: "Contrôle granulaire par bot, par URL, par catalogue — sans toucher à votre infrastructure.",
    },
    {
      icon: "💰",
      tag: "Monétisation",
      title: "Transformez chaque accès en revenu",
      desc: "Créez des catalogues tarifaires par type de contenu. Définissez vos prix par accès. Entrez enfin dans la négociation avec les labs IA avec des données concrètes.",
      detail: "Le premier pas vers un deal de licensing commence par prouver la valeur de votre contenu.",
    },
  ],
};

// ── SECTION DIFFÉRENCIANTS (pourquoi Liquad, pas les alternatives) ────
const DIFFERENTIATORS = {
  eyebrow: "Pourquoi Liquad",
  headline: "Ce que vous ne trouverez pas ailleurs",
  items: [
    {
      icon: "⚡",
      title: "Déployez en 5 minutes, pas en 5 semaines",
      desc: "Contrairement aux solutions enterprise qui nécessitent des mois d'intégration, Liquad se déploie via un Cloudflare Worker. Aucune modification de votre CMS, de votre CDN, de votre stack.",
    },
    {
      icon: "📊",
      title: "Des données pour négocier, pas juste pour surveiller",
      desc: "Nos concurrents vous disent 'vous êtes scrapé'. Nous vous donnons les métriques exactes — volume, fréquence, valeur estimée — pour entrer dans une négociation de licensing avec les bras chargés de preuves.",
    },
    {
      icon: "🔒",
      title: "SEO préservé à 100%",
      desc: "Liquad intercepte uniquement les bots IA déclarés. Googlebot, Bingbot et tous les crawlers SEO ne sont jamais touchés. Votre référencement naturel est totalement protégé.",
    },
    {
      icon: "🔓",
      title: "Pas de lock-in, pas de frais cachés",
      desc: "Gratuit pour commencer. API ouverte. Exportez vos données à tout moment. Nous gagnons quand vous gagnez — pas avant.",
    },
  ],
};

// ── SECTION COMMENT ÇA MARCHE ─────────────────────────────────────────
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
      desc: "Choisissez les crawlers à surveiller : GPTBot, ClaudeBot, Gemini, Perplexity — ou ajoutez vos propres user-agents.",
    },
    {
      number: "03",
      title: "Créez vos catalogues",
      desc: "Regroupez vos contenus par pattern d'URL. Définissez qui peut accéder à quoi, et à quel prix.",
    },
    {
      number: "04",
      title: "Déployez en 5 minutes",
      desc: "Ajoutez un Cloudflare Worker. Aucune modification de votre site. Vous êtes en ligne immédiatement.",
    },
  ],
};

// ── SECTION INTÉGRATION ───────────────────────────────────────────────
const INTEGRATION = {
  eyebrow: "Intégration technique",
  headline_line1: "Zéro modification de votre stack.",
  headline_line2: "Un déploiement en une commande.",
  desc: "L'intégration Cloudflare Worker s'installe devant votre site existant — compatible avec tout framework, tout CMS, tout CDN. Ou optez pour le SDK Node.js en 3 lignes si vous préférez.",
  option_worker: "Recommandé — Cloudflare Worker",
  option_sdk: "Alternative — SDK Node.js",
};

// ── SECTION FAQ ───────────────────────────────────────────────────────
const FAQ = {
  eyebrow: "Questions fréquentes",
  headline: "Tout ce que vous voulez savoir",
  items: [
    {
      q: "Est-ce que ça impacte mon SEO ou mes vrais utilisateurs ?",
      a: "Non. Liquad n'intercepte que les requêtes des bots IA déclarés — jamais vos visiteurs humains ni Googlebot, Bingbot ou les crawlers SEO. Votre référencement naturel est totalement préservé.",
    },
    {
      q: "Que se passe-t-il si un bot refuse de payer ou de s'identifier ?",
      a: "Vous décidez : accès libre, accès bloqué (403), ou réponse personnalisée. Le contrôle vous appartient entièrement, contenu par contenu, bot par bot.",
    },
    {
      q: "Comment ça m'aide à négocier un deal de licensing ?",
      a: "Les données Liquad vous donnent le volume exact d'accès par bot, les pages les plus crawlées, et la fréquence — autant d'arguments concrets pour initier une discussion avec OpenAI, Anthropic ou Google et fixer un prix justifié.",
    },
    {
      q: "Quels bots IA sont supportés ?",
      a: "GPTBot (OpenAI), ClaudeBot (Anthropic), Google Extended, PerplexityBot, et des dizaines d'autres presets. Vous pouvez aussi ajouter n'importe quel user-agent personnalisé.",
    },
    {
      q: "C'est adapté à ma taille d'éditeur ?",
      a: "Oui. Que vous soyez un blog à 10 000 visiteurs/mois ou un groupe de presse à plusieurs millions, Liquad s'adapte. Commencez gratuitement et montez en charge à votre rythme.",
    },
  ],
};

// ── SECTION CTA FINAL ─────────────────────────────────────────────────
const CTA_FINAL = {
  headline: "Chaque jour sans Liquad,\nvous perdez de la valeur.",
  subheadline:
    "Vos contenus sont déjà en train d'être scrapés. La seule question est : est-ce que vous en tirez quelque chose ? Rejoignez les éditeurs qui reprennent la main.",
  cta_primary: { label: "Commencer gratuitement", href: "/login" },
  cta_secondary: { label: "Voir la démo", href: "#how-it-works" },
};

// ── FOOTER ────────────────────────────────────────────────────────────
const FOOTER = {
  links: [
    { label: "Fonctionnalités", href: "#features" },
    { label: "Comment ça marche", href: "#how-it-works" },
    { label: "FAQ", href: "#faq" },
    { label: "Se connecter", href: "/login" },
  ],
  copyright: "© 2025 Liquad. Tous droits réservés.",
};

// ╔══════════════════════════════════════════════════════════════════════╗
// ║              COMPOSANT PAGE — Ne pas modifier en dessous            ║
// ╚══════════════════════════════════════════════════════════════════════╝

export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* ─── HERO ─────────────────────────────────────────────────── */}
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

      {/* ─── ALERTE MARCHÉ ────────────────────────────────────────── */}
      <section className="bg-gray-950 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <div className="text-center mb-14">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-4">
              {MARKET_ALERT.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight whitespace-pre-line">
              {MARKET_ALERT.headline}
            </h2>
          </div>

          {/* Statistiques choc */}
          <div className="grid gap-6 sm:grid-cols-3 mb-12">
            {MARKET_ALERT.stats.map((stat) => (
              <div
                key={stat.value}
                className="rounded-2xl border border-gray-800 bg-gray-900 p-6"
              >
                <div className="text-4xl font-black text-blue-400 mb-3">{stat.value}</div>
                <p className="text-sm text-gray-300 leading-relaxed mb-3">{stat.label}</p>
                <a
                  href={stat.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
                >
                  — {stat.source} ↗
                </a>
              </div>
            ))}
          </div>

          <p className="mx-auto max-w-2xl text-base text-gray-400 leading-relaxed text-center">
            {MARKET_ALERT.body}
          </p>
        </div>
      </section>

      {/* ─── PREUVE MARCHÉ ────────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-4xl px-6">
          <div className="text-center mb-12">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {MARKET_PROOF.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl leading-tight">
              {MARKET_PROOF.headline}
            </h2>
            <p className="mt-4 text-sm text-gray-500">{MARKET_PROOF.note}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-10">
            {MARKET_PROOF.deals.map((deal) => (
              <div
                key={deal.publisher}
                className="rounded-2xl border border-gray-100 bg-gray-50 p-6"
              >
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="font-bold text-gray-900">{deal.publisher}</div>
                    <div className="text-xs text-gray-500">× {deal.partner}</div>
                  </div>
                  <div className="text-xl font-black text-blue-600">{deal.amount}</div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{deal.detail}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link
              href="/login"
              className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              {MARKET_PROOF.cta_label}
            </Link>
            <p className="mt-4 text-xs text-gray-400">{MARKET_PROOF.disclaimer}</p>
          </div>
        </div>
      </section>

      {/* ─── FONCTIONNALITÉS ──────────────────────────────────────── */}
      <section className="py-24 bg-gray-50" id="features">
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
                className="rounded-2xl border border-gray-100 bg-white p-8 hover:border-blue-200 hover:shadow-sm transition-all duration-200"
              >
                <div className="inline-flex items-center gap-2 rounded-full bg-blue-50 border border-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 mb-5">
                  {item.icon} {item.tag}
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">{item.title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed mb-4">{item.desc}</p>
                <p className="text-xs text-gray-400 border-t border-gray-100 pt-4 leading-relaxed">
                  {item.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── DIFFÉRENCIANTS ───────────────────────────────────────── */}
      <section className="py-24 bg-white">
        <div className="mx-auto max-w-7xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {DIFFERENTIATORS.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl">
              {DIFFERENTIATORS.headline}
            </h2>
          </div>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {DIFFERENTIATORS.items.map((item) => (
              <div key={item.title} className="rounded-2xl border border-gray-100 bg-gray-50 p-6 hover:border-blue-200 transition-all duration-200">
                <div className="text-3xl mb-4">{item.icon}</div>
                <h3 className="text-sm font-semibold text-gray-900 mb-2 leading-snug">{item.title}</h3>
                <p className="text-xs text-gray-600 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── COMMENT ÇA MARCHE ────────────────────────────────────── */}
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

      {/* ─── INTÉGRATION ──────────────────────────────────────────── */}
      <section className="py-24 bg-white" id="integration">
        <div className="mx-auto max-w-7xl px-6">
          <div className="grid gap-16 lg:grid-cols-2 items-center">
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
                    <span className="text-green-400">&quot;liquad-proxy&quot;</span>
                  </div>
                  <div className="text-gray-300">
                    <span className="text-blue-400">main</span>
                    <span className="text-gray-500"> = </span>
                    <span className="text-green-400">&quot;worker.js&quot;</span>
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

      {/* ─── CTA FINAL ────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-blue-600 py-24">
        {/* Fond texturé */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3rem_3rem]" />
        <div className="relative mx-auto max-w-3xl px-6 text-center">
          <h2 className="text-3xl font-bold text-white sm:text-4xl leading-tight whitespace-pre-line">
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
            <p className="text-xs text-gray-600">{FOOTER.copyright}</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

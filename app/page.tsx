import Link from "next/link";

// ╔══════════════════════════════════════════════════════════════════════╗
// ║           CONTENU DE LA HOMEPAGE — MODIFIABLE ICI                   ║
// ║  Pas besoin de connaissances techniques pour éditer ces blocs.      ║
// ║  Chaque section est clairement délimitée et commentée.              ║
// ╚══════════════════════════════════════════════════════════════════════╝

// ── SECTION HERO ──────────────────────────────────────────────────────
const HERO = {
  badge: "Accès anticipé — places limitées",
  // OUTCOME-FIRST : ce que le visiteur obtient, pas ce qu'il perd
  headline_line1: "Votre contenu alimente des milliards de requêtes IA.",
  headline_line2: "Transformez chaque accès en revenu récurrent.",
  subheadline:
    "Liquad connecte votre expertise aux services IA qui acceptent de la rémunérer. Visibilité sur chaque accès. Contrôle sur chaque règle. Revenus sur chaque intégration.",
  cta_primary: { label: "Demander l'accès", href: "/login" },
  cta_secondary: { label: "Voir comment ça marche", href: "#how-it-works" },
  // Stats — chiffres vérifiés, sources indiquées dans stats_note
  stats: [
    { value: "-33%", label: "De trafic Search chez les éditeurs en 2025*" },
    { value: "2,5 Mrd", label: "Requêtes IA traitées chaque jour†" },
    { value: "1 API", label: "Pour accéder à tous les services IA du réseau" },
  ],
  stats_note:
    "* Chartbeat / Reuters Institute Trends Report, janv. 2026  †OpenAI via TechCrunch, juil. 2025",
};

// ── SECTION URGENCE : CE QUI ARRIVE À VOTRE MODÈLE ÉCONOMIQUE ─────────
// Chiffres vérifiés — sources indiquées sur chaque stat
const PUBLISHER_IMPACT = {
  eyebrow: "Ce qui arrive à votre modèle économique",
  // Stat principale — source : Gartner, fév. 2024
  stat_headline: "-25%",
  stat_desc:
    "de volume de recherche traditionnelle attendu d'ici 2026, à mesure que les utilisateurs migrent vers les agents IA et les assistants conversationnels.",
  stat_source: "Gartner, février 2024",
  stat_source_url:
    "https://www.gartner.com/en/newsroom/press-releases/2024-02-19-gartner-predicts-search-engine-volume-will-drop-25-percent-by-2026-due-to-ai-chatbots-and-other-virtual-agents",
  headline: "Trois signaux qui convergent. Une seule issue.",
  pains: [
    {
      icon: "📉",
      // Stat : AdExchanger 2025 / DCN study Digiday août 2025
      stat: "-65%",
      stat_context: "de revenus publicitaires",
      title: "Vos revenus publicitaires s'érodent",
      desc: "Moins de visites, moins d'impressions, moins de demande annonceurs. Certains éditeurs ont déjà enregistré des baisses de revenus display allant jusqu'à 65% après l'effondrement de leur trafic Search.",
      source: "AdExchanger, 2025",
      source_url:
        "https://www.adexchanger.com/publishers/the-ai-search-reckoning-is-dismantling-open-web-traffic-and-publishers-may-never-recover/",
    },
    {
      icon: "🧭",
      // Stat : Similarweb via SE Roundtable, juil. 2025
      stat: "69%",
      stat_context: "des recherches Google sans clic",
      title: "Vos leviers d'acquisition ne fonctionnent plus",
      desc: "69% des recherches Google ne génèrent plus aucun clic vers un site — contre 56% il y a un an. SEO, campagnes payantes, newsletters : l'IA capte le haut du funnel avant vous.",
      source: "Similarweb / SE Roundtable, juil. 2025",
      source_url:
        "https://www.seroundtable.com/similarweb-google-zero-click-search-growth-39706.html",
    },
    {
      icon: "🧬",
      // Stat : Reuters Institute Trends Report 2026, janv. 2026 — 280 dirigeants médias, 51 pays
      stat: "-43%",
      stat_context: "de trafic Search attendu d'ici 2029",
      title: "Vous perdez vos données audience",
      desc: "280 dirigeants médias issus de 51 pays anticipent une chute de 43% des référencements Search d'ici 2029. Sans trafic on-site, vos données comportementales s'évaporent. Segmentation, personnalisation, rétention : tout s'affaiblit.",
      source: "Reuters Institute Trends Report, janv. 2026",
      source_url:
        "https://reutersinstitute.politics.ox.ac.uk/journalism-media-and-technology-trends-and-predictions-2026",
    },
  ],
};

// ── SECTION REFRAME ────────────────────────────────────────────────────
const REFRAME = {
  question:
    "Et si les services IA qui consomment votre contenu devenaient vos meilleurs clients ?",
  context:
    "Aujourd'hui ils accèdent à vos contenus sans vous demander. Demain, ils ont besoin de sources fiables, traçables, à jour — que leurs agents peuvent intégrer légalement. Ce passage de l'accès gratuit à la licence rémunérée est déjà en cours. Liquad en est le pont.",
};

// ── SECTION SOLUTION : LES 3 PILIERS ──────────────────────────────────
const SOLUTION = {
  eyebrow: "La plateforme",
  headline: "Le pont entre votre expertise et les milliards de requêtes IA.",
  subheadline:
    "Liquad est la plateforme qui connecte votre contenu aux services IA qui acceptent de le rémunérer — avec les règles que vous définissez.",
  pillars: [
    {
      number: "1",
      title: "Vos règles d'accès. Votre contenu.",
      desc: "Définissez précisément quels services IA peuvent accéder à quoi, dans quelles conditions et à quel prix. Bloquez l'extraction non autorisée. Ouvrez la porte aux partenaires licenciés — un contenu à la fois.",
    },
    {
      number: "2",
      title: "Votre contenu, prêt à être intégré par les IA",
      desc: "Nous structurons votre base de contenus pour qu'elle soit directement utilisable dans les workflows IA : recherche sémantique, RAG, agents autonomes. Chaque accès est tracé, sourcé et attribué à votre marque.",
    },
    {
      number: "3",
      title: "Un moteur de revenus et d'intelligence",
      desc: "Statistiques d'utilisation en temps réel, recommandations de prix selon les benchmarks du marché, signaux de demande par thématique. Adaptez votre stratégie de contenu à l'ère IA — et maximisez chaque distribution.",
    },
  ],
};

// ── SECTION NETWORK EFFECT + MODÈLE ÉCONOMIQUE (fusionnés) ────────────
// Sources : OpenAI/TechCrunch juil. 2025, Gartner août 2025, Grand View Research 2024
const NETWORK = {
  eyebrow: "Le network effect",
  headline: "Plus le réseau grandit, plus votre contenu vaut cher.",
  subheadline:
    "Une seule API d'authentification. Deux côtés du marché. Une boucle qui se renforce à chaque requête.",

  // Côté éditeurs
  side_publishers: {
    icon: "📢",
    title: "Un réseau sélectif d'éditeurs",
    desc: "Une alliance d'éditeurs, d'institutions expertes et de producteurs de contenu — qui apportent ce que l'IA ne peut pas créer seule : expertise sectorielle, contenus structurés, bases de connaissances construites sur des années.",
    // Modèle éco côté éditeurs
    model_title: "Comment vous gagnez",
    model_items: [
      "Abonnement fixe pour rejoindre le réseau",
      "Partage des revenus sur chaque récupération de contenu",
      "Benchmarks et recommandations de prix inclus",
    ],
  },

  // Centre — la boucle + les chiffres du marché (pas de Liquad, mais du marché)
  loop: {
    title: "Une couche d'intelligence continue",
    desc: "Chaque accès, chaque requête, chaque intégration génère de nouveaux signaux : demande par thématique, lacunes de contenu, opportunités de prix. Ces signaux reviennent à vos équipes éditoriales pour renforcer votre autorité là où ça compte.",
    network_argument:
      "Plus d'éditeurs → meilleure couverture → plus de services IA → plus de revenus redistribués → plus d'éditeurs.",
    // Chiffres de marché vérifiés — ils illustrent la taille de l'opportunité, pas la traction Liquad
    market_stats: [
      {
        value: "2,5 Mrd",
        label: "requêtes ChatGPT par jour",
        source: "OpenAI, juil. 2025",
        source_url: "https://techcrunch.com/2025/07/21/chatgpt-users-send-2-5-billion-prompts-a-day/",
      },
      {
        value: "+357%",
        label: "de croissance du trafic IA en 1 an",
        source: "SE Ranking, 2025",
        source_url: "https://seranking.com/blog/ai-traffic-research-study/",
      },
      {
        value: "40%",
        label: "des apps enterprise avec agents IA en 2026",
        source: "Gartner, août 2025",
        source_url:
          "https://www.gartner.com/en/newsroom/press-releases/2025-08-26-gartner-predicts-40-percent-of-enterprise-apps-will-feature-task-specific-ai-agents-by-2026-up-from-less-than-5-percent-in-2025",
      },
    ],
  },

  // Côté services IA
  side_ai: {
    icon: "🔍",
    title: "Un univers de services IA en expansion",
    desc: "Startups agentiques, copilotes métier, assistants personnels, workflows autonomes — tous ont besoin de sources fiables pour éviter les hallucinations et différencier leurs produits. Le marché RAG atteindra 11 milliards $ en 2030.",
    source: "Grand View Research, 2024",
    source_url:
      "https://www.grandviewresearch.com/industry-analysis/retrieval-augmented-generation-rag-market-report",
    model_title: "Ce qu'ils paient pour obtenir",
    model_items: [
      "Accès légal à des contenus de référence",
      "Sources traçables et attribuées (anti-hallucinations)",
      "Couverture thématique mise à jour en continu",
    ],
  },

  // Note de transparence sur le modèle économique
  model_note:
    "Vous ne payez pas pour une promesse. Vous rejoignez un réseau aligné sur vos intérêts : nous gagnons quand vous distribuez, pas avant.",
};

// ── SECTION COMMENT ÇA MARCHE (3 étapes, compressé) ──────────────────
const HOW_IT_WORKS = {
  eyebrow: "Comment ça marche",
  headline: "Opérationnel en 3 étapes.",
  steps: [
    {
      number: "01",
      title: "Connectez votre catalogue",
      desc: "Importez vos contenus via sitemap ou API. Liquad indexe et structure automatiquement votre base de connaissances — aucune saisie manuelle.",
    },
    {
      number: "02",
      title: "Définissez vos règles et vos prix",
      desc: "Choisissez quels services IA accèdent à quoi, dans quelles conditions et à quel tarif. Un contenu à la fois, un partenaire à la fois, à votre rythme.",
    },
    {
      number: "03",
      title: "Distribuez, pilotez, encaissez",
      desc: "Les services IA du réseau s'authentifient via une API unique. Chaque accès est tracé et monétisé. Vos revenus arrivent chaque mois, avec les statistiques associées.",
    },
  ],
};

// ── SECTION PREUVE MARCHÉ ─────────────────────────────────────────────
const MARKET_PROOF = {
  eyebrow: "Le marché existe déjà",
  headline: "Les grands éditeurs ont déjà négocié.\nVous pouvez faire pareil.",
  note: "Ces deals ont été rendus publics. Des centaines d'autres sont en cours de négociation.",
  deals: [
    {
      publisher: "News Corp",
      partner: "OpenAI",
      amount: "250 M$",
      detail: "Wall Street Journal, NY Post, MarketWatch — sur 5 ans",
    },
    {
      publisher: "Reuters",
      partner: "Meta",
      amount: "65 M$",
      detail: "Accès à l'archive Reuters",
    },
    {
      publisher: "Axel Springer",
      partner: "OpenAI",
      amount: "50 M$",
      detail: "Bild, Politico, Business Insider",
    },
  ],
  cta_label: "Rejoindre le réseau et entrer dans ces négociations →",
  disclaimer:
    "Sources : Press Gazette, Media and the Machine Substack (2024–2025). Liquad n'est pas affilié à ces éditeurs.",
};

// ── SECTION FAQ ───────────────────────────────────────────────────────
const FAQ = {
  eyebrow: "Questions fréquentes",
  headline: "Tout ce que vous voulez savoir",
  items: [
    // Questions existantes
    {
      q: "Comment Liquad m'aide concrètement à remplacer des revenus publicitaires perdus ?",
      a: "En créant un canal de revenus directs indépendant du trafic : les services IA paient pour accéder à votre contenu via le réseau Liquad. Plus votre contenu est spécialisé et à jour, plus il est valorisé. C'est un revenu récurrent qui ne dépend pas du volume de visiteurs sur votre site.",
    },
    {
      q: "Qu'est-ce que l'API unique d'authentification ?",
      a: "Plutôt que de négocier un accord séparé avec chaque service IA — ce qui nécessiterait des mois de discussions juridiques — Liquad propose une API commune. Les services IA s'authentifient une fois et accèdent à l'ensemble des éditeurs partenaires selon leurs règles. C'est ce qui crée l'effet réseau : votre contenu devient accessible à tous les partenaires en un seul déploiement.",
    },
    {
      q: "Mon référencement naturel est-il affecté ?",
      a: "Non. Liquad opère uniquement sur les accès des agents IA déclarés dans le réseau. Googlebot, Bingbot et tous les robots d'indexation SEO ne sont jamais concernés. Votre référencement naturel est totalement préservé.",
    },
    {
      q: "Qui peut rejoindre le réseau ?",
      a: "Tout éditeur de contenu : médias, presse spécialisée, institutions académiques, cabinets d'expertise, plateformes de données professionnelles. La sélection garantit la qualité du réseau — ce qui protège la valeur de votre contenu pour les partenaires IA.",
    },
    {
      q: "Quand est-ce que je commence à générer des revenus ?",
      a: "Dès que votre contenu est accessible dans le réseau et qu'un service IA partenaire y accède. Les revenus sont calculés à chaque récupération et reversés chaque mois selon le modèle abonnement + partage des revenus.",
    },
    // Questions ajoutées — objections réelles identifiées
    {
      q: "Combien de services IA sont déjà connectés au réseau ?",
      a: "Liquad est en accès anticipé. Le réseau est en cours de déploiement avec des partenaires sélectionnés. Rejoindre maintenant signifie être intégré en priorité lors des premières connexions avec les services IA partenaires — et bénéficier de conditions d'entrée préférentielles.",
    },
    {
      q: "Quel est mon partage des revenus ? Combien est-ce que je touche réellement ?",
      a: "Une part significative de chaque transaction revient directement à l'éditeur d'origine. Les conditions précises dépendent du type de contenu, de la fréquence d'accès et du volume distribué. Nous les définissons ensemble lors de l'onboarding. Notre modèle est aligné sur le vôtre : nous ne gagnons que si vous distribuez.",
    },
  ],
};

// ── SECTION CTA FINAL ─────────────────────────────────────────────────
const CTA_FINAL = {
  headline: "Le trafic Search se redistribue vers l'IA.\nVotre place dans cet écosystème, vous la choisissez.",
  subheadline:
    "Chaque jour sans Liquad, vos contenus servent les agents IA gratuitement. Rejoignez le réseau et transformez cette valeur en revenus récurrents.",
  cta_primary: { label: "Demander l'accès", href: "/login" },
  cta_secondary: { label: "Voir comment ça marche", href: "#how-it-works" },
};

// ── FOOTER ────────────────────────────────────────────────────────────
const FOOTER = {
  links: [
    { label: "La plateforme", href: "#features" },
    { label: "Network effect", href: "#network" },
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

      {/* ─── URGENCE ÉDITEURS ─────────────────────────────────────── */}
      <section className="bg-gray-950 py-20">
        <div className="mx-auto max-w-5xl px-6">
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-400 mb-8 text-center">
            {PUBLISHER_IMPACT.eyebrow}
          </p>

          {/* Stat Gartner centrale */}
          <div className="flex flex-col sm:flex-row items-center gap-6 mb-14 max-w-3xl mx-auto">
            <div className="text-8xl font-black text-blue-400 shrink-0 leading-none">
              {PUBLISHER_IMPACT.stat_headline}
            </div>
            <div>
              <p className="text-lg text-gray-300 leading-relaxed mb-2">
                {PUBLISHER_IMPACT.stat_desc}
              </p>
              <a
                href={PUBLISHER_IMPACT.stat_source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                — {PUBLISHER_IMPACT.stat_source} ↗
              </a>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white text-center mb-10">
            {PUBLISHER_IMPACT.headline}
          </h2>

          {/* 3 douleurs avec stats sourçées */}
          <div className="grid gap-6 sm:grid-cols-3">
            {PUBLISHER_IMPACT.pains.map((pain) => (
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

      {/* ─── SOLUTION : 3 PILIERS ─────────────────────────────────── */}
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
                <p className="text-sm text-gray-600 leading-relaxed">{pillar.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── NETWORK EFFECT + MODÈLE ÉCO (fusionnés) ─────────────── */}
      <section className="py-24 bg-white" id="network">
        <div className="mx-auto max-w-6xl px-6">
          <div className="text-center mb-16">
            <p className="text-xs font-semibold uppercase tracking-widest text-blue-600 mb-4">
              {NETWORK.eyebrow}
            </p>
            <h2 className="text-3xl font-bold text-gray-900 sm:text-4xl mb-4">
              {NETWORK.headline}
            </h2>
            <p className="mx-auto max-w-2xl text-base text-gray-500 leading-relaxed">
              {NETWORK.subheadline}
            </p>
          </div>

          {/* Diagramme réseau */}
          <div className="grid gap-6 lg:grid-cols-3 items-start mb-10">

            {/* Côté éditeurs */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8">
              <div className="text-3xl mb-4">{NETWORK.side_publishers.icon}</div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                {NETWORK.side_publishers.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-6">
                {NETWORK.side_publishers.desc}
              </p>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {NETWORK.side_publishers.model_title}
                </p>
                <ul className="space-y-2">
                  {NETWORK.side_publishers.model_items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Centre : boucle + chiffres marché */}
            <div className="rounded-2xl border-2 border-blue-200 bg-blue-50 p-8 text-center lg:mt-6">
              <div className="flex items-center justify-center gap-2 mb-1 text-blue-500 text-xs font-mono font-semibold">
                <span>Contenus →</span>
              </div>
              <div className="h-px bg-blue-200 mb-1" />
              <div className="flex items-center justify-center gap-2 mb-5 text-blue-500 text-xs font-mono font-semibold">
                <span>← Revenus</span>
              </div>
              <h3 className="text-sm font-bold text-blue-900 mb-2">{NETWORK.loop.title}</h3>
              <p className="text-xs text-blue-700 leading-relaxed mb-5">{NETWORK.loop.desc}</p>
              <div className="rounded-xl bg-white border border-blue-200 px-4 py-3 mb-5">
                <p className="text-xs text-gray-700 leading-relaxed font-medium">
                  {NETWORK.loop.network_argument}
                </p>
              </div>
              {/* Chiffres de marché — taille de l'opportunité */}
              <div className="space-y-3">
                {NETWORK.loop.market_stats.map((stat) => (
                  <div key={stat.value} className="rounded-lg bg-blue-100 border border-blue-200 px-3 py-2">
                    <div className="font-bold text-blue-800 text-sm">{stat.value}</div>
                    <div className="text-xs text-blue-700 leading-tight">{stat.label}</div>
                    <a
                      href={stat.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-400 hover:text-blue-600 transition-colors"
                    >
                      {stat.source} ↗
                    </a>
                  </div>
                ))}
              </div>
            </div>

            {/* Côté services IA */}
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-8">
              <div className="text-3xl mb-4">{NETWORK.side_ai.icon}</div>
              <h3 className="text-base font-semibold text-gray-900 mb-3">
                {NETWORK.side_ai.title}
              </h3>
              <p className="text-sm text-gray-600 leading-relaxed mb-2">
                {NETWORK.side_ai.desc}
              </p>
              <a
                href={NETWORK.side_ai.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors mb-5 block"
              >
                — {NETWORK.side_ai.source} ↗
              </a>
              <div className="border-t border-gray-200 pt-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                  {NETWORK.side_ai.model_title}
                </p>
                <ul className="space-y-2">
                  {NETWORK.side_ai.model_items.map((item) => (
                    <li key={item} className="flex items-start gap-2 text-xs text-gray-600">
                      <span className="text-blue-500 mt-0.5 shrink-0">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Note modèle éco */}
          <div className="rounded-2xl border border-blue-100 bg-blue-50 px-8 py-5 text-center">
            <p className="text-sm font-medium text-blue-800">{NETWORK.model_note}</p>
          </div>
        </div>
      </section>

      {/* ─── COMMENT ÇA MARCHE (3 étapes) ────────────────────────── */}
      <section className="py-24 bg-gray-50" id="how-it-works">
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

      {/* ─── PREUVE MARCHÉ ────────────────────────────────────────── */}
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
                    <div className="text-xs text-gray-500">× {deal.partner}</div>
                  </div>
                  <div className="text-xl font-black text-blue-600">{deal.amount}</div>
                </div>
                <p className="text-xs text-gray-500 leading-relaxed">{deal.detail}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link href="/login" className="text-sm font-semibold text-blue-600 hover:text-blue-700 transition-colors">
              {MARKET_PROOF.cta_label}
            </Link>
            <p className="mt-4 text-xs text-gray-400">{MARKET_PROOF.disclaimer}</p>
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

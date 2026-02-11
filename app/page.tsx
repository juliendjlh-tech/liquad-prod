import Link from "next/link";
import Navbar from "@/app/components/Navbar";

export default function Home() {
  return (
    <div className="min-h-screen bg-white">

      {/* Hero */}
      <section className="mx-auto max-w-7xl px-6 pt-24 pb-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900 sm:text-5xl">
          License your content for AI
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-600">
          DataFlow helps publishers monitor, control, and monetize how AI bots
          access their content. Deploy a lightweight SDK and start earning from
          AI training and retrieval.
        </p>
        <div className="mt-10 flex items-center justify-center gap-4">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition-colors"
          >
            Get Started
          </Link>
        </div>
      </section>

      {/* Value Proposition */}
      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {[
            {
              title: "Import Content",
              desc: "Import your sitemap.xml and DataFlow indexes all your content URLs automatically.",
            },
            {
              title: "Declare AI Bots",
              desc: "Select which AI crawlers (GPTBot, ClaudeBot, etc.) you want to control.",
            },
            {
              title: "Create Catalogs",
              desc: "Define URL patterns, assign bots, and set your price per access.",
            },
            {
              title: "Deploy SDK",
              desc: "Add 3 lines of code to your server. DataFlow handles the rest.",
            },
          ].map((item) => (
            <div
              key={item.title}
              className="rounded-lg border border-gray-200 p-6"
            >
              <h3 className="text-lg font-semibold text-gray-900">
                {item.title}
              </h3>
              <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="bg-gray-50 py-16">
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="text-center text-2xl font-bold text-gray-900">
            How it works
          </h2>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { step: "1", title: "Import", desc: "Add your sitemap URL to index your content." },
              { step: "2", title: "Declare", desc: "Choose which AI bots to track and control." },
              { step: "3", title: "Catalog", desc: "Create pricing rules for your content." },
              { step: "4", title: "Deploy", desc: "Install the SDK and go live in minutes." },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white font-bold">
                  {item.step}
                </div>
                <h3 className="mt-4 text-lg font-semibold text-gray-900">
                  {item.title}
                </h3>
                <p className="mt-2 text-sm text-gray-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer CTA */}
      <section className="mx-auto max-w-7xl px-6 py-16 text-center">
        <h2 className="text-2xl font-bold text-gray-900">
          Ready to monetize your content?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-gray-600">
          Join publishers who are taking control of how AI accesses their work.
        </p>
        <div className="mt-8">
          <Link
            href="/login"
            className="rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-700 transition-colors"
          >
            Get Started Free
          </Link>
        </div>
      </section>
    </div>
  );
}

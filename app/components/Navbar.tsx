import Link from "next/link"

export default function Navbar() {
    const links = [
        {
            label: "Home",
            href: "/",
        },
        {
            label: "About",
            href: "/about",
        },
    ]
    return (
        <header className="sticky top-0 z-50 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <nav className="mx-auto max-w-7xl px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary" />
              <span className="text-lg font-semibold text-foreground">DataFlow</span>
            </div>
  
            <div className="hidden gap-8 md:flex">
                {links.map((link) => (
                    <Link key={link.href} href={link.href}>
                        {link.label}
                    </Link>
                ))}
            </div>
            </div>
            </nav>
            </header>
        )
    }

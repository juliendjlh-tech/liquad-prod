"use client";

import { usePathname } from "next/navigation";

const VISIBLE_PATHS = ["/", "/publishers", "/ai-companies", "/login"];

export default function NavbarVisibility({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (!VISIBLE_PATHS.includes(pathname)) return null;
  return <>{children}</>;
}

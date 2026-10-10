"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/path", label: "Path" },
  { href: "/progress", label: "Progress" },
] as const;

/** Text-only tab bar at the bottom (.rr-tabbar): rule above the active tab. */
export function TabBar() {
  const pathname = usePathname();
  return (
    <nav className="rr-tabbar" aria-label="Main">
      {TABS.map((tab) => {
        const active =
          pathname === tab.href || pathname.startsWith(`${tab.href}/`);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className="rr-tabbar__tab"
            aria-current={active ? "page" : undefined}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

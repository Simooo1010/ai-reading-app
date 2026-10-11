"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today" },
  { href: "/path", label: "Path" },
  { href: "/progress", label: "Progress" },
] as const;

/**
 * The tab label. While a tapped tab is still loading (not prefetched yet,
 * e.g. right after the app opens), `data-pending` marks it, and the CSS
 * moves the active rule to it at once (see .rr-tabbar in components.css).
 */
function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <span data-pending={pending ? "" : undefined}>{label}</span>;
}

/**
 * Text-only tab bar (.rr-tabbar): at the bottom with a rule above the active
 * tab; from 1100px up the CSS moves it to the top (ink line under the tab).
 */
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
            <TabLabel label={tab.label} />
          </Link>
        );
      })}
    </nav>
  );
}

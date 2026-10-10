import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="shell">
      <TabBar />
      <main className="content">{children}</main>
    </div>
  );
}

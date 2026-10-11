import type { ReactNode } from "react";
import { TabBar } from "@/components/TabBar";
import { UndoProvider } from "@/components/UndoProvider";

// Reading Room shell: one centred column (480px on a phone, wider on
// tablets and desktops: --rr-page-max), text-only tab bar at the bottom
// (a top bar from 1100px up, moved by CSS only). The Undo toast lives here so it stays
// on screen while the page re-renders after Skip.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <UndoProvider>
      <div className="rr-screen">
        <main className="rr-screen__main">{children}</main>
        <TabBar />
      </div>
    </UndoProvider>
  );
}

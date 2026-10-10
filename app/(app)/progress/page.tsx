import type { Metadata } from "next";
import { ScreenHeader } from "@/components/ScreenHeader";

export const metadata: Metadata = { title: "Progress · AI Reading" };

export default function ProgressPage() {
  return (
    <>
      <ScreenHeader title="Progress" />
      <div className="rr-screen__body">
        <section className="rr-state">
          <p className="rr-body-italic">Coming in the next step.</p>
        </section>
      </div>
    </>
  );
}

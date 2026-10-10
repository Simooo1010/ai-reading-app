import type { Metadata } from "next";

export const metadata: Metadata = { title: "Progress · AI Reading" };

export default function ProgressPage() {
  return (
    <>
      <h1 className="page-title">Progress</h1>
      <p className="muted">Coming in the next step.</p>
    </>
  );
}

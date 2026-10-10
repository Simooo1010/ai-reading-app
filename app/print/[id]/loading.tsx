import { PrintSkeleton } from "@/components/PrintStates";

// Shown at once while the source page is downloaded and read (up to ~15 s).
export default function PrintLoading() {
  return <PrintSkeleton />;
}

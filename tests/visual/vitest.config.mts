import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only for the fixture harness (not part of `npm test`).
export default defineConfig({
  resolve: {
    alias: {
      // No Next.js font compiler in vitest: a stub with the same shape.
      "next/font/google": fileURLToPath(new URL("./next-font-stub.ts", import.meta.url)),
      "@": fileURLToPath(new URL("../../", import.meta.url)),
    },
  },
  test: {
    root: fileURLToPath(new URL("./", import.meta.url)),
    environment: "node",
    include: ["render.visual.tsx", "print.visual.tsx"],
  },
});

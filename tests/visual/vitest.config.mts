import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Only for the fixture harness (not part of `npm test`).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../", import.meta.url)) },
  },
  test: {
    root: fileURLToPath(new URL("./", import.meta.url)),
    environment: "node",
    include: ["render.visual.tsx"],
  },
});

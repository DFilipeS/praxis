import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      exclude: [
        "src/adapters.js", // re-export barrel — all functions tested via src/adapters/index.js
      ],
    },
  },
});

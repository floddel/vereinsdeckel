import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    // Geschäftslogik und Datenbank-Tests laufen in Node, ohne Browser.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

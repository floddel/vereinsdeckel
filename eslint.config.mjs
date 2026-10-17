import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // zod nur über @/lib/z (dort ohne „JIT“, sonst meldet die Content-Security-Policy Verstöße)
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/lib/z.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        { paths: [{ name: "zod", message: "Bitte aus @/lib/z importieren.", allowTypeImports: true }] },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Testberichte und lokale Daten
    "playwright-report/**",
    "test-results/**",
    ".data/**",
  ]),
]);

export default eslintConfig;

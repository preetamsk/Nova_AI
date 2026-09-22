import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  ...nextVitals,
  {
    rules: {
      // Initial local-history hydration is intentionally asynchronous on mount.
      "react-hooks/set-state-in-effect": "off",
      // Client-captured canvas images and local file previews use standard img tags.
      "@next/next/no-img-element": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "node_modules/**",
    "out/**",
    "**/*.before-*",
    "**/*.reconstruction-backup.*",
  ]),
]);

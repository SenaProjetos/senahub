import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "public/**", // assets estáticos (ex.: worker minificado do pdf.js) não são código-fonte
      ".ds-sync/**", // artefatos gerados do sync de design-system, não código-fonte
      "ds-bundle/**", // bundle vendorizado (React interno etc.), não código-fonte
    ],
  },
];

export default eslintConfig;

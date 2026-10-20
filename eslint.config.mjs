// QA-01 — one flat config for the whole monorepo. Formatting belongs to Prettier (eslint-config-prettier last).
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import jsxA11y from "eslint-plugin-jsx-a11y";
import prettier from "eslint-config-prettier";
import globals from "globals";

const root = import.meta.dirname;

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/coverage/**",
      "**/*.tsbuildinfo",
      "packages/db/generated/**",
      "services/**",
      "apps/web/next-env.d.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,

  // type-aware rules, limited to the ones that catch real async bugs (an unawaited write, a promise passed where a
  // callback's result is ignored). The tsconfig.test.json files make the tests part of a project too.
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      parserOptions: {
        project: [
          "apps/api/tsconfig.test.json",
          "apps/web/tsconfig.json",
          "packages/analysis-engine/tsconfig.test.json",
          "packages/shared/tsconfig.test.json",
          "packages/db/tsconfig.json",
        ],
        tsconfigRootDir: root,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/await-thenable": "error",
      // JSX handlers may be async: React ignores the returned promise, and a rejected one is already handled inside
      "@typescript-eslint/no-misused-promises": ["error", { checksVoidReturn: { attributes: false } }],
    },
  },

  // tool configs outside every tsconfig: syntax rules only
  { files: ["**/vitest.config.ts"], ...tseslint.configs.disableTypeChecked, languageOptions: { parserOptions: { project: null } } },

  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none", ignoreRestSiblings: true },
      ],
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always", { null: "ignore" }],
      "prefer-const": "error",
    },
  },

  // the web app: hooks, Next.js and accessibility
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks, "@next/next": nextPlugin, "jsx-a11y": jsxA11y },
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: "apps/web" } },
    rules: {
      // the two classic hook rules; the React Compiler rules in plugin v7 assume the compiler, which this app does not use
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,
      ...jsxA11y.flatConfigs.recommended.rules,
    },
  },

  // CLIs print to stdout by design
  { files: ["apps/api/src/tools/**", "packages/db/src/**/seed*.ts"], rules: { "no-console": "off" } },
  // the service worker and plain config files
  { files: ["apps/web/public/sw.js"], languageOptions: { globals: { ...globals.serviceworker } } },
  { files: ["**/*.{js,mjs,cjs}"], languageOptions: { globals: { ...globals.node } } },

  prettier,
);

import type { Config } from "tailwindcss";

/**
 * Kharita design tokens. Every colour is a CSS custom property defined once in globals.css,
 * so night/day switching is a single attribute on <html>.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["selector", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        field: "var(--field)",
        sheet: "var(--sheet)",
        raised: "var(--raised)",
        hair: "var(--hair)",
        rule: "var(--rule)",
        ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)", 3: "var(--ink-3)" },
        up: "var(--up)",
        down: "var(--down)",
        stamp: "var(--stamp)",
        "up-wash": "var(--up-wash)",
        "down-wash": "var(--down-wash)",
        flag: "var(--flag)",
      },
      fontFamily: { sans: ["var(--font-ui)"], mono: ["var(--font-mono)"] },
      borderRadius: { DEFAULT: "4px", sm: "3px", md: "4px", lg: "4px", xl: "6px", "2xl": "8px" },
      boxShadow: { sheet: "0 12px 40px rgba(0,0,0,.35)" },
      fontSize: { "2xs": ["10.5px", "14px"] },
    },
  },
  plugins: [],
};
export default config;

import type { Config } from "tailwindcss";

/**
 * Design tokens (the gold skin over Kharita's roles). Every colour is a CSS custom property defined once in globals.css,
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
        "up-ink": "var(--up-ink)",
        "down-ink": "var(--down-ink)",
        stamp: "var(--stamp)",
        "up-wash": "var(--up-wash)",
        "down-wash": "var(--down-wash)",
        flag: "var(--flag)",
        accent: {
          DEFAULT: "var(--accent)",
          hi: "var(--accent-hi)",
          ink: "var(--accent-ink)",
          wash: "var(--accent-wash)",
          line: "var(--accent-line)",
        },
        "on-accent": "var(--on-accent)",
      },
      fontFamily: { sans: ["var(--font-ui)"], mono: ["var(--font-mono)"] },
      borderRadius: { DEFAULT: "8px", sm: "5px", md: "8px", lg: "12px", xl: "14px", "2xl": "18px" },
      boxShadow: { sheet: "0 12px 40px rgba(0,0,0,.35)" },
      fontSize: { "2xs": ["10.5px", "14px"] },
    },
  },
  plugins: [],
};
export default config;

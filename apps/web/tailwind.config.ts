import type { Config } from "tailwindcss";

/** Design tokens — premium dark trading interface (see docs/11-ui-design-system.md). */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        bg: { DEFAULT: "#0b0c0f", panel: "#13151a", panel2: "#191b21", hover: "#1f2229" },
        line: "#2d3038",
        gold: { DEFAULT: "#d5b15d", light: "#f1d99a", dim: "#65532c" },
        ink: { DEFAULT: "#f4f2ed", muted: "#a9a9b0", faint: "#6f7079" },
        up: "#37c7a0",
        down: "#f07882",
        info: "#8db7ff",
        warn: "#f0b35c",
      },
      fontFamily: { sans: ["Inter", "Tahoma", "Arial", "sans-serif"], mono: ["JetBrains Mono", "ui-monospace", "monospace"] },
      borderRadius: { xl: "14px", "2xl": "20px" },
      boxShadow: { glow: "0 0 0 1px rgba(213,177,93,.25), 0 10px 40px rgba(0,0,0,.45)" },
    },
  },
  plugins: [],
};
export default config;

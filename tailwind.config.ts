import type { Config } from "tailwindcss";

/**
 * Keeps Preflight disabled so legacy rules in globals.css remain the source of base styles.
 * Theme maps existing CSS variables for utility parity with tokens in app/globals.css.
 */
export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx}"],
  corePlugins: {
    preflight: false
  },
  theme: {
    extend: {
      colors: {
        ink: "var(--ink)",
        muted: "var(--muted)",
        subtle: "var(--subtle)",
        background: "var(--bg)",
        panel: {
          DEFAULT: "var(--panel)",
          soft: "var(--panel-soft)"
        },
        brand: {
          DEFAULT: "var(--brand)",
          dark: "var(--brand-dark)",
          xdark: "var(--brand-xdark)",
          light: "var(--brand-light)"
        },
        border: {
          DEFAULT: "var(--border)",
          strong: "var(--border-strong)"
        },
        semantic: {
          orange: "var(--orange)",
          green: "var(--green)",
          "green-bg": "var(--green-bg)",
          red: "var(--red)",
          "red-bg": "var(--red-bg)",
          blue: "var(--blue)",
          "blue-bg": "var(--blue-bg)"
        },
        amazon: "var(--amazon)",
        sidebar: "var(--sidebar-bg)"
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)"
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius)",
        lg: "var(--radius-lg)",
        full: "var(--radius-full)"
      },
      transitionDuration: {
        DEFAULT: "200ms",
        swift: "200ms"
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.4, 0, 0.2, 1)"
      }
    }
  },
  plugins: []
} satisfies Config;

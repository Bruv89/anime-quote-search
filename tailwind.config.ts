import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
        display: ["var(--font-display)", "serif"],
      },
      colors: {
        // Deep ink backgrounds
        ink: {
          950: "#050508",
          900: "#0a0a12",
          800: "#10101e",
          700: "#18182e",
          600: "#22223e",
        },
        // Neon accent — sakura-to-violet spectrum
        sakura: {
          400: "#f472b6",
          500: "#ec4899",
          600: "#db2777",
        },
        neon: {
          cyan: "#22d3ee",
          violet: "#a78bfa",
          amber: "#fbbf24",
        },
      },
      backgroundImage: {
        "grid-pattern":
          "linear-gradient(rgba(167,139,250,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(167,139,250,0.03) 1px, transparent 1px)",
        "hero-gradient":
          "radial-gradient(ellipse 80% 60% at 50% -10%, rgba(167,139,250,0.15) 0%, transparent 60%)",
      },
      backgroundSize: {
        grid: "40px 40px",
      },
      animation: {
        "fade-up": "fadeUp 0.5s ease forwards",
        "pulse-slow": "pulse 3s ease-in-out infinite",
        shimmer: "shimmer 2s linear infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      boxShadow: {
        "neon-violet": "0 0 20px rgba(167,139,250,0.3), 0 0 60px rgba(167,139,250,0.1)",
        "neon-sakura": "0 0 20px rgba(236,72,153,0.3), 0 0 60px rgba(236,72,153,0.1)",
      },
    },
  },
  plugins: [],
};

export default config;

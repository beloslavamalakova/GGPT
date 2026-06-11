import type { Config } from "tailwindcss";

export default {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#442735",
        cream: "#fff5f8",
        grape: "#e56f9f",
        lilac: "#ffe0ec",
        coral: "#f08aab",
        mint: "#ffd4e3",
      },
      boxShadow: {
        bubble: "0 12px 30px rgba(141, 61, 94, 0.1)",
        glow: "0 18px 60px rgba(229, 111, 159, 0.28)",
      },
      animation: {
        "fade-up": "fadeUp 0.45s ease-out both",
        "soft-pulse": "softPulse 1.6s ease-in-out infinite",
      },
      keyframes: {
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        softPulse: {
          "0%, 100%": { opacity: "0.35" },
          "50%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
} satisfies Config;

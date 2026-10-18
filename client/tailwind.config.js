/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // Same warm palette family as Know Your Body, tuned for Research.
        cream: "#F5EBDF",
        rust: {
          500: "#C04E2A",
          600: "#a34324",
          700: "#8a351d",
        },
        ink: {
          700: "#351D1D",
          800: "#2a1717",
          900: "#12100E",
        },
        clay: "#B58777",
        blush: "#E6CBBD",
        ember: "#E0662B",
      },
    },
  },
  plugins: [],
};

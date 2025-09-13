/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./app/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      container: { center: true, padding: "1rem" },
      boxShadow: { card: "0 10px 30px rgba(2,6,23,.06)" },
      borderRadius: { xl: "1rem" }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

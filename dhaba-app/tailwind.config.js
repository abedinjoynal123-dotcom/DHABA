/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dhaba: {
          red: '#C0392B',
          orange: '#E67E22',
          dark: '#1A1A1A',
          gold: '#F39C12',
          cream: '#FFF8F0',
          green: '#27AE60',
        },
      },
    },
  },
  plugins: [],
}

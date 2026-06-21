/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#375337',
          50: '#f0f5f0',
          100: '#d6e8d6',
          200: '#aed1ae',
          300: '#7db57d',
          400: '#559655',
          500: '#375337',
          600: '#2e4530',
          700: '#253827',
          800: '#1c2b1e',
          900: '#121c13',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 2px 8px rgba(0,0,0,0.08)',
        'card-hover': '0 4px 16px rgba(0,0,0,0.12)',
      },
    },
  },
  plugins: [],
}

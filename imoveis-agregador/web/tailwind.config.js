/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        placa: '#FFD23F',
        'placa-escura': '#E8B800',
        tinta: '#1F2A36',
        'tinta-suave': '#5A6673',
        fundo: '#F2F4F6',
        linha: '#D8DDE3',
        erro: '#B9382C',
        ok: '#2F7D4F',
      },
      fontFamily: {
        sans: ['Archivo', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

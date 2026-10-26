/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#10b981',
          600: '#059669',
          700: '#047857',
        },
        surface: {
          50: '#f8fafc',
          100: '#f1f5f9',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },
        ml: {
          black: '#171714',
          deep: '#0D0D0B',
          mustard: '#E5BB45',
          'mustard-hover': '#D3A82F',
          white: '#FFFFFF',
          'warm-white': '#F8F7F2',
          'soft-white': '#F8F7F2',
          'text-primary': '#171714',
          'text-secondary': '#66645C',
          'dark-secondary': '#B0ADA5',
          'border-light': '#DEDDD5',
          'border-dark': '#2C2B26',
        },
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'Georgia', 'serif'],
        sans: ['Manrope', 'Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

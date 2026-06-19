/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Plesk-like blue accent (our own values).
        brand: {
          50: '#eff8fc',
          100: '#d6eefa',
          200: '#b0ddf3',
          300: '#7cc6ea',
          400: '#41a9dc',
          500: '#2196c9',
          600: '#1a7fb0',
          700: '#186a92',
          800: '#195a78',
          900: '#194c64',
        },
        // Dark sidebar navy.
        navy: {
          700: '#34465a',
          800: '#2b3a4b',
          900: '#243140',
        },
        ink: {
          50: '#f7f8fa',
          100: '#f0f2f5',
          200: '#e3e7ec',
          300: '#cbd2da',
          400: '#94a0ad',
          500: '#6b7785',
          600: '#4b5562',
          700: '#343d49',
          800: '#1f2630',
          900: '#11161d',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

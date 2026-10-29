/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#202124',
        paper: '#fffaf0',
        sun: '#f6c945',
        tangerine: '#f27c3d',
        grape: '#7f67d9',
        mint: '#85d6b1',
      },
      boxShadow: { comic: '5px 6px 0 #202124', soft: '0 16px 40px rgba(32,33,36,.12)' },
      fontFamily: { sans: ['"Noto Sans SC"', '"Microsoft YaHei"', 'system-ui', 'sans-serif'] },
    },
  },
  plugins: [],
}

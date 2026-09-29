import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F5F6F3',
        surface: '#FFFFFF',
        ink: { DEFAULT: '#14282D', soft: '#2B4046' },
        muted: '#5D6E72',
        line: '#E1E5E2',
        mark: '#F4DC5B',
        ok: '#1E7B57',
        bad: '#C2412D',
        warn: '#B7791F',
      },
      fontFamily: {
        sans: ['"Instrument Sans Variable"', 'system-ui', 'sans-serif'],
        serif: ['"Newsreader Variable"', 'Georgia', 'serif'],
      },
      borderRadius: { DEFAULT: '6px' },
    },
  },
  plugins: [],
};
export default config;

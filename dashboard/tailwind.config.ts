import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        ink: '#080a0f',
        panel: '#10141d',
        panel2: '#151b26',
        line: '#263244',
        mint: '#2dd4bf',
        skyline: '#38bdf8',
        amberline: '#f59e0b',
      },
      boxShadow: {
        panel: '0 18px 50px rgba(0, 0, 0, 0.24)',
      },
    },
  },
  plugins: [],
} satisfies Config;

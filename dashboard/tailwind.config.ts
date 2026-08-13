import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        // surfaces
        paper: '#f9f9f7', // page background
        surface: '#fcfcfb', // cards / panels
        line: '#e1e0d9', // hairline borders
        baseline: '#c3c2b7', // axis / stronger rules
        // ink
        ink: '#0b0b0b',
        ink2: '#52514e',
        muted: '#898781',
        // data colors (validated palette — see docs)
        leaf: '#2a78d6', // blue: leaf pages, primary actions
        internal: '#eb6834', // orange: internal pages
        meta: '#1baf7a', // aqua: metadata pages
        overflow: '#eda100', // yellow: overflow pages
        path: '#4a3aa7', // violet: highlighted search path
        // status (reserved)
        good: '#0ca30c',
        danger: '#d03b3b',
      },
      boxShadow: {
        card: '0 1px 2px rgba(11, 11, 11, 0.04), 0 8px 24px rgba(11, 11, 11, 0.05)',
      },
    },
  },
  plugins: [],
} satisfies Config;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        night: '#0a0f1a',
        panel: '#111827',
        border: '#1f2937',
        cyan: '#00d4ff',
        high: '#ff6b00',
        critical: '#ff3b3b',
        warning: '#ffaa00',
        success: '#00ff88',
        ink: '#f9fafb',
        muted: '#6b7280',
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'sans-serif'],
        mono: ['"IBM Plex Mono"', '"Fira Code"', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(0, 212, 255, 0.12), 0 0 28px rgba(0, 212, 255, 0.08)',
      },
      backgroundImage: {
        grid: 'linear-gradient(rgba(31, 41, 55, 0.35) 1px, transparent 1px), linear-gradient(90deg, rgba(31, 41, 55, 0.35) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
};

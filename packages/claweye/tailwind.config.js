/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './app/**/*.{ts,tsx}',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        // ClawSentinel brand palette
        claw: {
          bg:       '#0a0e1a',
          surface:  '#111827',
          border:   '#1f2937',
          muted:    '#374151',
          text:     '#e5e7eb',
          subtext:  '#9ca3af',
          accent:   '#6366f1',
          safe:     '#10b981',
          warn:     '#f59e0b',
          block:    '#f97316',
          critical: '#ef4444'
        }
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Fira Code', 'Consolas', 'monospace']
      },
      animation: {
        'pulse-slow': 'pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'slide-in':   'slideIn 0.2s ease-out'
      },
      keyframes: {
        slideIn: {
          '0%':   { opacity: '0', transform: 'translateY(-4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' }
        }
      }
    }
  },
  plugins: []
};

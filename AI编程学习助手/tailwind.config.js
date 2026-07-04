/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 使用 CSS 变量，支持主题切换
        'cm-bg': 'var(--cm-bg)',
        'cm-surface': 'var(--cm-surface)',
        'cm-card': 'var(--cm-card)',
        'cm-card-alt': 'var(--cm-card-alt)',
        'cm-border': 'var(--cm-border)',
        'cm-border-light': 'var(--cm-border-light)',
        'cm-text': 'var(--cm-text)',
        'cm-text-secondary': 'var(--cm-text-secondary)',
        'cm-muted': 'var(--cm-muted)',
        'cm-accent': 'var(--cm-accent)',
        'cm-accent-light': 'var(--cm-accent-light)',
        'cm-accent-dark': 'var(--cm-accent-dark)',
        'cm-green': 'var(--cm-green)',
        'cm-green-light': 'var(--cm-green-light)',
        'cm-purple': 'var(--cm-purple)',
        'cm-purple-light': 'var(--cm-purple-light)',
        'cm-amber': 'var(--cm-amber)',
        'cm-amber-light': 'var(--cm-amber-light)',
        'cm-red': 'var(--cm-red)',
        'cm-blue': 'var(--cm-blue)',
        'cm-blue-light': 'var(--cm-blue-light)',
      },
      fontFamily: {
        sans: ['"DM Sans"', '"Noto Sans SC"', 'sans-serif'],
        display: ['"Playfair Display"', '"Noto Sans SC"', 'serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'soft': '0 2px 12px rgba(45, 36, 24, 0.06)',
        'soft-md': '0 4px 20px rgba(45, 36, 24, 0.08)',
        'soft-lg': '0 8px 32px rgba(45, 36, 24, 0.10)',
        'accent': '0 4px 16px rgba(196, 112, 63, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'float': 'float 3s ease-in-out infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
};

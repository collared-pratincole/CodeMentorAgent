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
        // 使用 CSS 变量（R G B 通道格式），支持主题切换与透明度修饰符
        'cm-bg': 'rgb(var(--cm-bg) / <alpha-value>)',
        'cm-surface': 'rgb(var(--cm-surface) / <alpha-value>)',
        'cm-card': 'rgb(var(--cm-card) / <alpha-value>)',
        'cm-card-alt': 'rgb(var(--cm-card-alt) / <alpha-value>)',
        'cm-border': 'rgb(var(--cm-border) / <alpha-value>)',
        'cm-border-light': 'rgb(var(--cm-border-light) / <alpha-value>)',
        'cm-text': 'rgb(var(--cm-text) / <alpha-value>)',
        'cm-text-secondary': 'rgb(var(--cm-text-secondary) / <alpha-value>)',
        'cm-muted': 'rgb(var(--cm-muted) / <alpha-value>)',
        'cm-accent': 'rgb(var(--cm-accent) / <alpha-value>)',
        'cm-accent-light': 'rgb(var(--cm-accent-light) / <alpha-value>)',
        'cm-accent-dark': 'rgb(var(--cm-accent-dark) / <alpha-value>)',
        'cm-green': 'rgb(var(--cm-green) / <alpha-value>)',
        'cm-green-light': 'rgb(var(--cm-green-light) / <alpha-value>)',
        'cm-purple': 'rgb(var(--cm-purple) / <alpha-value>)',
        'cm-purple-light': 'rgb(var(--cm-purple-light) / <alpha-value>)',
        'cm-amber': 'rgb(var(--cm-amber) / <alpha-value>)',
        'cm-amber-light': 'rgb(var(--cm-amber-light) / <alpha-value>)',
        'cm-red': 'rgb(var(--cm-red) / <alpha-value>)',
        'cm-blue': 'rgb(var(--cm-blue) / <alpha-value>)',
        'cm-blue-light': 'rgb(var(--cm-blue-light) / <alpha-value>)',
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

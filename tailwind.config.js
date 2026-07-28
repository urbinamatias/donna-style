/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/views/**/*.ejs', './src/public/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        brand: 'var(--brand)',
        brandTo: 'var(--brand-to)',
        brandInk: 'var(--brand-ink)',
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        border: 'var(--border)',
        borderStrong: 'var(--border-strong)',
        textMuted: 'var(--text-muted)',
        text: 'var(--text)',
        success: 'var(--success)',
        error: 'var(--error)',
      },
    },
  },
  plugins: [],
};

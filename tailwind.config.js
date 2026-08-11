/** @type {import('tailwindcss').Config} */
module.exports = {
  // `src/services/**/*.js` (fase 6c, bug real: clases Tailwind ensambladas
  // como string en `orders-status.js` — ej. `bg-success`, `border-amber-300`
  // — nunca se generaban porque Tailwind solo escaneaba vistas/JS de
  // cliente. El botón "Confirmar" salía transparente y los badges de
  // Pendiente/Confirmado sin relleno, sin ningún error visible.
  content: ['./src/views/**/*.ejs', './src/public/js/**/*.js', './src/services/**/*.js'],
  theme: {
    extend: {
      fontFamily: {
        brand: ['Merriweather', 'Georgia', 'serif'],
      },
      colors: {
        brand: 'var(--brand)',
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

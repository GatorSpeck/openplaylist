/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {
      colors: {
        accent: '#646cff',
        'accent-hover': '#535bf2',
        surface: '#ffffff',
        'surface-subtle': '#f5f5f5',
        'surface-muted': '#f9f9f9',
        'surface-dark': '#242424',
        'surface-dark-elevated': '#1a1a1a',
        text: '#213547',
        'text-dark': 'rgba(255, 255, 255, 0.87)',
        border: 'rgba(0, 0, 0, 0.1)',
        'row-alt': '#f9f9f9',
      },
      spacing: {
        row: '50px',
      },
      fontSize: {
        xs: ['0.75rem', { lineHeight: '1rem' }],
        sm: ['0.875rem', { lineHeight: '1.25rem' }],
        base: ['1rem', { lineHeight: '1.5rem' }],
        lg: ['1.125rem', { lineHeight: '1.75rem' }],
        xl: ['1.25rem', { lineHeight: '1.75rem' }],
      },
      fontWeight: {
        normal: '400',
        medium: '500',
        semibold: '600',
        bold: '700',
      },
      borderRadius: {
        sm: '2px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        sm: '0 2px 8px rgba(0, 0, 0, 0.1)',
        md: '0 4px 12px rgba(33, 150, 243, 0.4)',
        lg: '0 6px 16px rgba(33, 150, 243, 0.5)',
      },
    },
  },
  plugins: [],
};

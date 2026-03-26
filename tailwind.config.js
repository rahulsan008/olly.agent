import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        olly: {
          bg:       '#1f1f1b',
          surface:  '#262622',
          surface2: '#2e2e2a',
          surface3: '#35352f',
          text:     '#ece9df',
          muted:    '#a8a499',
          accent:   '#915738',
          accentH:  '#a36542',
          border:   '#3a3a34',
          danger:   '#ff8d8d',
          user:     '#35352f',
          asst:     '#24241f',
        }
      },
      backgroundImage: {
        'olly-bg': 'radial-gradient(circle at top right, #2b2b26 0%, #1f1f1b 45%, #1b1b18 100%)'
      }
    }
  },
  plugins: [typography]
};

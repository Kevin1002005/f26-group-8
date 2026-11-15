import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // "npm run build" squeezes the code libraries we use (React, react-router,
  // Supabase...) into a few files and drops their copyright notices. Their
  // licenses (MIT and similar) ask for those notices to come along, so this
  // writes all of them into dist/third-party-licenses.txt, which the live site
  // serves at yoursite.com/third-party-licenses.txt (the About page's footer
  // links to it). It's made fresh on every build, so it's never out of date
  build: {
    license: { fileName: 'third-party-licenses.txt' },
  },
  // When frontend calls /api/, vite passes it onto the backend
  // on port 3000. the browser thinks its the same website,
  // so it doesn't block it and we dont have to change the backend server
  server: { 
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});

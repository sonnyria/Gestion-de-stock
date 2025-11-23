import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // 'base' définit le chemin racine. 
  // Pour GitHub Pages: '/Gestion-de-stock/'
  // Pour Vercel: '/' ou './' pour être relatif.
  // './' est le plus sûr pour fonctionner partout.
  base: '/Gestion-de-stock/', 
  build: {
    outDir: 'dist',
    sourcemap: true
  },
  server: {
    port: 3000
  }
});
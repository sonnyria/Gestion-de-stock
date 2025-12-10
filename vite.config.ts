import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // Important pour GitHub Pages : permet aux assets de charger avec des chemins relatifs
  base: './', 
  build: {
    outDir: 'dist',
  }
});
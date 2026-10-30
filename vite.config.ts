import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: { rollupOptions: { output: { manualChunks(id) {
    if (id.includes('node_modules/@supabase/')) return 'supabase';
    if (/node_modules\/(react|react-dom|scheduler)\//.test(id.replaceAll('\\', '/'))) return 'react';
  } } } },
});

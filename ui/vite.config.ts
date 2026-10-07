import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// fixtures/ lives one level up, next to lexemes.md.
export default defineConfig({ plugins: [react()], server: { fs: { allow: ['..'] } } });

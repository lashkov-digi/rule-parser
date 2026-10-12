import { lezer } from '@lezer/generator/rollup';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// fixtures/ lives one level up, next to lexemes.md. lezer() compiles *.grammar imports into parsers.
export default defineConfig({ plugins: [react(), lezer()], server: { fs: { allow: ['..'] } } });

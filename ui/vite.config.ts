import { lezer } from '@lezer/generator/rollup';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { ohmGrammars } from './ohm.ts';

// fixtures/ lives one level up, next to lexemes.md. lezer() compiles *.grammar imports into parsers,
// ohmGrammars() compiles *.ohm imports into grammars.
export default defineConfig({ plugins: [react(), lezer(), ohmGrammars()], server: { fs: { allow: ['..'] } } });

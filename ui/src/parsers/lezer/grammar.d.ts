// Vite compiles *.grammar files with @lezer/generator/rollup (see vite.config.ts).
declare module '*.grammar' {
  export const parser: import('@lezer/lr').LRParser;
}

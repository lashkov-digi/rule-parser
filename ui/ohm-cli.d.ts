// ohm.ts reuses the type generator behind `ohm generateBundles --withTypes`. The CLI ships it untyped.
declare module '@ohm-js/cli/src/helpers/generateTypes.js' {
  export function generateTypes(grammars: Record<string, import('ohm-js').Grammar>): string;
}

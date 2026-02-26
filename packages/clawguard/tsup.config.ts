import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/lib.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  // Native modules must remain external — their bindings are resolved at runtime
  // by Node.js module resolution from node_modules, not bundled.
  external: ['better-sqlite3', 'keytar'],
});

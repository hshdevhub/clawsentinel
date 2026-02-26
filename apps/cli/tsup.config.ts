import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs'],
  outExtension: () => ({ js: '.cjs' }),
  dts: true,
  clean: true
});

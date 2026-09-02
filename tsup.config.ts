import { defineConfig } from 'tsup';

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	bundle: true,
	splitting: false,
	sourcemap: true,
	clean: false,
	outDir: 'dist',
	outExtension: () => ({ js: '.mjs' }),
	dts: false,
	target: 'node18',
});

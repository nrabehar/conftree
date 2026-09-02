const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = tseslint.config(
	{
		ignores: ['dist/**', 'node_modules/**'],
	},
	js.configs.recommended,
	{
		files: ['src/**/*.ts', 'bench/**/*.ts'],
		extends: [...tseslint.configs.recommendedTypeChecked],
		languageOptions: {
			parserOptions: {
				projectService: true,
				tsconfigRootDir: __dirname,
			},
		},
		rules: {
			'@typescript-eslint/no-floating-promises': 'error',
			'@typescript-eslint/no-misused-promises': 'error',
			'@typescript-eslint/consistent-type-imports': 'error',
		},
	},
	{
		files: ['*.config.js'],
		languageOptions: {
			sourceType: 'commonjs',
			globals: {
				require: 'readonly',
				module: 'writable',
				__dirname: 'readonly',
				process: 'readonly',
			},
		},
	},
	{
		files: ['**/*.spec.ts'],
		rules: {
			'@typescript-eslint/no-explicit-any': 'off',
			'@typescript-eslint/no-unsafe-assignment': 'off',
			'@typescript-eslint/no-unsafe-member-access': 'off',
			'@typescript-eslint/no-unsafe-argument': 'off',
			'@typescript-eslint/no-unsafe-call': 'off',
			'@typescript-eslint/unbound-method': 'off',
		},
	},
	{
		files: [
			'src/storage/memory-storage.ts',
			'src/hierarchy/scope-hierarchy.ts',
		],
		rules: {
			'@typescript-eslint/require-await': 'off',
		},
	},
);

import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import type { UserConfig as VitestUserConfig } from 'vitest/config';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 5173,
		host: true
	},
	preview: {
		port: 4173,
		host: true
	},
	test: {
		coverage: {
			provider: 'v8',
			reporter: ['text', 'html'],
			lines: 60,
			functions: 60,
			branches: 50,
			statements: 60
		}
	} as VitestUserConfig['test']
});



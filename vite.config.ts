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
			lines: 65,
			functions: 65,
			branches: 55,
			statements: 65
		}
	} as VitestUserConfig['test']
});



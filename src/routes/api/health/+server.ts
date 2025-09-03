import { json } from '@sveltejs/kit';
import { validateStartup } from '$lib/startup';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const validation = await validateStartup();
		
		const healthStatus = {
			ok: validation.success,
			status: validation.success ? 'healthy' : 'unhealthy',
			timestamp: new Date().toISOString(),
			errors: validation.errors,
			warnings: validation.warnings,
			environment: {
				valid: validation.errors.length === 0,
				errors: validation.errors,
				warnings: validation.warnings
			},
			services: validation.services,
			uptime: process.uptime ? Math.floor(process.uptime()) : null
		};
		
		const statusCode = validation.success ? 200 : 503;
		// Best-effort metric (optional)
		try {
			const mod: any = await import('$lib/metrics').catch(() => ({}));
			if (mod && typeof mod.recordMetric === 'function') {
				mod.recordMetric('health_check', statusCode === 200 ? 1 : 0, { errors: validation.errors, warnings: validation.warnings });
			}
		} catch {}
		
		return json(healthStatus, { status: statusCode });
	} catch (error) {
		console.error('Health check failed:', error);
		
		return json({
			ok: false,
			status: 'error',
			timestamp: new Date().toISOString(),
			error: error instanceof Error ? error.message : 'Unknown error',
			errors: ['Health check failed'],
			warnings: [],
			environment: { valid: false, errors: ['Health check failed'], warnings: [] },
			services: { supabase: false, stripe: false },
			uptime: null
		}, { status: 500 });
	}
};

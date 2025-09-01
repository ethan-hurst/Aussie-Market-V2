import { json } from '@sveltejs/kit';
import { validateStartup } from '$lib/startup';
import { recordMetric } from '$lib/metrics';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async () => {
	try {
		const validation = await validateStartup();
		
		const healthStatus = {
			status: validation.success ? 'healthy' : 'unhealthy',
			timestamp: new Date().toISOString(),
			environment: {
				valid: validation.errors.length === 0,
				errors: validation.errors,
				warnings: validation.warnings
			},
			services: validation.services,
			uptime: process.uptime ? Math.floor(process.uptime()) : null
		};
		
		const statusCode = validation.success ? 200 : 503;
		// Best-effort metric
		recordMetric('health_check', statusCode === 200 ? 1 : 0, { errors: validation.errors, warnings: validation.warnings });
		
		return json(healthStatus, { status: statusCode });
	} catch (error) {
		console.error('Health check failed:', error);
		
		return json({
			status: 'error',
			timestamp: new Date().toISOString(),
			error: error instanceof Error ? error.message : 'Unknown error',
			environment: { valid: false, errors: ['Health check failed'], warnings: [] },
			services: { supabase: false, stripe: false },
			uptime: null
		}, { status: 500 });
	}
};

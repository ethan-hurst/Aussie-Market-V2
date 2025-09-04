import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { supabase } from '$lib/supabase';

export const GET: RequestHandler = async () => {
	try {
		// Check if the end_expired_auctions function exists
		const { data: functionExists, error: functionError } = await supabase
			.rpc('check_function_exists', { function_name: 'end_expired_auctions' });

		if (functionError) {
			// Fallback: try to call the function directly
			const { data: testResult, error: testError } = await supabase
				.rpc('end_expired_auctions');

			return json({
				success: true,
				function_exists: !testError,
				function_error: testError?.message || null,
				test_result: testResult,
				message: testError ? 'Function exists but may have issues' : 'Function working correctly'
			});
		}

		// Check pg_cron extension
		const { data: cronExtension, error: cronError } = await supabase
			.from('pg_extension')
			.select('*')
			.eq('extname', 'pg_cron')
			.single();

		// Check cron jobs (this might not work due to permissions)
		let cronJobs = null;
		let cronJobsError = null;
		try {
			const { data: jobs, error: jobsError } = await supabase
				.from('cron.job')
				.select('jobid, jobname, schedule, command, active')
				.like('jobname', '%end_expired_auctions%');
			
			cronJobs = jobs;
			cronJobsError = jobsError;
		} catch (err) {
			cronJobsError = err;
		}

		return json({
			success: true,
			function_exists: functionExists,
			cron_extension: cronExtension,
			cron_jobs: cronJobs,
			cron_jobs_error: cronJobsError?.message || null,
			message: 'Cron status check completed'
		});

	} catch (error) {
		console.error('Cron status check failed:', error);
		return json({
			success: false,
			error: error instanceof Error ? error.message : 'Unknown error',
			message: 'Failed to check cron status'
		}, { status: 500 });
	}
};

<script lang="ts">
	import { page } from '$app/stores';
	import { dev } from '$app/environment';
	import { AlertTriangle, RefreshCw, Home, Settings } from 'lucide-svelte';
	import { goto } from '$app/navigation';

	let error: any;
	let status: number;

	$: error = $page.error;
	$: status = $page.status;

	function isEnvironmentError(error: any): boolean {
		return error?.message?.includes('Environment') || 
			   error?.message?.includes('SUPABASE') || 
			   error?.message?.includes('STRIPE');
	}

	function retry() {
		goto($page.url.pathname + $page.url.search);
	}
</script>

<svelte:head>
	<title>Error {status} - Aussie Market</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<div class="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
				<AlertTriangle class="w-8 h-8 text-red-600" />
			</div>
			<h1 class="text-3xl font-bold text-gray-900">
				{status === 404 ? 'Page Not Found' : 'Something went wrong'}
			</h1>
			<p class="text-gray-600 mt-2">
				{status === 404 
					? "The page you're looking for doesn't exist."
					: 'We encountered an unexpected error.'
				}
			</p>
		</div>

		{#if error && dev}
			<div class="bg-red-50 border border-red-200 rounded-md p-4">
				<h3 class="text-sm font-medium text-red-800 mb-2">Development Error Details</h3>
				<p class="text-sm text-red-700 font-mono whitespace-pre-wrap">{error.message}</p>
				
				{#if isEnvironmentError(error)}
					<div class="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded">
						<h4 class="text-sm font-medium text-yellow-800 mb-1">Environment Configuration Issue</h4>
						<p class="text-sm text-yellow-700">
							This appears to be an environment configuration error. 
							Check your .env file and ensure all required variables are set.
						</p>
						<div class="mt-2">
							<a href="/api/health" target="_blank" class="text-sm text-yellow-800 underline">
								Check Health Status
							</a>
						</div>
					</div>
				{/if}
			</div>
		{/if}

		<div class="space-y-4">
			{#if status === 404}
				<a href="/" class="btn-primary w-full flex items-center justify-center">
					<Home class="w-4 h-4 mr-2" />
					Go Home
				</a>
			{:else}
				<button on:click={retry} class="btn-primary w-full flex items-center justify-center">
					<RefreshCw class="w-4 h-4 mr-2" />
					Try Again
				</button>
				
				<a href="/" class="btn btn-outline w-full flex items-center justify-center">
					<Home class="w-4 h-4 mr-2" />
					Go Home
				</a>
			{/if}
			
			{#if dev && isEnvironmentError(error)}
				<a href="/api/health" target="_blank" class="btn btn-ghost w-full flex items-center justify-center">
					<Settings class="w-4 h-4 mr-2" />
					Check Configuration
				</a>
			{/if}
		</div>

		{#if !dev}
			<div class="text-center">
				<p class="text-sm text-gray-500">
					If this problem persists, please contact support.
				</p>
			</div>
		{/if}
	</div>
</div>

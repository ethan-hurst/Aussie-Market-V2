<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { CheckCircle, AlertCircle, Clock, Shield, XCircle } from 'lucide-svelte';
	import { mapApiErrorToMessage } from '$lib/errors';
	import { toastError, toastSuccess, toastInfo } from '$lib/toast';
	import { safeFetch } from '$lib/http';

	let loading = true;
	let verificationStatus = '';
	let error = '';
	let sessionId = '';

	onMount(async () => {
		// Get session_id from URL params
		const urlParams = new URLSearchParams(window.location.search);
		sessionId = urlParams.get('session_id') || '';
		const userId = urlParams.get('user_id') || '';

		if (!sessionId || !userId) {
			error = 'Invalid verification session';
			loading = false;
			return;
		}

		// Check verification status
		await checkVerificationStatus(sessionId, userId);
	});

	async function checkVerificationStatus(sessionId: string, userId: string) {
		try {
			const response = await safeFetch(`/api/kyc?session_id=${sessionId}&user_id=${userId}`);
			const data = await response.json();

			if (response.ok) {
				verificationStatus = data.status;
				if (verificationStatus === 'verified') {
					toastSuccess('KYC verified — you can now sell.');
				} else if (verificationStatus === 'pending') {
					toastInfo("Verification pending. We'll update you shortly.");
				} else if (verificationStatus === 'requires_input') {
					toastError('Verification requires additional information.');
				}
			} else {
				const friendly = mapApiErrorToMessage(data);
				error = friendly || 'Failed to check verification status';
				toastError(error);
			}
		} catch (err) {
			console.error('Error checking verification status:', err);
			const friendly = mapApiErrorToMessage(err);
			error = friendly || 'Failed to check verification status';
			toastError(error);
		} finally {
			loading = false;
		}
	}

	function getStatusIcon(status: string) {
		switch (status) {
			case 'verified':
				return CheckCircle;
			case 'requires_input':
				return AlertCircle;
			case 'pending':
				return Clock;
			default:
				return Shield;
		}
	}

	function getStatusColor(status: string) {
		switch (status) {
			case 'verified':
				return 'text-success-600 bg-success-50';
			case 'requires_input':
				return 'text-error-600 bg-error-50';
			case 'pending':
				return 'text-warning-600 bg-warning-50';
			default:
				return 'text-gray-600 bg-gray-50';
		}
	}

	function getStatusMessage(status: string) {
		switch (status) {
			case 'verified':
				return 'Your identity has been successfully verified!';
			case 'requires_input':
				return 'Additional information is required to complete verification.';
			case 'pending':
				return 'Your verification is being processed. This may take a few minutes.';
			default:
				return 'Verification status unknown.';
		}
	}
</script>

<svelte:head>
	<title>KYC Verification Complete - Aussie Market</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div class="text-center">
			<div class="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
				<Shield class="w-8 h-8 text-primary-600" />
			</div>
			<h1 class="text-3xl font-bold text-gray-900">Verification Complete</h1>
			<p class="text-gray-600 mt-2">
				Your identity verification process has been completed
			</p>
		</div>

		{#if loading}
			<div class="text-center">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
				<p class="text-gray-600 mt-4">Checking verification status...</p>
			</div>
		{:else if error}
			<div class="bg-red-50 border border-red-200 rounded-md p-4">
				<div class="flex">
					<AlertCircle class="h-5 w-5 text-red-400" />
					<div class="ml-3">
						<p class="text-sm text-red-700">{error}</p>
					</div>
				</div>
			</div>
			<div class="text-center">
				<a href="/account/kyc" class="btn-primary">
					Try Again
				</a>
			</div>
		{:else}
			<div class="bg-white shadow rounded-lg p-6">
				<div class="text-center">
					{#if verificationStatus === 'verified'}
						<CheckCircle class="mx-auto h-12 w-12 text-green-400 mb-4" />
					{:else if verificationStatus === 'pending'}
						<Clock class="mx-auto h-12 w-12 text-blue-400 mb-4" />
					{:else if verificationStatus === 'requires_input'}
						<AlertCircle class="mx-auto h-12 w-12 text-yellow-400 mb-4" />
					{:else}
						<XCircle class="mx-auto h-12 w-12 text-red-400 mb-4" />
					{/if}
					
					<h2 class="text-lg font-medium text-gray-900 mb-2">
						Verification Status
					</h2>
					
					<span class="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium {getStatusColor(verificationStatus)}">
						{verificationStatus.toUpperCase()}
					</span>
					
					<p class="text-gray-600 mt-4">
						{getStatusMessage(verificationStatus)}
					</p>
				</div>

				{#if verificationStatus === 'verified'}
					<div class="mt-6 bg-green-50 border border-green-200 rounded-md p-4">
						<div class="flex">
							<CheckCircle class="h-5 w-5 text-green-400" />
							<div class="ml-3">
								<h3 class="text-sm font-medium text-green-800">
									Verification Successful
								</h3>
								<p class="text-sm text-green-700 mt-1">
									Your identity has been verified and you can now start selling on Aussie Market.
								</p>
							</div>
						</div>
					</div>

					<div class="mt-6 space-y-3">
						<a href="/account" class="btn btn-outline w-full">
							Back to Account
						</a>
						<a href="/sell/new" class="btn-primary w-full">
							Start Selling
						</a>
					</div>
				{:else if verificationStatus === 'requires_input'}
					<div class="mt-6 bg-yellow-50 border border-yellow-200 rounded-md p-4">
						<div class="flex">
							<AlertCircle class="h-5 w-5 text-yellow-400" />
							<div class="ml-3">
								<h3 class="text-sm font-medium text-yellow-800">
									Additional Information Required
								</h3>
								<p class="text-sm text-yellow-700 mt-1">
									Please provide additional information to complete your verification.
								</p>
							</div>
						</div>
					</div>

					<div class="mt-6 space-y-3">
						<a href="/account/kyc" class="btn-primary w-full">
							Complete Verification
						</a>
						<a href="/account" class="btn btn-outline w-full">
							Back to Account
						</a>
					</div>
				{:else if verificationStatus === 'pending'}
					<div class="mt-6 bg-blue-50 border border-blue-200 rounded-md p-4">
						<div class="flex">
							<Clock class="h-5 w-5 text-blue-400" />
							<div class="ml-3">
								<h3 class="text-sm font-medium text-blue-800">
									Processing
								</h3>
								<p class="text-sm text-blue-700 mt-1">
									Your verification is being processed. You'll receive an email when it's complete.
								</p>
							</div>
						</div>
					</div>

					<div class="mt-6 space-y-3">
						<a href="/account" class="btn-primary w-full">
							Back to Account
						</a>
					</div>
				{:else}
					<div class="mt-6 bg-gray-50 border border-gray-200 rounded-md p-4">
						<div class="flex">
							<Shield class="h-5 w-5 text-gray-400" />
							<div class="ml-3">
								<h3 class="text-sm font-medium text-gray-800">
									Unknown Status
								</h3>
								<p class="text-sm text-gray-700 mt-1">
									We couldn't determine your verification status. Please contact support.
								</p>
							</div>
						</div>
					</div>

					<div class="mt-6 space-y-3">
						<a href="/account/kyc" class="btn-primary w-full">
							Try Again
						</a>
						<a href="/account" class="btn btn-outline w-full">
							Back to Account
						</a>
					</div>
				{/if}
			</div>
		{/if}
	</div>
</div>

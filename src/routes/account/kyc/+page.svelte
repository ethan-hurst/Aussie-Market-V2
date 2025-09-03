<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Shield, CheckCircle, AlertCircle, Clock, ExternalLink } from 'lucide-svelte';
	import { mapApiErrorToMessage } from '$lib/errors';
	import { toastError, toastSuccess } from '$lib/toast';

	let user: any = null;
	let userProfile: any = null;
	let loading = true;
	let startingVerification = false;
	let error = '';
	let success = '';

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) {
			goto('/login');
			return;
		}

		user = session.user;
		await loadUserProfile();
		loading = false;
	});

	async function loadUserProfile() {
		const { data, error } = await supabase
			.from('users')
			.select('*')
			.eq('id', user.id)
			.single();

		if (error) {
			console.error('Error loading profile:', error);
			return;
		}

		userProfile = data;
	}

	async function startStripeVerification() {
		startingVerification = true;
		error = '';

		try {
			// Use the real KYC verification function
			const { startKYCVerification } = await import('$lib/auth');
			
			const kycData = {
				legal_name: userProfile.legal_name,
				dob: userProfile.dob,
				address: {
					street: userProfile.address?.street || '',
					suburb: userProfile.address?.suburb || '',
					postcode: userProfile.address?.postcode || '',
					state: userProfile.address?.state || ''
				}
			};

			const result = await startKYCVerification(user.id, kycData);

			if (result.success) {
				toastSuccess('Verification started. Follow the prompts.');
				// Redirect to Stripe Identity verification
				window.location.href = result.verificationUrl;
			} else {
				const friendly = mapApiErrorToMessage(result);
				error = friendly || 'Failed to start verification';
				toastError(error);
			}
		} catch (err) {
			console.error('Verification error:', err);
			const friendly = mapApiErrorToMessage(err);
			error = friendly || 'Failed to start verification process';
			toastError(error);
		} finally {
			startingVerification = false;
		}
	}

	function getKYCStatusColor(status: string) {
		switch (status) {
			case 'passed': return 'text-success-600 bg-success-50';
			case 'pending': return 'text-warning-600 bg-warning-50';
			case 'failed': return 'text-error-600 bg-error-50';
			default: return 'text-gray-600 bg-gray-50';
		}
	}

	function getKYCStatusIcon(status: string) {
		switch (status) {
			case 'passed': return CheckCircle;
			case 'pending': return Clock;
			case 'failed': return AlertCircle;
			default: return Shield;
		}
	}
</script>

<svelte:head>
	<title>KYC Verification - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else}
	<div class="max-w-2xl mx-auto space-y-8">
		<!-- Header -->
		<div class="text-center">
			<div class="mx-auto w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mb-4">
				<Shield class="w-8 h-8 text-primary-600" />
			</div>
			<h1 class="text-3xl font-bold text-gray-900">Identity Verification</h1>
			<p class="text-gray-600 mt-2">
				Complete your identity verification to start selling on Aussie Market
			</p>
		</div>

		<!-- Current Status -->
		{#if userProfile?.kyc !== 'none'}
			<div class="card">
				<div class="card-content">
						<div class="flex items-center space-x-3">
							<svelte:component this={getKYCStatusIcon(userProfile?.kyc)} class="w-6 h-6 text-gray-400" />
						<div>
							<h3 class="text-lg font-medium text-gray-900">Verification Status</h3>
							<span class="px-3 py-1 text-sm font-medium rounded-md {getKYCStatusColor(userProfile?.kyc)}">
								{userProfile?.kyc?.toUpperCase() || 'NONE'}
							</span>
						</div>
					</div>
					
					{#if userProfile?.kyc === 'pending'}
						<p class="text-sm text-gray-600 mt-2">
							Your verification is being reviewed. This typically takes a few minutes to process.
						</p>
					{:else if userProfile?.kyc === 'passed'}
						<p class="text-sm text-success-600 mt-2">
							Your identity has been verified! You can now create listings and start selling.
						</p>
					{:else if userProfile?.kyc === 'failed'}
						<p class="text-sm text-error-600 mt-2">
							Your verification was not approved. Please try again with correct information.
						</p>
					{/if}
				</div>
			</div>
		{/if}

		{#if error}
			<div class="bg-red-50 border border-red-200 rounded-md p-4">
				<div class="flex">
					<AlertCircle class="h-5 w-5 text-red-400" />
					<div class="ml-3">
						<p class="text-sm text-red-700">{error}</p>
					</div>
				</div>
			</div>
		{/if}

		{#if success}
			<div class="bg-green-50 border border-green-200 rounded-md p-4">
				<div class="flex">
					<CheckCircle class="h-5 w-5 text-green-400" />
					<div class="ml-3">
						<p class="text-sm text-green-700">{success}</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Verification Options -->
		{#if userProfile?.kyc === 'none' || userProfile?.kyc === 'failed'}
			<div class="card">
				<div class="card-header">
					<h2 class="card-title">Start Verification</h2>
					<p class="card-description">
						We use Stripe Identity to securely verify your identity. This process is quick and secure.
					</p>
				</div>

				<div class="card-content space-y-6">
					<!-- Prerequisites -->
					<div class="bg-blue-50 border border-blue-200 rounded-md p-4">
						<h4 class="text-sm font-medium text-blue-900 mb-2">Before You Start</h4>
						<ul class="text-sm text-blue-700 space-y-1">
							<li>• Ensure your profile information is up to date</li>
							<li>• Have a valid government ID ready (driver's license, passport, or ID card)</li>
							<li>• Be in a well-lit area for document photos</li>
							<li>• Allow 5-10 minutes to complete the process</li>
						</ul>
					</div>

					<!-- Profile Check -->
					<div class="space-y-4">
						<h3 class="text-lg font-medium text-gray-900">Profile Information</h3>
						
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Legal Name</label>
								<p class="text-sm text-gray-900">
									{userProfile?.legal_name || 'Not provided'}
								</p>
							</div>
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-1">Date of Birth</label>
								<p class="text-sm text-gray-900">
									{userProfile?.dob ? new Date(userProfile.dob).toLocaleDateString('en-AU') : 'Not provided'}
								</p>
							</div>
						</div>

						<div>
							<label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
							<p class="text-sm text-gray-900">
								{userProfile?.address?.street ? 
									`${userProfile.address.street}, ${userProfile.address.suburb} ${userProfile.address.state} ${userProfile.address.postcode}` :
									'Not provided'
								}
							</p>
						</div>

						{#if !userProfile?.legal_name || !userProfile?.dob || !userProfile?.address?.street}
							<div class="bg-yellow-50 border border-yellow-200 rounded-md p-4">
								<div class="flex">
									<AlertCircle class="h-5 w-5 text-yellow-400" />
									<div class="ml-3">
										<h4 class="text-sm font-medium text-yellow-800">
											Profile Information Required
										</h4>
										<p class="text-sm text-yellow-700 mt-1">
											Please update your profile information before starting verification.
										</p>
									</div>
								</div>
							</div>
						{/if}
					</div>

					<!-- Start Verification -->
					<div class="space-y-4">
						<button
							on:click={startStripeVerification}
							disabled={startingVerification || !userProfile?.legal_name || !userProfile?.dob || !userProfile?.address?.street}
							class="btn-primary w-full"
						>
							{startingVerification ? 'Starting Verification...' : 'Start Identity Verification'}
							<ExternalLink class="w-4 h-4 ml-2" />
						</button>

						<p class="text-xs text-gray-500 text-center">
							By starting verification, you agree to our verification terms and privacy policy.
						</p>
					</div>
				</div>
			</div>
		{/if}

		<!-- Next Steps -->
		{#if userProfile?.kyc === 'passed'}
			<div class="card">
				<div class="card-content">
					<h3 class="text-lg font-medium text-gray-900 mb-4">Next Steps</h3>
					<div class="space-y-4">
						<div class="flex items-start space-x-3">
							<div class="w-6 h-6 bg-success-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
								<CheckCircle class="w-4 h-4 text-success-600" />
							</div>
							<div>
								<h4 class="text-sm font-medium text-gray-900">Identity Verified</h4>
								<p class="text-sm text-gray-600">Your identity has been successfully verified.</p>
							</div>
						</div>
						<div class="flex items-start space-x-3">
							<div class="w-6 h-6 bg-primary-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
								<span class="text-xs font-medium text-primary-600">2</span>
							</div>
							<div>
								<h4 class="text-sm font-medium text-gray-900">Set Up Payout Account</h4>
								<p class="text-sm text-gray-600">Connect your bank account to receive payments from sales.</p>
							</div>
						</div>
						<div class="flex items-start space-x-3">
							<div class="w-6 h-6 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
								<span class="text-xs font-medium text-gray-600">3</span>
							</div>
							<div>
								<h4 class="text-sm font-medium text-gray-900">Start Selling</h4>
								<p class="text-sm text-gray-600">Create your first listing and start earning money!</p>
							</div>
						</div>
					</div>
					<div class="mt-6">
						<a href="/sell/new" class="btn-primary">
							Create Your First Listing
						</a>
					</div>
				</div>
			</div>
		{/if}

		<!-- Security Information -->
		<div class="card">
			<div class="card-header">
				<h3 class="card-title">Security & Privacy</h3>
			</div>
			<div class="card-content">
				<div class="space-y-4">
					<div>
						<h4 class="text-sm font-medium text-gray-900 mb-2">How It Works</h4>
						<p class="text-sm text-gray-600">
							We use Stripe Identity, a secure third-party service, to verify your identity. 
							This involves uploading a photo of your government ID and taking a selfie for comparison.
						</p>
					</div>
					<div>
						<h4 class="text-sm font-medium text-gray-900 mb-2">Data Protection</h4>
						<p class="text-sm text-gray-600">
							Your personal information is encrypted and securely stored. We only use this information 
							for identity verification purposes and to comply with legal requirements.
						</p>
					</div>
					<div>
						<h4 class="text-sm font-medium text-gray-900 mb-2">Verification Time</h4>
						<p class="text-sm text-gray-600">
							Most verifications are completed within a few minutes. In some cases, additional review 
							may be required, which can take up to 24 hours.
						</p>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

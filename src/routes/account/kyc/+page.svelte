<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { startKYCVerification, type KYCVerificationData } from '$lib/auth';
	import { User, Calendar, MapPin, Shield, CheckCircle, AlertCircle } from 'lucide-svelte';

	let user: any = null;
	let userProfile: any = null;
	let loading = true;
	let submitting = false;
	let error = '';
	let success = '';

	// Form data
	let legalName = '';
	let dob = '';
	let address = {
		street: '',
		suburb: '',
		postcode: '',
		state: ''
	};

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
		legalName = data.legal_name || '';
		dob = data.dob || '';
		address = data.address || {
			street: '',
			suburb: '',
			postcode: '',
			state: ''
		};
	}

	async function handleSubmit() {
		submitting = true;
		error = '';

		try {
			// Validate form
			if (!legalName || !dob || !address.street || !address.suburb || !address.postcode || !address.state) {
				error = 'Please fill in all required fields';
				return;
			}

			const kycData: KYCVerificationData = {
				legal_name: legalName,
				dob,
				address
			};

			const result = await startKYCVerification(user.id, kycData);
			
			if (result.success) {
				success = 'KYC verification submitted successfully! We will review your information and update your status within 24-48 hours.';
				await loadUserProfile(); // Refresh profile to show pending status
			}
		} catch (err) {
			error = 'Failed to submit KYC verification. Please try again.';
			console.error('KYC submission error:', err);
		} finally {
			submitting = false;
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
			case 'pending': return AlertCircle;
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
						{@const StatusIcon = getKYCStatusIcon(userProfile?.kyc)}
						<StatusIcon class="w-6 h-6 text-gray-400" />
						<div>
							<h3 class="text-lg font-medium text-gray-900">Verification Status</h3>
							<span class="px-3 py-1 text-sm font-medium rounded-md {getKYCStatusColor(userProfile?.kyc)}">
								{userProfile?.kyc?.toUpperCase() || 'NONE'}
							</span>
						</div>
					</div>
					
					{#if userProfile?.kyc === 'pending'}
						<p class="text-sm text-gray-600 mt-2">
							Your verification is being reviewed. This typically takes 24-48 hours.
						</p>
					{:else if userProfile?.kyc === 'passed'}
						<p class="text-sm text-success-600 mt-2">
							Your identity has been verified! You can now create listings and start selling.
						</p>
					{:else if userProfile?.kyc === 'failed'}
						<p class="text-sm text-error-600 mt-2">
							Your verification was not approved. Please review your information and try again.
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

		<!-- KYC Form -->
		{#if userProfile?.kyc === 'none' || userProfile?.kyc === 'failed'}
			<form on:submit|preventDefault={handleSubmit} class="card">
				<div class="card-header">
					<h2 class="card-title">Personal Information</h2>
					<p class="card-description">
						Please provide your legal information for identity verification
					</p>
				</div>

				<div class="card-content space-y-6">
					<!-- Legal Name -->
					<div>
						<label for="legalName" class="block text-sm font-medium text-gray-700 mb-2">
							Legal Name *
						</label>
						<div class="relative">
							<User class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
							<input
								id="legalName"
								type="text"
								bind:value={legalName}
								required
								class="input pl-10"
								placeholder="Enter your full legal name"
							/>
						</div>
					</div>

					<!-- Date of Birth -->
					<div>
						<label for="dob" class="block text-sm font-medium text-gray-700 mb-2">
							Date of Birth *
						</label>
						<div class="relative">
							<Calendar class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
							<input
								id="dob"
								type="date"
								bind:value={dob}
								required
								class="input pl-10"
							/>
						</div>
					</div>

					<!-- Address -->
					<div>
						<h3 class="text-lg font-medium text-gray-900 mb-4">Address Information</h3>
						<div class="space-y-4">
							<div>
								<label for="street" class="block text-sm font-medium text-gray-700 mb-2">
									Street Address *
								</label>
								<div class="relative">
									<MapPin class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
									<input
										id="street"
										type="text"
										bind:value={address.street}
										required
										class="input pl-10"
										placeholder="Enter your street address"
									/>
								</div>
							</div>

							<div class="grid grid-cols-1 md:grid-cols-3 gap-4">
								<div>
									<label for="suburb" class="block text-sm font-medium text-gray-700 mb-2">
										Suburb *
									</label>
									<input
										id="suburb"
										type="text"
										bind:value={address.suburb}
										required
										class="input"
										placeholder="Enter suburb"
									/>
								</div>

								<div>
									<label for="postcode" class="block text-sm font-medium text-gray-700 mb-2">
										Postcode *
									</label>
									<input
										id="postcode"
										type="text"
										bind:value={address.postcode}
										required
										class="input"
										placeholder="Enter postcode"
									/>
								</div>

								<div>
									<label for="state" class="block text-sm font-medium text-gray-700 mb-2">
										State *
									</label>
									<select
										id="state"
										bind:value={address.state}
										required
										class="input"
									>
										<option value="">Select state</option>
										<option value="NSW">New South Wales</option>
										<option value="VIC">Victoria</option>
										<option value="QLD">Queensland</option>
										<option value="WA">Western Australia</option>
										<option value="SA">South Australia</option>
										<option value="TAS">Tasmania</option>
										<option value="ACT">Australian Capital Territory</option>
										<option value="NT">Northern Territory</option>
									</select>
								</div>
							</div>
						</div>
					</div>

					<!-- Privacy Notice -->
					<div class="bg-blue-50 border border-blue-200 rounded-md p-4">
						<h4 class="text-sm font-medium text-blue-900 mb-2">Privacy & Security</h4>
						<p class="text-sm text-blue-700">
							Your personal information is encrypted and securely stored. We only use this information 
							for identity verification purposes and to comply with legal requirements. We never share 
							your personal data with third parties without your explicit consent.
						</p>
					</div>

					<!-- Submit -->
					<div class="flex justify-end space-x-4">
						<a href="/account" class="btn btn-outline">
							Cancel
						</a>
						<button type="submit" disabled={submitting} class="btn-primary">
							{submitting ? 'Submitting...' : 'Submit Verification'}
						</button>
					</div>
				</div>
			</form>
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
	</div>
{/if}

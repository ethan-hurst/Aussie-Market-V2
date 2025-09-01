<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { User, Shield, CreditCard, Settings, LogOut, Edit, Save, X } from 'lucide-svelte';

	let user: any = null;
	let userProfile: any = null;
	let loading = true;
	let editing = false;
	let saving = false;

	// Form data
	let legalName = '';
	let phone = '';
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
		phone = data.phone || '';
		address = data.address || {
			street: '',
			suburb: '',
			postcode: '',
			state: ''
		};
	}

	async function saveProfile() {
		saving = true;

		const { error } = await supabase
			.from('users')
			.update({
				legal_name: legalName,
				phone: phone,
				address: address
			})
			.eq('id', user.id);

		if (error) {
			console.error('Error saving profile:', error);
		} else {
			editing = false;
			await loadUserProfile();
		}

		saving = false;
	}

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/');
	}

	function formatDate(dateString: string) {
		return new Date(dateString).toLocaleDateString('en-AU');
	}

	function getKYCStatusColor(status: string) {
		switch (status) {
			case 'passed': return 'text-success-600 bg-success-50';
			case 'pending': return 'text-warning-600 bg-warning-50';
			case 'failed': return 'text-error-600 bg-error-50';
			default: return 'text-gray-600 bg-gray-50';
		}
	}
</script>

<svelte:head>
	<title>Account Settings - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else}
	<div class="max-w-4xl mx-auto space-y-8">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<h1 class="text-3xl font-bold text-gray-900">Account Settings</h1>
			<button on:click={handleSignOut} class="btn btn-outline">
				<LogOut class="w-4 h-4 mr-2" />
				Sign Out
			</button>
		</div>

		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Sidebar -->
			<div class="lg:col-span-1">
				<nav class="space-y-2">
					<a href="#profile" class="flex items-center px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-md">
						<User class="w-4 h-4 mr-3" />
						Profile
					</a>
					<a href="#security" class="flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md">
						<Shield class="w-4 h-4 mr-3" />
						Security
					</a>
					<a href="#payments" class="flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md">
						<CreditCard class="w-4 h-4 mr-3" />
						Payment Methods
					</a>
					<a href="#preferences" class="flex items-center px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 rounded-md">
						<Settings class="w-4 h-4 mr-3" />
						Preferences
					</a>
				</nav>
			</div>

			<!-- Main Content -->
			<div class="lg:col-span-2 space-y-8">
				<!-- Profile Section -->
				<section id="profile" class="card">
					<div class="card-header">
						<div class="flex items-center justify-between">
							<div>
								<h2 class="card-title">Profile Information</h2>
								<p class="card-description">Manage your account details and personal information</p>
							</div>
							{#if !editing}
								<button on:click={() => editing = true} class="btn btn-outline btn-sm">
									<Edit class="w-4 h-4 mr-2" />
									Edit
								</button>
							{:else}
								<div class="flex space-x-2">
									<button on:click={saveProfile} disabled={saving} class="btn-primary btn-sm">
										<Save class="w-4 h-4 mr-2" />
										{saving ? 'Saving...' : 'Save'}
									</button>
									<button on:click={() => { editing = false; loadUserProfile(); }} class="btn btn-outline btn-sm">
										<X class="w-4 h-4 mr-2" />
										Cancel
									</button>
								</div>
							{/if}
						</div>
					</div>

					<div class="card-content">
						<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
							<!-- Email (Read-only) -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
								<input type="email" value={user.email} disabled class="input bg-gray-50" />
								<p class="text-sm text-gray-500 mt-1">Email cannot be changed</p>
							</div>

							<!-- Legal Name -->
							<div>
								<label for="legalName" class="block text-sm font-medium text-gray-700 mb-2">Legal Name</label>
								<input
									id="legalName"
									type="text"
									bind:value={legalName}
									disabled={!editing}
									class="input"
									placeholder="Enter your legal name"
								/>
							</div>

							<!-- Phone -->
							<div>
								<label for="phone" class="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
								<input
									id="phone"
									type="tel"
									bind:value={phone}
									disabled={!editing}
									class="input"
									placeholder="Enter your phone number"
								/>
							</div>

							<!-- KYC Status -->
							<div>
								<label class="block text-sm font-medium text-gray-700 mb-2">KYC Status</label>
								<div class="flex items-center">
									<span class="px-3 py-2 text-sm font-medium rounded-md {getKYCStatusColor(userProfile?.kyc)}">
										{userProfile?.kyc?.toUpperCase() || 'NONE'}
									</span>
									{#if userProfile?.kyc === 'none'}
										<a href="/account/kyc" class="ml-3 text-sm text-primary-600 hover:text-primary-500">
											Complete KYC
										</a>
									{/if}
								</div>
							</div>
						</div>

						<!-- Address Section -->
						<div class="mt-6">
							<h3 class="text-lg font-medium text-gray-900 mb-4">Address Information</h3>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div class="md:col-span-2">
									<label for="street" class="block text-sm font-medium text-gray-700 mb-2">Street Address</label>
									<input
										id="street"
										type="text"
										bind:value={address.street}
										disabled={!editing}
										class="input"
										placeholder="Enter street address"
									/>
								</div>
								<div>
									<label for="suburb" class="block text-sm font-medium text-gray-700 mb-2">Suburb</label>
									<input
										id="suburb"
										type="text"
										bind:value={address.suburb}
										disabled={!editing}
										class="input"
										placeholder="Enter suburb"
									/>
								</div>
								<div>
									<label for="postcode" class="block text-sm font-medium text-gray-700 mb-2">Postcode</label>
									<input
										id="postcode"
										type="text"
										bind:value={address.postcode}
										disabled={!editing}
										class="input"
										placeholder="Enter postcode"
									/>
								</div>
								<div>
									<label for="state" class="block text-sm font-medium text-gray-700 mb-2">State</label>
									<select
										id="state"
										bind:value={address.state}
										disabled={!editing}
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

						<!-- Account Info -->
						<div class="mt-6 pt-6 border-t border-gray-200">
							<h3 class="text-lg font-medium text-gray-900 mb-4">Account Information</h3>
							<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Account Type</label>
									<span class="inline-flex items-center px-3 py-2 text-sm font-medium bg-gray-100 text-gray-800 rounded-md">
										{userProfile?.role?.toUpperCase() || 'BUYER'}
									</span>
								</div>
								<div>
									<label class="block text-sm font-medium text-gray-700 mb-2">Member Since</label>
									<span class="text-sm text-gray-900">
										{formatDate(userProfile?.created_at)}
									</span>
								</div>
							</div>
						</div>
					</div>
				</section>

				<!-- Security Section -->
				<section id="security" class="card">
					<div class="card-header">
						<h2 class="card-title">Security Settings</h2>
						<p class="card-description">Manage your account security and privacy</p>
					</div>
					<div class="card-content">
						<div class="space-y-4">
							<div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
								<div>
									<h3 class="font-medium text-gray-900">Change Password</h3>
									<p class="text-sm text-gray-500">Update your account password</p>
								</div>
								<button class="btn btn-outline btn-sm">Change</button>
							</div>
							<div class="flex items-center justify-between p-4 border border-gray-200 rounded-lg">
								<div>
									<h3 class="font-medium text-gray-900">Two-Factor Authentication</h3>
									<p class="text-sm text-gray-500">Add an extra layer of security</p>
								</div>
								<button class="btn btn-outline btn-sm">Enable</button>
							</div>
						</div>
					</div>
				</section>
			</div>
		</div>
	</div>
{/if}

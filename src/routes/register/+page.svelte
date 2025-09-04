<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { goto } from '$app/navigation';
	import { supabase } from '$lib/supabase';
	import { 
		Mail, 
		Lock, 
		Eye, 
		EyeOff, 
		AlertCircle, 
		CheckCircle, 
		User,
		Phone,
		Calendar,
		MapPin
	} from 'lucide-svelte';

	let showPassword = false;
	let showConfirmPassword = false;
	let isSubmitting = false;
	let error = '';
	let success = '';

	// Form data
	let email = '';
	let password = '';
	let confirmPassword = '';
	let legalName = '';
	let phone = '';
	let dob = '';
	let address = {
		street: '',
		suburb: '',
		postcode: '',
		state: ''
	};

	// Get form data from server action
	$: form = $page.form;
	$: formError = form?.error;
	$: formSuccess = form?.success;

	// Update local error/success from form
	$: if (formError) error = formError;
	$: if (formSuccess) success = formSuccess;

	function togglePassword() {
		showPassword = !showPassword;
	}

	function toggleConfirmPassword() {
		showConfirmPassword = !showConfirmPassword;
	}

	function onConfirmPasswordInput(e: Event) {
		confirmPassword = (e.currentTarget as HTMLInputElement).value;
	}

	function onPasswordInput(e: Event) {
		password = (e.currentTarget as HTMLInputElement).value;
	}

	function validateForm() {
		if (!email || !password || !confirmPassword || !legalName) {
			error = 'Please fill in all required fields';
			return false;
		}

		if (password !== confirmPassword) {
			error = 'Passwords do not match';
			return false;
		}

		if (password.length < 8) {
			error = 'Password must be at least 8 characters long';
			return false;
		}

		if (!address.suburb || !address.postcode || !address.state) {
			error = 'Please provide your address details';
			return false;
		}

		return true;
	}

	async function handleSubmit() {
		error = '';
		success = '';

		if (!validateForm()) {
			return;
		}

		isSubmitting = true;

		try {
			// Register user with Supabase Auth
			const { data, error: authError } = await supabase.auth.signUp({
				email,
				password,
				options: {
					data: {
						legal_name: legalName,
						phone: phone || null,
						dob: dob || null,
						address: address
					}
				}
			});

			if (authError) {
				error = authError.message;
				isSubmitting = false;
				return;
			}

			if (data.user) {
				// Create user profile in our users table
				const { error: profileError } = await supabase
					.from('users')
					.insert({
						id: data.user.id,
						email: data.user.email,
						legal_name: legalName,
						phone: phone || null,
						dob: dob || null,
						address: address,
						role: 'buyer' // Default role
					});

				if (profileError) {
					console.error('Error creating user profile:', profileError);
					// Don't fail the registration if profile creation fails
					// The user can complete their profile later
				}

				success = 'Account created successfully! Please check your email to verify your account.';
				
				// Redirect to login after a short delay
				setTimeout(() => {
					goto('/login');
				}, 3000);
			}

		} catch (err) {
			console.error('Registration error:', err);
			error = 'An unexpected error occurred. Please try again.';
		} finally {
			isSubmitting = false;
		}
	}
</script>

<svelte:head>
	<title>Create Account - Aussie Market</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div>
			<div class="flex justify-center">
				<div class="w-12 h-12 bg-primary-600 rounded-lg flex items-center justify-center">
					<span class="text-white font-bold text-xl">A</span>
				</div>
			</div>
			<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
				Create Your Account
			</h2>
			<p class="mt-2 text-center text-sm text-gray-600">
				Join Australia's premier C2C auction platform
			</p>
		</div>

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

		<form on:submit|preventDefault={handleSubmit} class="mt-8 space-y-6">
			<div class="space-y-4">
				<!-- Email -->
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">
						Email Address *
					</label>
					<div class="mt-1 relative">
						<Mail class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="email"
							type="email"
							bind:value={email}
							required
							class="input pl-10"
							placeholder="Enter your email"
						/>
					</div>
				</div>

				<!-- Legal Name -->
				<div>
					<label for="legalName" class="block text-sm font-medium text-gray-700">
						Full Legal Name *
					</label>
					<div class="mt-1 relative">
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

				<!-- Phone -->
				<div>
					<label for="phone" class="block text-sm font-medium text-gray-700">
						Phone Number
					</label>
					<div class="mt-1 relative">
						<Phone class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="phone"
							type="tel"
							bind:value={phone}
							class="input pl-10"
							placeholder="Enter your phone number"
						/>
					</div>
				</div>

				<!-- Date of Birth -->
				<div>
					<label for="dob" class="block text-sm font-medium text-gray-700">
						Date of Birth
					</label>
					<div class="mt-1 relative">
						<Calendar class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="dob"
							type="date"
							bind:value={dob}
							class="input pl-10"
						/>
					</div>
				</div>

				<!-- Address -->
				<div class="space-y-3">
					<label class="block text-sm font-medium text-gray-700">
						Address *
					</label>
					
					<div class="relative">
						<MapPin class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							type="text"
							bind:value={address.street}
							class="input pl-10"
							placeholder="Street address"
						/>
					</div>

					<div class="grid grid-cols-2 gap-3">
						<input
							type="text"
							bind:value={address.suburb}
							required
							class="input"
							placeholder="Suburb"
						/>
						<input
							type="text"
							bind:value={address.postcode}
							required
							class="input"
							placeholder="Postcode"
						/>
					</div>

					<select bind:value={address.state} required class="input">
						<option value="">Select State</option>
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

				<!-- Password -->
				<div>
					<label for="password" class="block text-sm font-medium text-gray-700">
						Password *
					</label>
					<div class="mt-1 relative">
						<Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="password"
							type={showPassword ? 'text' : 'password'}
							value={password}
							on:input={onPasswordInput}
							required
							minlength="8"
							class="input pl-10 pr-10"
							placeholder="Create a password"
						/>
						<button
							type="button"
							on:click={togglePassword}
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
						>
							{#if showPassword}
								<EyeOff class="w-5 h-5" />
							{:else}
								<Eye class="w-5 h-5" />
							{/if}
						</button>
					</div>
				</div>

				<!-- Confirm Password -->
				<div>
					<label for="confirmPassword" class="block text-sm font-medium text-gray-700">
						Confirm Password *
					</label>
					<div class="mt-1 relative">
						<Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="confirmPassword"
							type={showConfirmPassword ? 'text' : 'password'}
							value={confirmPassword}
							on:input={onConfirmPasswordInput}
							required
							class="input pl-10 pr-10"
							placeholder="Confirm your password"
						/>
						<button
							type="button"
							on:click={toggleConfirmPassword}
							class="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
						>
							{#if showConfirmPassword}
								<EyeOff class="w-5 h-5" />
							{:else}
								<Eye class="w-5 h-5" />
							{/if}
						</button>
					</div>
				</div>
			</div>

			<div>
				<button
					type="submit"
					disabled={isSubmitting}
					class="btn-primary w-full flex justify-center py-3"
				>
					{#if isSubmitting}
						<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
						<span class="ml-2">Creating Account...</span>
					{:else}
						Create Account
					{/if}
				</button>
			</div>

			<div class="text-center">
				<p class="text-sm text-gray-600">
					Already have an account?
					<a href="/login" class="font-medium text-primary-600 hover:text-primary-500">
						Sign in here
					</a>
				</p>
			</div>
		</form>
	</div>
</div>

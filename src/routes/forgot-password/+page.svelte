<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { Mail, ArrowLeft } from 'lucide-svelte';
	
	let email = '';
	let loading = false;
	let message = '';
	let error = '';

	async function handleResetPassword() {
		if (!email) {
			error = 'Please enter your email address';
			return;
		}

		loading = true;
		error = '';
		message = '';

		try {
			const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
				redirectTo: `${window.location.origin}/reset-password`
			});

			if (resetError) {
				error = resetError.message;
			} else {
				message = 'Password reset instructions have been sent to your email address.';
				email = '';
			}
		} catch (err) {
			error = 'An unexpected error occurred. Please try again.';
		} finally {
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Forgot Password - Aussie Market</title>
</svelte:head>

<main class="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
	<div class="sm:mx-auto sm:w-full sm:max-w-md">
		<!-- Logo -->
		<div class="flex justify-center">
			<div class="flex items-center">
				<div class="bg-primary-600 text-white p-2 rounded-lg mr-3">
					<Mail class="w-6 h-6" />
				</div>
				<h1 class="text-2xl font-bold text-gray-900">Aussie Market</h1>
			</div>
		</div>
		
		<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
			Reset your password
		</h2>
		<p class="mt-2 text-center text-sm text-gray-600">
			Enter your email address and we'll send you instructions to reset your password.
		</p>
	</div>

	<div class="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
		<div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
			{#if message}
				<div class="mb-6 p-4 rounded-md bg-green-50 border border-green-200">
					<div class="text-sm text-green-700">
						{message}
					</div>
				</div>
			{/if}

			{#if error}
				<div class="mb-6 p-4 rounded-md bg-red-50 border border-red-200">
					<div class="text-sm text-red-700">
						{error}
					</div>
				</div>
			{/if}

			<form on:submit|preventDefault={handleResetPassword} class="space-y-6">
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">
						Email address
					</label>
					<div class="mt-1">
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							bind:value={email}
							disabled={loading}
							class="input w-full"
							placeholder="Enter your email address"
						/>
					</div>
				</div>

				<div>
					<button
						type="submit"
						disabled={loading}
						class="btn-primary w-full flex justify-center items-center"
					>
						{#if loading}
							<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
							Sending...
						{:else}
							Send reset instructions
						{/if}
					</button>
				</div>
			</form>

			<div class="mt-6">
				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-gray-300" />
					</div>
					<div class="relative flex justify-center text-sm">
						<span class="px-2 bg-white text-gray-500">or</span>
					</div>
				</div>

				<div class="mt-6">
					<a
						href="/login"
						class="w-full flex justify-center items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
					>
						<ArrowLeft class="w-4 h-4 mr-2" />
						Back to sign in
					</a>
				</div>
			</div>
		</div>
	</div>
</main>
<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/stores';
	import { Mail, Lock, Eye, EyeOff, AlertCircle, CheckCircle } from 'lucide-svelte';

	let showPassword = false;
	let isSubmitting = false;

	// Get form data from server action
	$: form = $page.form;
	$: error = form?.error;
	$: success = form?.success;
	$: email = form?.email || '';

	function togglePassword() {
		showPassword = !showPassword;
	}
</script>

<svelte:head>
	<title>Sign In - Aussie Market</title>
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
				Welcome to Aussie Market
			</h2>
			<p class="mt-2 text-center text-sm text-gray-600">
				Sign in to your account or create a new one
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

		<form method="POST" use:enhance={() => {
			isSubmitting = true;
			return async ({ result }) => {
				isSubmitting = false;
			};
		}} class="mt-8 space-y-6">
			<div class="space-y-4">
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">
						Email Address
					</label>
					<div class="mt-1 relative">
						<Mail class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="email"
							name="email"
							type="email"
							bind:value={email}
							required
							class="input pl-10"
							placeholder="Enter your email"
						/>
					</div>
				</div>

				<div>
					<label for="password" class="block text-sm font-medium text-gray-700">
						Password
					</label>
					<div class="mt-1 relative">
						<Lock class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="password"
							name="password"
							type={showPassword ? 'text' : 'password'}
							required
							class="input pl-10 pr-10"
							placeholder="Enter your password"
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
			</div>

			<div class="flex items-center justify-between">
				<div class="text-sm">
					<a href="/forgot-password" class="font-medium text-primary-600 hover:text-primary-500">
						Forgot your password?
					</a>
				</div>
			</div>

			<div class="space-y-4">
				<button
					type="submit"
					name="action"
					value="signin"
					disabled={isSubmitting}
					class="btn-primary w-full"
				>
					{isSubmitting ? 'Signing in...' : 'Sign In'}
				</button>

				<div class="relative">
					<div class="absolute inset-0 flex items-center">
						<div class="w-full border-t border-gray-300" />
					</div>
					<div class="relative flex justify-center text-sm">
						<span class="px-2 bg-gray-50 text-gray-500">Or</span>
					</div>
				</div>

				<button
					type="submit"
					name="action"
					value="signup"
					disabled={isSubmitting}
					class="btn btn-outline w-full"
				>
					{isSubmitting ? 'Creating account...' : 'Create Account'}
				</button>
			</div>

			<div class="text-center">
				<p class="text-xs text-gray-500">
					By signing in or creating an account, you agree to our
					<a href="/terms" class="text-primary-600 hover:text-primary-500">Terms of Service</a>
					and
					<a href="/privacy" class="text-primary-600 hover:text-primary-500">Privacy Policy</a>
				</p>
			</div>
		</form>
	</div>
</div>



<script lang="ts">
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { Mail, Lock, Eye, EyeOff } from 'lucide-svelte';

	let email = '';
	let password = '';
	let loading = false;
	let showPassword = false;
	let error = '';

	onMount(() => {
		// Check if user is already logged in
		supabase.auth.getSession().then(({ data: { session } }) => {
			if (session) {
				goto('/');
			}
		});
	});

	async function handleLogin() {
		loading = true;
		error = '';

		const { error: authError } = await supabase.auth.signInWithPassword({
			email,
			password
		});

		if (authError) {
			error = authError.message;
		} else {
			goto('/');
		}

		loading = false;
	}

	async function handleSignUp() {
		loading = true;
		error = '';

		const { error: authError } = await supabase.auth.signUp({
			email,
			password
		});

		if (authError) {
			error = authError.message;
		} else {
			error = 'Check your email for a confirmation link!';
		}

		loading = false;
	}
</script>

<svelte:head>
	<title>Sign In - Aussie Market</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
	<div class="max-w-md w-full space-y-8">
		<div>
			<div class="mx-auto h-12 w-12 bg-primary-600 rounded-lg flex items-center justify-center">
				<span class="text-white font-bold text-lg">AM</span>
			</div>
			<h2 class="mt-6 text-center text-3xl font-extrabold text-gray-900">
				Sign in to your account
			</h2>
			<p class="mt-2 text-center text-sm text-gray-600">
				Or
				<a href="/signup" class="font-medium text-primary-600 hover:text-primary-500">
					create a new account
				</a>
			</p>
		</div>

		<form class="mt-8 space-y-6" on:submit|preventDefault={handleLogin}>
			{#if error}
				<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
					{error}
				</div>
			{/if}

			<div class="space-y-4">
				<div>
					<label for="email" class="block text-sm font-medium text-gray-700">
						Email address
					</label>
					<div class="mt-1 relative">
						<Mail class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							bind:value={email}
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
							autocomplete="current-password"
							required
							bind:value={password}
							class="input pl-10 pr-10"
							placeholder="Enter your password"
						/>
						<button
							type="button"
							on:click={() => showPassword = !showPassword}
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
				<div class="flex items-center">
					<input
						id="remember-me"
						name="remember-me"
						type="checkbox"
						class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
					/>
					<label for="remember-me" class="ml-2 block text-sm text-gray-900">
						Remember me
					</label>
				</div>

				<div class="text-sm">
					<a href="/forgot-password" class="font-medium text-primary-600 hover:text-primary-500">
						Forgot your password?
					</a>
				</div>
			</div>

			<div class="space-y-3">
				<button
					type="submit"
					disabled={loading}
					class="btn-primary w-full btn-lg"
				>
					{loading ? 'Signing in...' : 'Sign in'}
				</button>

				<button
					type="button"
					on:click={handleSignUp}
					disabled={loading}
					class="btn btn-outline w-full btn-lg"
				>
					{loading ? 'Creating account...' : 'Create account'}
				</button>
			</div>
		</form>

		<div class="mt-6">
			<div class="relative">
				<div class="absolute inset-0 flex items-center">
					<div class="w-full border-t border-gray-300" />
				</div>
				<div class="relative flex justify-center text-sm">
					<span class="px-2 bg-gray-50 text-gray-500">Or continue with</span>
				</div>
			</div>

			<div class="mt-6">
				<button
					type="button"
					class="btn btn-outline w-full btn-lg"
				>
					<svg class="w-5 h-5 mr-2" viewBox="0 0 24 24">
						<path
							fill="currentColor"
							d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
						/>
						<path
							fill="currentColor"
							d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
						/>
						<path
							fill="currentColor"
							d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
						/>
						<path
							fill="currentColor"
							d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
						/>
					</svg>
					Sign in with Google
				</button>
			</div>
		</div>
	</div>
</div>



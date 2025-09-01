<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { User, ShoppingCart, Plus, MessageSquare, Settings, LogOut } from 'lucide-svelte';

	let user: any = null;
	let loading = true;

	onMount(async () => {
		// Get initial session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user ?? null;
		loading = false;

		// Listen for auth changes
		supabase.auth.onAuthStateChange((event, session) => {
			user = session?.user ?? null;
			loading = false;
		});
	});

	async function handleSignOut() {
		await supabase.auth.signOut();
		goto('/');
	}
</script>

<svelte:head>
	<title>Aussie Market - C2C Auction Platform</title>
	<meta name="description" content="TradeMe-style C2C auction platform for Australia" />
</svelte:head>

<div class="min-h-screen bg-gray-50">
	<!-- Navigation -->
	<nav class="bg-white shadow-sm border-b border-gray-200">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between h-16">
				<div class="flex items-center">
					<a href="/" class="flex items-center space-x-2">
						<div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
							<span class="text-white font-bold text-sm">AM</span>
						</div>
						<span class="text-xl font-bold text-gray-900">Aussie Market</span>
					</a>
				</div>

				<div class="flex items-center space-x-4">
					{#if user}
						<a href="/sell/new" class="btn-primary btn-sm">
							<Plus class="w-4 h-4 mr-1" />
							Sell Item
						</a>
						
						<div class="flex items-center space-x-2">
							<a href="/messages" class="btn-ghost btn-sm">
								<MessageSquare class="w-4 h-4" />
							</a>
							<a href="/orders/buyer" class="btn-ghost btn-sm">
								<ShoppingCart class="w-4 h-4" />
							</a>
							
							<!-- User Menu -->
							<div class="relative">
								<button class="btn-ghost btn-sm flex items-center space-x-1">
									<User class="w-4 h-4" />
									<span class="hidden sm:inline">{user.email}</span>
								</button>
								
								<!-- Dropdown Menu -->
								<div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
									<a href="/account" class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
										<Settings class="w-4 h-4 mr-2" />
										Account Settings
									</a>
									<button 
										on:click={handleSignOut}
										class="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
									>
										<LogOut class="w-4 h-4 mr-2" />
										Sign Out
									</button>
								</div>
							</div>
						</div>
					{:else}
						<a href="/login" class="btn-primary btn-sm">Sign In</a>
					{/if}
				</div>
			</div>
		</div>
	</nav>

	<!-- Main Content -->
	<main class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
		{#if loading}
			<div class="flex items-center justify-center h-64">
				<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
			</div>
		{:else}
			<slot />
		{/if}
	</main>

	<!-- Footer -->
	<footer class="bg-white border-t border-gray-200 mt-auto">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
			<div class="grid grid-cols-1 md:grid-cols-4 gap-8">
				<div>
					<h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase">About</h3>
					<ul class="mt-4 space-y-2">
						<li><a href="/about" class="text-sm text-gray-600 hover:text-gray-900">About Us</a></li>
						<li><a href="/contact" class="text-sm text-gray-600 hover:text-gray-900">Contact</a></li>
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase">Support</h3>
					<ul class="mt-4 space-y-2">
						<li><a href="/help" class="text-sm text-gray-600 hover:text-gray-900">Help Center</a></li>
						<li><a href="/disputes" class="text-sm text-gray-600 hover:text-gray-900">Disputes</a></li>
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase">Legal</h3>
					<ul class="mt-4 space-y-2">
						<li><a href="/terms" class="text-sm text-gray-600 hover:text-gray-900">Terms of Service</a></li>
						<li><a href="/privacy" class="text-sm text-gray-600 hover:text-gray-900">Privacy Policy</a></li>
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold text-gray-900 tracking-wider uppercase">Connect</h3>
					<ul class="mt-4 space-y-2">
						<li><a href="/blog" class="text-sm text-gray-600 hover:text-gray-900">Blog</a></li>
						<li><a href="/newsletter" class="text-sm text-gray-600 hover:text-gray-900">Newsletter</a></li>
					</ul>
				</div>
			</div>
			<div class="mt-8 pt-8 border-t border-gray-200">
				<p class="text-sm text-gray-600 text-center">
					© 2024 Aussie Market. All rights reserved.
				</p>
			</div>
		</div>
	</footer>
</div>



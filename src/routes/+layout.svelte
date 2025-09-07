<script lang="ts">
	import '../app.css';
	import { supabase } from '$lib/supabase';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { User, ShoppingCart, Plus, MessageSquare, Settings, LogOut, Menu, X } from 'lucide-svelte';
	import NotificationBell from '$lib/components/NotificationBell.svelte';
import ToastContainer from '$lib/components/ToastContainer.svelte';

	// Get data from server-side load function
	export let data: { session: any; user: any; userProfile: any; url: string };

	let user = data.session?.user || null;
	let userProfile: any = data.userProfile;
	let loading = false;
	let mobileMenuOpen = false;

	onMount(async () => {
		// Initialize user from client session (helps tests that shim session)
		try {
			const { data: { session } } = await supabase.auth.getSession();
			user = session?.user || null;
		} catch {}
		// Listen for auth state changes
		supabase.auth.onAuthStateChange(async (event, session) => {
			user = session?.user || null;
			
			if (session?.user) {
				// Get updated user profile
				const { data: profile } = await supabase
					.from('users')
					.select('*')
					.eq('id', session.user.id)
					.single();
				userProfile = profile;
			} else {
				userProfile = null;
			}
		});
	});

	async function handleSignOut() {
		loading = true;
		await supabase.auth.signOut();
		goto('/');
		loading = false;
	}

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<svelte:head>
	<title>Aussie Market - C2C Auction Platform</title>
	<meta name="description" content="Australia's premier C2C auction marketplace" />
</svelte:head>

<a href="#main" class="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 bg-white text-black px-3 py-2 rounded shadow">Skip to main content</a>
<div class="min-h-screen bg-gray-50">
	<!-- Navigation -->
	<nav class="bg-white shadow-sm border-b border-gray-200">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="flex justify-between h-16">
				<!-- Logo and main nav -->
				<div class="flex items-center">
					<a href="/" class="flex items-center space-x-2">
						<div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
							<span class="text-white font-bold text-lg">A</span>
						</div>
						<span class="text-xl font-bold text-gray-900">Aussie Market</span>
					</a>
				</div>

				<!-- Desktop navigation -->
				<div class="hidden md:flex items-center space-x-8">
					<a href="/" class="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
						Browse
					</a>
					{#if user}
						<a href="/sell/new" class="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
							Sell
						</a>
						<a href="/orders/buyer" class="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
							My Orders
						</a>
						<a href="/messages" class="text-gray-700 hover:text-primary-600 px-3 py-2 rounded-md text-sm font-medium">
							Messages
						</a>
					{/if}
				</div>

				<!-- User menu -->
				<div class="flex items-center space-x-4">
					{#if user}
						<!-- Notification Bell -->
						<NotificationBell />
						
						<!-- User dropdown -->
						<div class="relative">
							<button
								on:click={() => mobileMenuOpen = !mobileMenuOpen}
								class="flex items-center space-x-2 text-sm rounded-full focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
							>
								<div class="w-8 h-8 bg-primary-100 rounded-full flex items-center justify-center">
									<User class="w-4 h-4 text-primary-600" />
								</div>
								<span class="hidden md:block text-gray-700">
									{userProfile?.legal_name || user.email}
								</span>
							</button>

							{#if mobileMenuOpen}
								<div class="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg py-1 z-50">
									{#if userProfile && (userProfile.role === 'admin' || userProfile.role === 'moderator')}
										<a
											href="/admin"
											on:click={closeMobileMenu}
											class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
										>
											<Settings class="w-4 h-4 mr-2" />
											Admin
										</a>
									{/if}
									<a
										href="/account"
										on:click={closeMobileMenu}
										class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
									>
										<Settings class="w-4 h-4 mr-2" />
										Account Settings
									</a>
									{#if userProfile?.role === 'seller'}
										<a
											href="/orders/seller"
											on:click={closeMobileMenu}
											class="flex items-center px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
										>
											<ShoppingCart class="w-4 h-4 mr-2" />
											Seller Orders
										</a>
									{/if}
									<hr class="my-1" />
									<button
										on:click={handleSignOut}
										disabled={loading}
										class="flex items-center w-full px-4 py-2 text-sm text-gray-700 hover:bg-gray-100"
									>
										<LogOut class="w-4 h-4 mr-2" />
										{loading ? 'Signing out...' : 'Sign Out'}
									</button>
								</div>
							{/if}
						</div>
					{:else}
						<a href="/login" class="btn-primary">
							Sign In
						</a>
					{/if}

					<!-- Mobile menu button -->
					<button
						on:click={toggleMobileMenu}
						class="md:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
						aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'} aria-expanded={mobileMenuOpen} aria-controls="mobile-menu"
					>
						{#if mobileMenuOpen}
							<X class="w-6 h-6" />
						{:else}
							<Menu class="w-6 h-6" />
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Mobile menu -->
		{#if mobileMenuOpen}
			<div class="md:hidden" id="mobile-menu">
				<div class="px-2 pt-2 pb-3 space-y-1 sm:px-3 bg-white border-t border-gray-200">
					<a
						href="/"
						on:click={closeMobileMenu}
						class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
					>
						Browse
					</a>
					{#if user}
						<a
							href="/sell/new"
							on:click={closeMobileMenu}
							class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
						>
							Sell
						</a>
						<a
							href="/orders/buyer"
							on:click={closeMobileMenu}
							class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
						>
							My Orders
						</a>
						<a
							href="/messages"
							on:click={closeMobileMenu}
							class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
						>
							Messages
						</a>
						<a
							href="/account"
							on:click={closeMobileMenu}
							class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
						>
							Account Settings
						</a>
						{#if userProfile?.role === 'seller'}
							<a
								href="/orders/seller"
								on:click={closeMobileMenu}
								class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
							>
								Seller Orders
							</a>
						{/if}
					{:else}
						<a
							href="/login"
							on:click={closeMobileMenu}
							class="text-gray-700 hover:text-primary-600 block px-3 py-2 rounded-md text-base font-medium"
						>
							Sign In
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</nav>

	<!-- Main content -->
	<main id="main" class="flex-1" tabindex="-1">
		<slot />
	</main>

	<!-- Footer -->
	<footer class="bg-white border-t border-gray-200 mt-16">
		<div class="max-w-7xl mx-auto py-12 px-4 sm:px-6 lg:px-8">
			<div class="grid grid-cols-1 md:grid-cols-4 gap-8">
				<div class="col-span-1 md:col-span-2">
					<div class="flex items-center space-x-2 mb-4">
						<div class="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center">
							<span class="text-white font-bold text-lg">A</span>
						</div>
						<span class="text-xl font-bold text-gray-900">Aussie Market</span>
					</div>
					<p class="text-gray-600 mb-4">
						Australia's premier C2C auction marketplace. Buy and sell with confidence through our secure platform.
					</p>
				</div>
				<div>
					<h3 class="text-sm font-semibold text-gray-500 tracking-wider uppercase mb-4">Buying</h3>
					<ul class="space-y-2">
						<li><a href="/help/bidding" class="text-gray-600 hover:text-gray-900">How to Bid</a></li>
						<li><a href="/help/buyer-protection" class="text-gray-600 hover:text-gray-900">Buyer Protection</a></li>
						<li><a href="/help/payments" class="text-gray-600 hover:text-gray-900">Payment Methods</a></li>
					</ul>
				</div>
				<div>
					<h3 class="text-sm font-semibold text-gray-500 tracking-wider uppercase mb-4">Selling</h3>
					<ul class="space-y-2">
						<li><a href="/help/selling" class="text-gray-600 hover:text-gray-900">How to Sell</a></li>
						<li><a href="/help/seller-guidelines" class="text-gray-600 hover:text-gray-900">Seller Guidelines</a></li>
						<li><a href="/help/fees" class="text-gray-600 hover:text-gray-900">Fees & Charges</a></li>
					</ul>
				</div>
			</div>
			<div class="mt-8 pt-8 border-t border-gray-200">
				<p class="text-gray-500 text-sm text-center">
					© 2024 Aussie Market. All rights reserved.
				</p>
			</div>
		</div>
	</footer>
</div>

<ToastContainer />



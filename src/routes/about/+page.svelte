<script lang="ts">
	import { Users, Shield, Zap, Globe, Award, Heart } from 'lucide-svelte';
</script>

<svelte:head>
	<title>About Us - Aussie Market</title>
	<meta name="description" content="Learn about Aussie Market, Australia's premier C2C auction marketplace connecting buyers and sellers across the country." />
</svelte:head>

<main class="bg-white">
	<!-- Hero Section -->
	<section class="relative py-16 lg:py-24">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center">
				<h1 class="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
					About Aussie Market
				</h1>
				<p class="text-xl text-gray-600 max-w-3xl mx-auto">
					Australia's most trusted consumer-to-consumer auction marketplace, 
					connecting buyers and sellers across the nation with secure, 
					transparent, and exciting auction experiences.
				</p>
			</div>
		</div>
	</section>

	<!-- Mission Section -->
	<section class="py-16 bg-gray-50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
				<div>
					<h2 class="text-3xl font-bold text-gray-900 mb-6">Our Mission</h2>
					<p class="text-lg text-gray-600 mb-6">
						To create Australia's most trusted and vibrant marketplace where every transaction 
						is secure, every bid is exciting, and every deal brings people together.
					</p>
					<p class="text-lg text-gray-600">
						We believe in the power of community-driven commerce, where individuals can 
						discover unique items, find great deals, and build connections through the 
						thrill of auction-style buying and selling.
					</p>
				</div>
				<div class="lg:text-right">
					<div class="inline-block p-6 bg-primary-100 rounded-full">
						<Heart class="w-16 h-16 text-primary-600" />
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Values Section -->
	<section class="py-16">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-12">
				<h2 class="text-3xl font-bold text-gray-900 mb-4">Our Values</h2>
				<p class="text-lg text-gray-600 max-w-2xl mx-auto">
					Everything we do is guided by our commitment to creating a safe, 
					fair, and enjoyable marketplace for all Australians.
				</p>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
				<div class="text-center p-6">
					<div class="inline-block p-3 bg-blue-100 rounded-full mb-4">
						<Shield class="w-8 h-8 text-blue-600" />
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-3">Trust & Security</h3>
					<p class="text-gray-600">
						Advanced security measures, verified users, and buyer protection 
						ensure every transaction is safe and secure.
					</p>
				</div>

				<div class="text-center p-6">
					<div class="inline-block p-3 bg-green-100 rounded-full mb-4">
						<Users class="w-8 h-8 text-green-600" />
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-3">Community First</h3>
					<p class="text-gray-600">
						We prioritize building a supportive community where buyers and 
						sellers can connect, communicate, and trade with confidence.
					</p>
				</div>

				<div class="text-center p-6">
					<div class="inline-block p-3 bg-purple-100 rounded-full mb-4">
						<Zap class="w-8 h-8 text-purple-600" />
					</div>
					<h3 class="text-xl font-semibold text-gray-900 mb-3">Innovation</h3>
					<p class="text-gray-600">
						Cutting-edge technology and user-friendly design make buying 
						and selling effortless and enjoyable.
					</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section class="py-16 bg-gray-50">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
			<div class="text-center mb-12">
				<h2 class="text-3xl font-bold text-gray-900 mb-4">Why Choose Aussie Market?</h2>
			</div>

			<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
				<div class="bg-white p-8 rounded-lg shadow-sm">
					<div class="flex items-start space-x-4">
						<div class="flex-shrink-0">
							<div class="p-2 bg-green-100 rounded-lg">
								<Award class="w-6 h-6 text-green-600" />
							</div>
						</div>
						<div>
							<h3 class="text-lg font-semibold text-gray-900 mb-2">Verified Users</h3>
							<p class="text-gray-600">
								Our KYC verification process ensures all users are legitimate, 
								creating a safer marketplace for everyone.
							</p>
						</div>
					</div>
				</div>

				<div class="bg-white p-8 rounded-lg shadow-sm">
					<div class="flex items-start space-x-4">
						<div class="flex-shrink-0">
							<div class="p-2 bg-blue-100 rounded-lg">
								<Shield class="w-6 h-6 text-blue-600" />
							</div>
						</div>
						<div>
							<h3 class="text-lg font-semibold text-gray-900 mb-2">Buyer Protection</h3>
							<p class="text-gray-600">
								Comprehensive protection policies and dispute resolution 
								ensure your purchases are safe and secure.
							</p>
						</div>
					</div>
				</div>

				<div class="bg-white p-8 rounded-lg shadow-sm">
					<div class="flex items-start space-x-4">
						<div class="flex-shrink-0">
							<div class="p-2 bg-yellow-100 rounded-lg">
								<Zap class="w-6 h-6 text-yellow-600" />
							</div>
						</div>
						<div>
							<h3 class="text-lg font-semibold text-gray-900 mb-2">Real-time Auctions</h3>
							<p class="text-gray-600">
								Live bidding with instant updates keeps you in the action 
								and ensures fair, transparent auctions.
							</p>
						</div>
					</div>
				</div>

				<div class="bg-white p-8 rounded-lg shadow-sm">
					<div class="flex items-start space-x-4">
						<div class="flex-shrink-0">
							<div class="p-2 bg-purple-100 rounded-lg">
								<Globe class="w-6 h-6 text-purple-600" />
							</div>
						</div>
						<div>
							<h3 class="text-lg font-semibold text-gray-900 mb-2">Australia-Wide</h3>
							<p class="text-gray-600">
								Connect with buyers and sellers across all Australian states 
								and territories, expanding your market reach.
							</p>
						</div>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- CTA Section -->
	<section class="py-16">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
			<h2 class="text-3xl font-bold text-gray-900 mb-6">
				Ready to Start Your Journey?
			</h2>
			<p class="text-lg text-gray-600 mb-8 max-w-2xl mx-auto">
				Join thousands of Australians who have discovered the excitement 
				of auction-style buying and selling.
			</p>
			<div class="flex flex-col sm:flex-row gap-4 justify-center">
				<a href="/marketplace" class="btn-primary text-lg px-8 py-3">
					Browse Marketplace
				</a>
				<a href="/register" class="btn-secondary text-lg px-8 py-3">
					Create Account
				</a>
			</div>
		</div>
	</section>
</main>
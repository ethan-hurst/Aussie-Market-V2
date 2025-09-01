<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { createThread } from '$lib/messaging';
	import { goto } from '$app/navigation';
	import { 
		ArrowLeft, 
		Send, 
		User,
		Package,
		Image
	} from 'lucide-svelte';

	let loading = true;
	let error = '';
	let user: any = null;
	let seller: any = null;
	let listing: any = null;
	let subject = '';
	let message = '';
	let sending = false;

	$: listingId = $page.url.searchParams.get('listing');
	$: sellerId = $page.url.searchParams.get('seller');

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		if (!user) {
			goto('/login');
			return;
		}

		if (!sellerId) {
			error = 'No seller specified';
			loading = false;
			return;
		}

		await loadData();
	});

	async function loadData() {
		try {
			// Load seller info
			const { data: sellerData, error: sellerError } = await supabase
				.from('users')
				.select('id, legal_name, email')
				.eq('id', sellerId)
				.single();

			if (sellerError) {
				error = 'Seller not found';
				return;
			}

			seller = sellerData;

			// Load listing info if provided
			if (listingId) {
				const { data: listingData, error: listingError } = await supabase
					.from('listings')
					.select(`
						id,
						title,
						description,
						listing_photos(url, order_idx)
					`)
					.eq('id', listingId)
					.single();

				if (!listingError && listingData) {
					listing = listingData;
					subject = `Re: ${listing.title}`;
				}
			}

		} catch (err) {
			console.error('Error loading data:', err);
			error = 'Failed to load data';
		} finally {
			loading = false;
		}
	}

	async function handleSendMessage() {
		if (!message.trim() || sending) return;

		sending = true;
		try {
			const thread = await createThread({
				buyer_id: user.id,
				seller_id: sellerId,
				order_id: listingId ? null : undefined,
				subject: subject.trim() || undefined
			});

			if (thread) {
				// Send the initial message
				const { data: messageData, error: messageError } = await supabase
					.from('messages')
					.insert({
						thread_id: thread.id,
						content: message.trim(),
						message_type: 'text'
					})
					.select()
					.single();

				if (messageError) {
					throw messageError;
				}

				// Redirect to the thread
				goto(`/messages/${thread.id}`);
			}
		} catch (err) {
			console.error('Error sending message:', err);
			error = 'Failed to send message';
		} finally {
			sending = false;
		}
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}
</script>

<svelte:head>
	<title>New Message - Aussie Market</title>
</svelte:head>

<div class="max-w-2xl mx-auto p-6">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center space-x-4">
			<a href="/messages" class="text-gray-600 hover:text-gray-900">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<div>
				<h1 class="text-2xl font-bold text-gray-900">New Message</h1>
				<p class="text-gray-600 mt-1">Start a conversation with the seller</p>
			</div>
		</div>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
			<div class="flex">
				<div class="flex-shrink-0">
					<svg class="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
						<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd" />
					</svg>
				</div>
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Error</h3>
					<div class="mt-2 text-sm text-red-700">{error}</div>
				</div>
			</div>
		</div>
	{:else if loading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else}
		<div class="bg-white shadow-lg rounded-lg overflow-hidden">
			<!-- Seller Info -->
			<div class="bg-gray-50 px-6 py-4 border-b border-gray-200">
				<div class="flex items-center space-x-4">
					<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
						<User class="w-6 h-6 text-blue-600" />
					</div>
					<div>
						<h3 class="font-medium text-gray-900">
							{seller?.legal_name || seller?.email}
						</h3>
						<p class="text-sm text-gray-500">Seller</p>
					</div>
				</div>
			</div>

			<!-- Listing Info (if applicable) -->
			{#if listing}
				<div class="px-6 py-4 border-b border-gray-200">
					<div class="flex items-center space-x-4">
						<img
							src={getMainPhoto(listing.listing_photos)}
							alt={listing.title}
							class="w-16 h-16 object-cover rounded-lg"
						/>
						<div>
							<h4 class="font-medium text-gray-900">{listing.title}</h4>
							<p class="text-sm text-gray-500">About this item</p>
						</div>
					</div>
				</div>
			{/if}

			<!-- Message Form -->
			<form on:submit|preventDefault={handleSendMessage} class="p-6 space-y-6">
				<!-- Subject -->
				<div>
					<label for="subject" class="block text-sm font-medium text-gray-700 mb-2">
						Subject
					</label>
					<input
						id="subject"
						type="text"
						bind:value={subject}
						placeholder="Message subject..."
						class="block w-full border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
					/>
				</div>

				<!-- Message -->
				<div>
					<label for="message" class="block text-sm font-medium text-gray-700 mb-2">
						Message
					</label>
					<textarea
						id="message"
						bind:value={message}
						rows="6"
						placeholder="Type your message here..."
						class="block w-full border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
					></textarea>
				</div>

				<!-- Send Button -->
				<div class="flex justify-end">
					<button
						type="submit"
						disabled={!message.trim() || sending}
						class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-6 py-3 rounded-lg font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors flex items-center space-x-2"
					>
						{#if sending}
							<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
							<span>Sending...</span>
						{:else}
							<Send class="w-5 h-5" />
							<span>Send Message</span>
						{/if}
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>

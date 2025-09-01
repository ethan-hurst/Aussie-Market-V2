<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { MessageSquare, User, Package } from 'lucide-svelte';

	let threads: any[] = [];
	let loading = true;
	let user: any = null;

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) {
			goto('/login');
			return;
		}

		user = session.user;
		await loadThreads();
	});

	async function loadThreads() {
		try {
			// Load threads where user is involved (as buyer or seller)
			const { data, error } = await supabase
				.from('message_threads')
				.select(`
					*,
					listings (
						id,
						title,
						listing_photos (
							id,
							url,
							order_idx
						)
					),
					orders (
						id,
						listings (
							id,
							title,
							listing_photos (
								id,
								url,
								order_idx
							)
						)
					),
					messages (
						id,
						content,
						created_at,
						sender_id
					)
				`)
				.or(`listings.seller_id.eq.${user.id},orders.buyer_id.eq.${user.id},orders.seller_id.eq.${user.id}`)
				.order('created_at', { ascending: false });

			if (error) {
				console.error('Error loading threads:', error);
			} else {
				threads = data || [];
			}
		} catch (err) {
			console.error('Error:', err);
		} finally {
			loading = false;
		}
	}

	function formatDate(dateString: string): string {
		const date = new Date(dateString);
		const now = new Date();
		const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

		if (diffInHours < 24) {
			return date.toLocaleTimeString('en-AU', { 
				hour: '2-digit', 
				minute: '2-digit' 
			});
		} else if (diffInHours < 168) { // 7 days
			return date.toLocaleDateString('en-AU', { 
				weekday: 'short' 
			});
		} else {
			return date.toLocaleDateString('en-AU', { 
				month: 'short', 
				day: 'numeric' 
			});
		}
	}

	function getThreadTitle(thread: any): string {
		if (thread.listings) {
			return thread.listings.title;
		} else if (thread.orders?.listings) {
			return `Order: ${thread.orders.listings.title}`;
		}
		return 'Message Thread';
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}

	function getLatestMessage(thread: any): any {
		if (!thread.messages || thread.messages.length === 0) {
			return null;
		}
		return thread.messages.sort((a: any, b: any) => 
			new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
		)[0];
	}

	function getUnreadCount(thread: any): number {
		if (!thread.messages) return 0;
		return thread.messages.filter((msg: any) => 
			msg.sender_id !== user.id && !msg.read_at
		).length;
	}
</script>

<svelte:head>
	<title>Messages - Aussie Market</title>
</svelte:head>

<div class="max-w-4xl mx-auto space-y-8">
	<!-- Header -->
	<div>
		<h1 class="text-3xl font-bold text-gray-900">Messages</h1>
		<p class="text-gray-600 mt-2">Communicate with buyers and sellers</p>
	</div>

	{#if loading}
		<div class="flex items-center justify-center h-64">
			<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
		</div>
	{:else if threads.length === 0}
		<div class="text-center py-12">
			<MessageSquare class="mx-auto h-12 w-12 text-gray-400" />
			<h3 class="mt-2 text-sm font-medium text-gray-900">No messages yet</h3>
			<p class="mt-1 text-sm text-gray-500">
				Start bidding or selling to see your messages here.
			</p>
			<div class="mt-6">
				<a href="/" class="btn-primary">Browse Listings</a>
			</div>
		</div>
	{:else}
		<div class="space-y-4">
			{#each threads as thread}
				{@const latestMessage = getLatestMessage(thread)}
				{@const unreadCount = getUnreadCount(thread)}
				{@const threadTitle = getThreadTitle(thread)}
				{@const photos = thread.listings?.listing_photos || thread.orders?.listings?.listing_photos || []}
				
				<a href="/messages/{thread.id}" class="card hover:shadow-md transition-shadow">
					<div class="p-4">
						<div class="flex items-start space-x-4">
							<!-- Item Image -->
							<div class="flex-shrink-0">
								<img
									src={getMainPhoto(photos)}
									alt={threadTitle}
									class="w-16 h-16 object-cover rounded-lg"
								/>
							</div>

							<!-- Thread Details -->
							<div class="flex-1 min-w-0">
								<div class="flex items-start justify-between">
									<div class="flex-1">
										<h3 class="text-lg font-medium text-gray-900 truncate">
											{threadTitle}
										</h3>
										{#if latestMessage}
											<p class="text-sm text-gray-500 mt-1 truncate">
												{latestMessage.content}
											</p>
										{/if}
									</div>
									<div class="flex flex-col items-end space-y-1">
										{#if latestMessage}
											<span class="text-xs text-gray-400">
												{formatDate(latestMessage.created_at)}
											</span>
										{/if}
										{#if unreadCount > 0}
											<span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
												{unreadCount} new
											</span>
										{/if}
									</div>
								</div>

								<!-- Thread Type -->
								<div class="mt-2 flex items-center space-x-2">
									{#if thread.listings}
										<Package class="w-4 h-4 text-gray-400" />
										<span class="text-xs text-gray-500">Listing Inquiry</span>
									{:else if thread.orders}
										<User class="w-4 h-4 text-gray-400" />
										<span class="text-xs text-gray-500">Order Communication</span>
									{/if}
								</div>
							</div>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

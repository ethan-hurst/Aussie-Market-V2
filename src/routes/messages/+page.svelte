<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { 
		getUserThreads, 
		createThread, 
		getTotalUnreadCount,
		subscribeToUserThreads,
		formatMessageTime,
		type MessageThread 
	} from '$lib/messaging';
	import { 
		MessageSquare, 
		Plus, 
		Search, 
		Clock, 
		User,
		Package,
		ArrowRight
	} from 'lucide-svelte';
	import { mapApiErrorToMessage } from '$lib/errors';
	import { toastError } from '$lib/toast';

	let threads: MessageThread[] = [];
	let loading = true;
	let error = '';
	let user: any = null;
	let totalUnread = 0;
	let searchQuery = '';
	let showNewThreadModal = false;
	let creatingThread = false;

	$: filteredThreads = threads.filter(thread => {
		if (!searchQuery) return true;
		const query = searchQuery.toLowerCase();
		return (
			thread.subject?.toLowerCase().includes(query) ||
			thread.buyer?.legal_name.toLowerCase().includes(query) ||
			thread.seller?.legal_name.toLowerCase().includes(query) ||
			thread.order?.listing.title.toLowerCase().includes(query)
		);
	});

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		if (!user) {
			error = 'Please sign in to view messages';
			loading = false;
			return;
		}

		await loadThreads();

		// Set up real-time subscription for thread updates
		const subscription = subscribeToUserThreads(user.id, async (updatedThread) => {
			// Refresh threads list
			await loadThreads();
		});

		return () => {
			subscription.unsubscribe();
		};
	});

	async function loadThreads() {
		try {
			loading = true;
			threads = await getUserThreads(user.id);
			totalUnread = await getTotalUnreadCount(user.id);
		} catch (err) {
			console.error('Error loading threads:', err);
			error = mapApiErrorToMessage(err);
			toastError(error);
		} finally {
			loading = false;
		}
	}

	async function handleCreateThread() {
		// This would typically open a modal to select order/user
		// For now, we'll just show a placeholder
		showNewThreadModal = true;
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}

	function getOtherUser(thread: MessageThread) {
		if (!user) return null;
		return user.id === thread.buyer_id ? thread.seller : thread.buyer;
	}

	function getThreadTitle(thread: MessageThread): string {
		if (thread.subject) return thread.subject;
		if (thread.order?.listing.title) return `Re: ${thread.order.listing.title}`;
		return 'New conversation';
	}
</script>

<svelte:head>
	<title>Messages - Aussie Market</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-6">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Messages</h1>
				<p class="text-gray-600 mt-1">
					{totalUnread > 0 ? `${totalUnread} unread message${totalUnread !== 1 ? 's' : ''}` : 'No unread messages'}
				</p>
			</div>
			<button
				on:click={handleCreateThread}
				class="btn-primary flex items-center space-x-2"
			>
				<Plus class="w-4 h-4" />
				<span>New Message</span>
			</button>
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
	{/if}

	<!-- Search -->
	<div class="mb-6">
		<div class="relative">
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
				<Search class="h-5 w-5 text-gray-400" />
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search messages..."
				class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
			/>
		</div>
	</div>

	{#if loading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if filteredThreads.length === 0}
		<div class="text-center py-12">
			<MessageSquare class="mx-auto h-12 w-12 text-gray-400" />
			<h3 class="mt-2 text-sm font-medium text-gray-900">No messages</h3>
			<p class="mt-1 text-sm text-gray-500">
				{searchQuery ? 'No messages match your search.' : 'Get started by creating a new conversation.'}
			</p>
			{#if !searchQuery}
				<div class="mt-6">
					<button
						on:click={handleCreateThread}
						class="btn-primary"
					>
						<Plus class="w-4 h-4 mr-2" />
						New Message
					</button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Threads List -->
		<div class="bg-white shadow-sm rounded-lg border border-gray-200">
			{#each filteredThreads as thread (thread.id)}
				<a
					href="/messages/{thread.id}"
					class="block hover:bg-gray-50 border-b border-gray-200 last:border-b-0"
				>
					<div class="px-6 py-4">
						<div class="flex items-start space-x-4">
							<!-- Avatar -->
							<div class="flex-shrink-0">
								<div class="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
									<User class="w-6 h-6 text-blue-600" />
								</div>
							</div>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between">
									<div class="flex items-center space-x-2">
										<h3 class="text-sm font-medium text-gray-900 truncate">
											{getOtherUser(thread)?.legal_name || 'Unknown User'}
										</h3>
										{#if thread.unread_count > 0}
											<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
												{thread.unread_count}
											</span>
										{/if}
									</div>
									<div class="flex items-center space-x-2 text-xs text-gray-500">
										<Clock class="w-3 h-3" />
										<span>{formatMessageTime(thread.last_message_at)}</span>
									</div>
								</div>

								<div class="mt-1">
									<p class="text-sm text-gray-900 font-medium">
										{getThreadTitle(thread)}
									</p>
									{#if thread.order}
										<div class="flex items-center mt-1 text-xs text-gray-500">
											<Package class="w-3 h-3 mr-1" />
											<span>{thread.order.listing.title}</span>
										</div>
									{/if}
								</div>
							</div>

							<!-- Arrow -->
							<div class="flex-shrink-0">
								<ArrowRight class="w-4 h-4 text-gray-400" />
							</div>
						</div>
					</div>
				</a>
			{/each}
		</div>
	{/if}
</div>

<!-- New Thread Modal (placeholder) -->
{#if showNewThreadModal}
	<div class="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
		<div class="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
			<div class="mt-3 text-center">
				<h3 class="text-lg font-medium text-gray-900">New Message</h3>
				<div class="mt-2 px-7 py-3">
					<p class="text-sm text-gray-500">
						This feature will allow you to start a new conversation with another user.
					</p>
				</div>
				<div class="items-center px-4 py-3">
					<button
						on:click={() => showNewThreadModal = false}
						class="px-4 py-2 bg-gray-500 text-white text-base font-medium rounded-md w-full shadow-sm hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-300"
					>
						Close
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}

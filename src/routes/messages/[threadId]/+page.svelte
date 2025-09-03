<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { 
		getThreadWithMessages, 
		sendMessage, 
		markThreadAsRead,
		subscribeToThread,
		formatMessageTime,
		formatFileSize,
		type MessageThread,
		type Message
	} from '$lib/messaging';
import { mapApiErrorToMessage } from '$lib/errors';
import { toastError, toastSuccess } from '$lib/toast';
	import { 
		ArrowLeft, 
		Send, 
		Paperclip, 
		Image, 
		File,
		User,
		Package,
		Clock,
		MessageSquare
	} from 'lucide-svelte';

	let thread: MessageThread | null = null;
	let messages: Message[] = [];
	let loading = true;
	let error = '';
	let user: any = null;
	let newMessage = '';
	let sending = false;
	let messagesContainer: HTMLElement;

	$: threadId = $page.params.threadId;

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		if (!user) {
			error = 'Please sign in to view messages';
			loading = false;
			return;
		}

		await loadThread();

		// Set up real-time subscription for new messages
		const subscription = subscribeToThread(threadId, (newMessage) => {
			messages = [...messages, newMessage];
			scrollToBottom();
			
			// Mark as read if not from current user
			if (newMessage.sender_id !== user.id) {
				markThreadAsRead(threadId, user.id);
			}
		});

		return () => {
			subscription.unsubscribe();
		};
	});

	async function loadThread() {
		try {
			loading = true;
			const result = await getThreadWithMessages(threadId);
			
			if (!result) {
				error = 'Thread not found';
				return;
			}

			thread = result.thread;
			messages = result.messages;

			// Mark messages as read
			await markThreadAsRead(threadId, user.id);

			// Scroll to bottom after messages load
			setTimeout(scrollToBottom, 100);
		} catch (err) {
			console.error('Error loading thread:', err);
			error = mapApiErrorToMessage(err);
			toastError(error);
		} finally {
			loading = false;
		}
	}

	async function handleSendMessage() {
		if (!newMessage.trim() || sending) return;

		sending = true;
		try {
			const message = await sendMessage({
				thread_id: threadId,
				content: newMessage.trim(),
				message_type: 'text'
			});

			if (message) {
				newMessage = '';
				messages = [...messages, message];
				scrollToBottom();
				toastSuccess('Message sent');
			}
		} catch (err) {
			console.error('Error sending message:', err);
			error = mapApiErrorToMessage(err);
			toastError(error);
		} finally {
			sending = false;
		}
	}

	function handleKeyPress(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			handleSendMessage();
		}
	}

	function scrollToBottom() {
		if (messagesContainer) {
			messagesContainer.scrollTop = messagesContainer.scrollHeight;
		}
	}

	function getOtherUser(): any {
		if (!thread || !user) return null;
		return user.id === thread.buyer_id ? thread.seller : thread.buyer;
	}

	function isOwnMessage(message: Message): boolean {
		return message.sender_id === user?.id;
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}

	function renderMessageContent(message: Message) {
		switch (message.message_type) {
			case 'image':
				return 'image';
			case 'file':
				return 'file';
			default:
				return 'text';
		}
	}
</script>

<svelte:head>
	<title>Messages - {thread?.subject || 'Conversation'}</title>
</svelte:head>

<div class="max-w-4xl mx-auto h-screen flex flex-col">
	<!-- Header -->
	<div class="bg-white border-b border-gray-200 px-6 py-4">
		<div class="flex items-center space-x-4">
			<a href="/messages" class="text-gray-600 hover:text-gray-900">
				<ArrowLeft class="w-5 h-5" />
			</a>
			
			{#if thread}
				<div class="flex-1">
					<div class="flex items-center space-x-3">
						<div class="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
							<User class="w-5 h-5 text-blue-600" />
						</div>
						<div>
							<h1 class="text-lg font-semibold text-gray-900">
								{getOtherUser()?.legal_name || 'Unknown User'}
							</h1>
							{#if thread.order}
								<div class="flex items-center text-sm text-gray-500">
									<Package class="w-4 h-4 mr-1" />
									<span>{thread.order.listing.title}</span>
								</div>
							{/if}
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	{#if error}
		<div class="bg-red-50 border border-red-200 rounded-lg p-4 m-6">
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
		<div class="flex-1 flex justify-center items-center">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if thread}
		<!-- Messages Container -->
		<div 
			bind:this={messagesContainer}
			class="flex-1 overflow-y-auto p-6 space-y-4"
		>
			{#if messages.length === 0}
				<div class="text-center py-12">
					<MessageSquare class="mx-auto h-12 w-12 text-gray-400" />
					<h3 class="mt-2 text-sm font-medium text-gray-900">No messages yet</h3>
					<p class="mt-1 text-sm text-gray-500">
						Start the conversation by sending a message.
					</p>
				</div>
			{:else}
				{#each messages as message (message.id)}
					<div class="flex {isOwnMessage(message) ? 'justify-end' : 'justify-start'}">
						<div class="max-w-xs lg:max-w-md">
							<div class="flex items-end space-x-2">
								{#if !isOwnMessage(message)}
									<div class="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
										<User class="w-4 h-4 text-blue-600" />
									</div>
								{/if}
								
								<div class="flex flex-col space-y-1">
									<div class="bg-white border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
										{#if message.message_type === 'image'}
											<div class="space-y-2">
												<img 
													src={message.attachment_url} 
													alt="Image" 
													class="max-w-xs rounded-lg"
												/>
												{#if message.content}
													<p class="text-sm text-gray-700">{message.content}</p>
												{/if}
											</div>
										{:else if message.message_type === 'file'}
											<div class="space-y-2">
												<div class="flex items-center space-x-2 p-3 bg-gray-50 rounded-lg">
													<File class="w-4 h-4 text-gray-500" />
													<div class="flex-1 min-w-0">
														<p class="text-sm font-medium text-gray-900 truncate">
															{message.attachment_name}
														</p>
														<p class="text-xs text-gray-500">
															{message.attachment_size ? formatFileSize(message.attachment_size) : ''}
														</p>
													</div>
												</div>
												{#if message.content}
													<p class="text-sm text-gray-700">{message.content}</p>
												{/if}
											</div>
										{:else}
											<p class="text-sm text-gray-700 whitespace-pre-wrap">{message.content}</p>
										{/if}
									</div>
									
									<div class="flex items-center space-x-2 text-xs text-gray-500">
										<Clock class="w-3 h-3" />
										<span>{formatMessageTime(message.created_at)}</span>
										{#if message.read_at && isOwnMessage(message)}
											<span class="text-blue-500">✓ Read</span>
										{/if}
									</div>
								</div>
								
								{#if isOwnMessage(message)}
									<div class="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0">
										<User class="w-4 h-4 text-green-600" />
									</div>
								{/if}
							</div>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		<!-- Message Input -->
		<div class="bg-white border-t border-gray-200 px-6 py-4">
			<form on:submit|preventDefault={handleSendMessage} class="flex items-end space-x-4">
				<div class="flex-1">
					<textarea
						bind:value={newMessage}
						on:keypress={handleKeyPress}
						placeholder="Type your message..."
						rows="1"
						class="block w-full border border-gray-300 rounded-lg px-4 py-3 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
						style="min-height: 44px; max-height: 120px;"
					></textarea>
				</div>
				
				<div class="flex items-center space-x-2">
					<button
						type="button"
						class="p-2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-lg"
						title="Attach file"
					>
						<Paperclip class="w-5 h-5" />
					</button>
					
					<button
						type="submit"
						disabled={!newMessage.trim() || sending}
						class="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white p-2 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors"
						title="Send message"
					>
						{#if sending}
							<div class="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
						{:else}
							<Send class="w-5 h-5" />
						{/if}
					</button>
				</div>
			</form>
		</div>
	{/if}
</div>

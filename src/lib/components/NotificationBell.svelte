<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { getUnreadNotificationCount, getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '$lib/notifications';
	import type { Notification } from '$lib/notifications';

	let unreadCount = 0;
	let notifications: Notification[] = [];
	let showDropdown = false;
	let loading = false;

	onMount(async () => {
		await loadNotifications();
		
		// Set up real-time subscription for notifications
		const channel = supabase
			.channel('notifications')
			.on('postgres_changes', {
				event: 'INSERT',
				schema: 'public',
				table: 'notifications'
			}, async () => {
				await loadNotifications();
			})
			.subscribe();

		return () => {
			supabase.removeChannel(channel);
		};
	});

	async function loadNotifications() {
		try {
			const { data: { session } } = await supabase.auth.getSession();
			if (!session?.user) return;

			unreadCount = await getUnreadNotificationCount(session.user.id);
			notifications = await getUserNotifications(session.user.id);
		} catch (error) {
			console.error('Error loading notifications:', error);
		}
	}

	async function markAsRead(notificationId: string) {
		await markNotificationAsRead(notificationId);
		await loadNotifications();
	}

	function toggleDropdown() {
		showDropdown = !showDropdown;
	}

	function closeDropdown() {
		showDropdown = false;
	}

	function getNotificationIcon(type: Notification['type']) {
		switch (type) {
			case 'order_paid':
				return '💰';
			case 'order_shipped':
				return '📦';
			case 'order_delivered':
				return '✅';
			case 'payment_failed':
				return '❌';
			case 'dispute_created':
				return '⚠️';
			case 'new_message':
				return '💬';
			default:
				return '🔔';
		}
	}

	function formatTimeAgo(dateString: string) {
		const date = new Date(dateString);
		const now = new Date();
		const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

		if (diffInSeconds < 60) return 'Just now';
		if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
		if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
		return `${Math.floor(diffInSeconds / 86400)}d ago`;
	}
</script>

<div class="relative">
	<!-- Notification Bell -->
	<button
		on:click={toggleDropdown}
		class="relative p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded-full"
		aria-label="Notifications"
	>
		<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-5 5v-5zM10.5 3.75a6 6 0 0 1 6 6v4.5l2.25 2.25a1.5 1.5 0 0 1-1.5 2.25h-13.5a1.5 1.5 0 0 1-1.5-2.25L6 14.25V9.75a6 6 0 0 1 6-6z" />
		</svg>
		
		<!-- Unread Badge -->
		{#if unreadCount > 0}
			<span class="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
				{unreadCount > 99 ? '99+' : unreadCount}
			</span>
		{/if}
	</button>

	<!-- Dropdown -->
	{#if showDropdown}
		<div class="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg border border-gray-200 z-50">
			<div class="p-4 border-b border-gray-200">
				<div class="flex items-center justify-between">
					<h3 class="text-lg font-semibold text-gray-900">Notifications</h3>
					{#if unreadCount > 0}
						<button
							on:click={() => markAllNotificationsAsRead()}
							class="text-sm text-blue-600 hover:text-blue-800"
						>
							Mark all read
						</button>
					{/if}
				</div>
			</div>

			<div class="max-h-96 overflow-y-auto">
				{#if notifications.length === 0}
					<div class="p-4 text-center text-gray-500">
						No notifications
					</div>
				{:else}
					{#each notifications as notification (notification.id)}
						<div class="p-4 border-b border-gray-100 hover:bg-gray-50 {notification.read ? 'opacity-75' : ''}">
							<div class="flex items-start space-x-3">
								<div class="flex-shrink-0 text-2xl">
									{getNotificationIcon(notification.type)}
								</div>
								<div class="flex-1 min-w-0">
									<div class="flex items-center justify-between">
										<p class="text-sm font-medium text-gray-900 {notification.read ? '' : 'font-semibold'}">
											{notification.title}
										</p>
										<button
											on:click={() => markAsRead(notification.id)}
											class="text-xs text-gray-400 hover:text-gray-600"
										>
											×
										</button>
									</div>
									<p class="text-sm text-gray-600 mt-1">
										{notification.message}
									</p>
									<p class="text-xs text-gray-400 mt-2">
										{formatTimeAgo(notification.created_at)}
									</p>
								</div>
							</div>
						</div>
					{/each}
				{/if}
			</div>

			<div class="p-4 border-t border-gray-200">
				<a href="/notifications" class="text-sm text-blue-600 hover:text-blue-800">
					View all notifications
				</a>
			</div>
		</div>
	{/if}
</div>

<!-- Click outside to close -->
{#if showDropdown}
	<div 
		class="fixed inset-0 z-40" 
		on:click={closeDropdown}
		on:keydown={(e) => e.key === 'Escape' && closeDropdown()}
		role="button"
		tabindex="-1"
		aria-label="Close notifications"
	></div>
{/if}

<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import {
	getUserDisputes,
	getDisputeStatusColor,
	getDisputeStatusLabel,
	getDisputeTypeLabel,
	formatPrice,
	type Dispute
} from '$lib/disputes';
	import {
		AlertTriangle,
		Plus,
		Search,
		Clock,
		User,
		Package,
		ArrowRight,
		Filter
	} from 'lucide-svelte';

	let disputes: Dispute[] = [];
	let loading = true;
	let error = '';
	let user: any = null;
	let searchQuery = '';
	let statusFilter = 'all';

	$: filteredDisputes = disputes.filter(dispute => {
		// Search filter
		const matchesSearch = !searchQuery ||
			dispute.reason.toLowerCase().includes(searchQuery.toLowerCase()) ||
			dispute.order?.listing.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
			dispute.initiator?.legal_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			dispute.respondent?.legal_name.toLowerCase().includes(searchQuery.toLowerCase());

		// Status filter
		const matchesStatus = statusFilter === 'all' || dispute.status === statusFilter;

		return matchesSearch && matchesStatus;
	});

	onMount(async () => {
		// Get user session
		const { data: { session } } = await supabase.auth.getSession();
		user = session?.user || null;

		if (!user) {
			error = 'Please sign in to view disputes';
			loading = false;
			return;
		}

		await loadDisputes();
	});

	async function loadDisputes() {
		try {
			loading = true;
			disputes = await getUserDisputes(user.id);
		} catch (err) {
			console.error('Error loading disputes:', err);
			error = 'Failed to load disputes';
		} finally {
			loading = false;
		}
	}

	function getOtherUser(dispute: Dispute) {
		if (!user) return null;
		return user.id === dispute.initiator_id ? dispute.respondent : dispute.initiator;
	}

	function getMainPhoto(photos: any[]): string {
		if (!photos || photos.length === 0) {
			return '/placeholder-image.jpg';
		}
		const sortedPhotos = photos.sort((a, b) => a.order_idx - b.order_idx);
		return sortedPhotos[0].url;
	}

	function formatDate(dateString: string): string {
		return new Date(dateString).toLocaleDateString('en-AU', {
			year: 'numeric',
			month: 'short',
			day: 'numeric'
		});
	}
</script>

<svelte:head>
	<title>Disputes - Aussie Market</title>
</svelte:head>

<div class="max-w-4xl mx-auto p-6">
	<!-- Header -->
	<div class="mb-8">
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Disputes</h1>
				<p class="text-gray-600 mt-1">
					{disputes.length} dispute{disputes.length !== 1 ? 's' : ''} total
				</p>
			</div>
			<a
				href="/disputes/new"
				class="btn-primary flex items-center space-x-2"
			>
				<Plus class="w-4 h-4" />
				<span>File Dispute</span>
			</a>
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

	<!-- Search and Filters -->
	<div class="mb-6 space-y-4">
		<!-- Search -->
		<div class="relative">
			<div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
				<Search class="h-5 w-5 text-gray-400" />
			</div>
			<input
				type="text"
				bind:value={searchQuery}
				placeholder="Search disputes..."
				class="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
			/>
		</div>

		<!-- Status Filter -->
		<div class="flex items-center space-x-4">
			<Filter class="w-5 h-5 text-gray-400" />
			<select
				bind:value={statusFilter}
				class="border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
			>
				<option value="all">All Status</option>
				<option value="open">Open</option>
				<option value="under_review">Under Review</option>
				<option value="resolved">Resolved</option>
				<option value="closed">Closed</option>
				<option value="escalated">Escalated</option>
			</select>
		</div>
	</div>

	{#if loading}
		<div class="flex justify-center items-center h-64">
			<div class="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
		</div>
	{:else if filteredDisputes.length === 0}
		<div class="text-center py-12">
			<AlertTriangle class="mx-auto h-12 w-12 text-gray-400" />
			<h3 class="mt-2 text-sm font-medium text-gray-900">No disputes</h3>
			<p class="mt-1 text-sm text-gray-500">
				{searchQuery || statusFilter !== 'all' ? 'No disputes match your filters.' : 'You haven\'t filed any disputes yet.'}
			</p>
			{#if !searchQuery && statusFilter === 'all'}
				<div class="mt-6">
					<a href="/disputes/new" class="btn-primary">
						<Plus class="w-4 h-4 mr-2" />
						File Your First Dispute
					</a>
				</div>
			{/if}
		</div>
	{:else}
		<!-- Disputes List -->
		<div class="bg-white shadow-sm rounded-lg border border-gray-200">
			{#each filteredDisputes as dispute (dispute.id)}
				<a
					href="/disputes/{dispute.id}"
					class="block hover:bg-gray-50 border-b border-gray-200 last:border-b-0"
				>
					<div class="px-6 py-4">
						<div class="flex items-start space-x-4">
							<!-- Item Image -->
							<div class="flex-shrink-0">
								<img
									src={getMainPhoto(dispute.order?.listing.listing_photos || [])}
									alt={dispute.order?.listing.title || 'Item'}
									class="w-16 h-16 object-cover rounded-lg"
								/>
							</div>

							<!-- Content -->
							<div class="flex-1 min-w-0">
								<div class="flex items-center justify-between">
									<div class="flex items-center space-x-2">
										<h3 class="text-sm font-medium text-gray-900 truncate">
											{getOtherUser(dispute)?.legal_name || 'Unknown User'}
										</h3>
										<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {getDisputeStatusColor(dispute.status)}">
											{getDisputeStatusLabel(dispute.status)}
										</span>
									</div>
									<div class="flex items-center space-x-2 text-xs text-gray-500">
										<Clock class="w-3 h-3" />
										<span>{formatDate(dispute.created_at)}</span>
									</div>
								</div>

								<div class="mt-1">
									<p class="text-sm text-gray-900 font-medium">
										{dispute.order?.listing.title || 'Unknown Item'}
									</p>
									<p class="text-sm text-gray-600 mt-1">
										{dispute.reason}
									</p>
									<div class="flex items-center justify-between mt-2">
										<div class="flex items-center space-x-4 text-xs text-gray-500">
											<span class="flex items-center">
												<Package class="w-3 h-3 mr-1" />
												{getDisputeTypeLabel(dispute.dispute_type)}
											</span>
											<span class="font-medium text-gray-900">
												{formatPrice(dispute.amount_cents)}
											</span>
										</div>
									</div>
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

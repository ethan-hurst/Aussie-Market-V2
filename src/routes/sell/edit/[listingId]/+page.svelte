<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { 
		canEditListing, 
		updateListing,
		CATEGORIES, 
		CONDITIONS, 
		AUSTRALIAN_STATES,
		formatPrice,
		type ListingUpdateData
	} from '$lib/listings';
	import { uploadListingPhoto } from '$lib/storage';
	import ImageUpload from '$lib/components/ImageUpload.svelte';
	import { Upload, X, Plus, DollarSign, Calendar, MapPin, Package, Truck, AlertCircle, Save } from 'lucide-svelte';

	let user: any = null;
	let listing: any = null;
	let loading = true;
	let submitting = false;
	let error = '';
	let permissionError = '';

	// Form data
	let title = '';
	let description = '';
	let categoryId = '';
	let condition = 'good';
	let startCents = '';
	let reserveCents = '';
	let buyNowCents = '';
	let pickup = true;
	let shipping = false;
	let location = {
		street: '',
		suburb: '',
		postcode: '',
		state: ''
	};
	let startAt = '';
	let endAt = '';
	let photos: File[] = [];

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) {
			goto('/login');
			return;
		}

		user = session.user;
		const listingId = $page.params.listingId;
		
		// Check if user can edit this listing
		const permissionCheck = await canEditListing(user.id, listingId);
		if (!permissionCheck.allowed) {
			permissionError = permissionCheck.reason || 'You cannot edit this listing';
			loading = false;
			return;
		}

		listing = permissionCheck.listing;

		// Populate form with existing data
		title = listing.title;
		description = listing.description;
		categoryId = listing.category_id.toString();
		condition = listing.condition;
		startCents = (listing.start_cents / 100).toString();
		reserveCents = listing.reserve_cents ? (listing.reserve_cents / 100).toString() : '';
		buyNowCents = listing.buy_now_cents ? (listing.buy_now_cents / 100).toString() : '';
		pickup = listing.pickup;
		shipping = listing.shipping;
		location = listing.location;
		startAt = listing.start_at.slice(0, 16);
		endAt = listing.end_at.slice(0, 16);

		loading = false;
	});

	function handlePhotoUpload(event: CustomEvent) {
		photos = [...photos, ...event.detail.files];
	}

	function handlePhotoRemove(event: CustomEvent) {
		const index = event.detail.index;
		photos = photos.filter((_, i) => i !== index);
	}

	function calculateEndTime() {
		if (startAt) {
			const start = new Date(startAt);
			const end = new Date(start.getTime() + (7 * 24 * 60 * 60 * 1000)); // 7 days
			endAt = end.toISOString().slice(0, 16);
		}
	}

	async function handleSubmit() {
		submitting = true;
		error = '';

		try {
			// Validate required fields
			if (!title || !description || !categoryId || !startCents || !startAt || !endAt) {
				error = 'Please fill in all required fields';
				return;
			}

			// Prepare listing data
			const listingData: ListingUpdateData = {
				title,
				description,
				category_id: parseInt(categoryId),
				condition,
				start_cents: parseInt(startCents) * 100,
				reserve_cents: reserveCents ? parseInt(reserveCents) * 100 : undefined,
				buy_now_cents: buyNowCents ? parseInt(buyNowCents) * 100 : undefined,
				pickup,
				shipping,
				location,
				start_at: startAt,
				end_at: endAt
			};

			// Update listing
			const response = await fetch(`/api/listings/${listing.id}`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(listingData)
			});

			const result = await response.json();

			if (!response.ok) {
				error = result.error || 'Failed to update listing';
				return;
			}

			// Upload new photos if any
			for (let i = 0; i < photos.length; i++) {
				const photo = photos[i];
				const uploadResult = await uploadListingPhoto(photo, listing.id, i);
				
				// Note: Photo upload errors won't fail the listing update
				// but should be logged for monitoring
				if (!uploadResult) {
					console.error(`Failed to upload photo ${i} for listing ${listing.id}`);
				}
			}

			// Redirect to listing page
			goto(`/l/${listing.id}?message=updated`);

		} catch (err) {
			error = 'An error occurred while updating your listing';
			console.error('Submit error:', err);
		} finally {
			submitting = false;
		}
	}

	async function handleDelete() {
		if (!confirm('Are you sure you want to delete this listing? This action cannot be undone.')) {
			return;
		}

		submitting = true;
		error = '';

		try {
			const response = await fetch(`/api/listings/${listing.id}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				const result = await response.json();
				error = result.error || 'Failed to delete listing';
				return;
			}

			// Redirect to user's listings
			goto('/account/listings?message=deleted');

		} catch (err) {
			error = 'An error occurred while deleting your listing';
			console.error('Delete error:', err);
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>Edit Listing - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else if permissionError}
	<div class="max-w-4xl mx-auto space-y-8">
		<div class="text-center py-12">
			<AlertCircle class="mx-auto h-12 w-12 text-red-400 mb-4" />
			<h2 class="text-2xl font-bold text-gray-900 mb-4">Cannot Edit Listing</h2>
			<p class="text-gray-600 mb-6">{permissionError}</p>
			<div class="space-x-4">
				<a href="/account/listings" class="btn-primary">My Listings</a>
				<a href="/" class="btn btn-outline">Back to Home</a>
			</div>
		</div>
	</div>
{:else}
	<div class="max-w-4xl mx-auto space-y-8">
		<!-- Header -->
		<div class="flex items-center justify-between">
			<div>
				<h1 class="text-3xl font-bold text-gray-900">Edit Listing</h1>
				<p class="text-gray-600 mt-2">Update your listing details and photos</p>
			</div>
			<div class="flex space-x-4">
				<button 
					on:click={handleDelete}
					disabled={submitting}
					class="btn btn-outline btn-danger"
				>
					Delete Listing
				</button>
			</div>
		</div>

		{#if error}
			<div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
				{error}
			</div>
		{/if}

		<form on:submit|preventDefault={handleSubmit} class="space-y-8">
			<!-- Basic Information -->
			<div class="card">
				<div class="card-header">
					<h2 class="card-title">Basic Information</h2>
					<p class="card-description">Tell buyers about your item</p>
				</div>
				<div class="card-content space-y-6">
					<div>
						<label for="title" class="block text-sm font-medium text-gray-700 mb-2">
							Title *
						</label>
						<input
							id="title"
							type="text"
							bind:value={title}
							maxlength="140"
							required
							class="input"
							placeholder="e.g., iPhone 14 Pro Max 256GB - Excellent Condition"
						/>
						<p class="text-sm text-gray-500 mt-1">{title.length}/140 characters</p>
					</div>

					<div>
						<label for="description" class="block text-sm font-medium text-gray-700 mb-2">
							Description *
						</label>
						<textarea
							id="description"
							bind:value={description}
							maxlength="4096"
							rows="6"
							required
							class="input"
							placeholder="Provide a detailed description of your item, including condition, features, and any relevant details..."
						></textarea>
						<p class="text-sm text-gray-500 mt-1">{description.length}/4096 characters</p>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<label for="category" class="block text-sm font-medium text-gray-700 mb-2">
								Category *
							</label>
							<select
								id="category"
								bind:value={categoryId}
								required
								class="input"
							>
								<option value="">Select a category</option>
								{#each CATEGORIES as category}
									<option value={category.id}>{category.name}</option>
								{/each}
							</select>
						</div>

						<div>
							<label for="condition" class="block text-sm font-medium text-gray-700 mb-2">
								Condition *
							</label>
							<select
								id="condition"
								bind:value={condition}
								required
								class="input"
							>
								{#each CONDITIONS as cond}
									<option value={cond.id}>{cond.name}</option>
								{/each}
							</select>
						</div>
					</div>
				</div>
			</div>

			<!-- Pricing -->
			<div class="card">
				<div class="card-header">
					<h2 class="card-title">Pricing & Auction Settings</h2>
					<p class="card-description">Set your starting price and auction duration</p>
				</div>
				<div class="card-content space-y-6">
					<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div>
							<label for="startPrice" class="block text-sm font-medium text-gray-700 mb-2">
								Starting Price (AUD) *
							</label>
							<div class="relative">
								<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									id="startPrice"
									type="number"
									bind:value={startCents}
									min="1"
									step="0.01"
									required
									class="input pl-10"
									placeholder="0.00"
								/>
							</div>
						</div>

						<div>
							<label for="reservePrice" class="block text-sm font-medium text-gray-700 mb-2">
								Reserve Price (Optional)
							</label>
							<div class="relative">
								<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									id="reservePrice"
									type="number"
									bind:value={reserveCents}
									min="0"
									step="0.01"
									class="input pl-10"
									placeholder="0.00"
								/>
							</div>
							<p class="text-sm text-gray-500 mt-1">Minimum price you'll accept</p>
						</div>

						<div>
							<label for="buyNowPrice" class="block text-sm font-medium text-gray-700 mb-2">
								Buy Now Price (Optional)
							</label>
							<div class="relative">
								<DollarSign class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									id="buyNowPrice"
									type="number"
									bind:value={buyNowCents}
									min="0"
									step="0.01"
									class="input pl-10"
									placeholder="0.00"
								/>
							</div>
							<p class="text-sm text-gray-500 mt-1">Instant purchase option</p>
						</div>
					</div>

					<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
						<div>
							<label for="startAt" class="block text-sm font-medium text-gray-700 mb-2">
								Auction Start Date *
							</label>
							<div class="relative">
								<Calendar class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									id="startAt"
									type="datetime-local"
									bind:value={startAt}
									on:change={calculateEndTime}
									required
									class="input pl-10"
								/>
							</div>
						</div>

						<div>
							<label for="endAt" class="block text-sm font-medium text-gray-700 mb-2">
								Auction End Date *
							</label>
							<div class="relative">
								<Calendar class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									id="endAt"
									type="datetime-local"
									bind:value={endAt}
									required
									class="input pl-10"
								/>
							</div>
						</div>
					</div>
				</div>
			</div>

			<!-- Location & Delivery -->
			<div class="card">
				<div class="card-header">
					<h2 class="card-title">Location & Delivery Options</h2>
					<p class="card-description">Where buyers can collect and shipping options</p>
				</div>
				<div class="card-content space-y-6">
					<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
						<div>
							<label for="suburb" class="block text-sm font-medium text-gray-700 mb-2">
								Suburb *
							</label>
							<div class="relative">
								<MapPin class="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
								<input
									id="suburb"
									type="text"
									bind:value={location.suburb}
									required
									class="input pl-10"
									placeholder="Enter suburb"
								/>
							</div>
						</div>

						<div>
							<label for="postcode" class="block text-sm font-medium text-gray-700 mb-2">
								Postcode *
							</label>
							<input
								id="postcode"
								type="text"
								bind:value={location.postcode}
								required
								class="input"
								placeholder="Enter postcode"
							/>
						</div>

						<div>
							<label for="state" class="block text-sm font-medium text-gray-700 mb-2">
								State *
							</label>
							<select
								id="state"
								bind:value={location.state}
								required
								class="input"
							>
								<option value="">Select state</option>
								{#each AUSTRALIAN_STATES as state}
									<option value={state.code}>{state.name}</option>
								{/each}
							</select>
						</div>
					</div>

					<div class="space-y-4">
						<div class="flex items-center">
							<input
								id="pickup"
								type="checkbox"
								bind:checked={pickup}
								class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
							/>
							<label for="pickup" class="ml-2 flex items-center text-sm text-gray-900">
								<Package class="w-4 h-4 mr-2" />
								Allow local pickup
							</label>
						</div>

						<div class="flex items-center">
							<input
								id="shipping"
								type="checkbox"
								bind:checked={shipping}
								class="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
							/>
							<label for="shipping" class="ml-2 flex items-center text-sm text-gray-900">
								<Truck class="w-4 h-4 mr-2" />
								Offer shipping
							</label>
						</div>
					</div>
				</div>
			</div>

			<!-- Photos -->
			<div class="card">
				<div class="card-header">
					<h2 class="card-title">Photos</h2>
					<p class="card-description">Upload additional photos of your item (up to 10 total)</p>
				</div>
				<div class="card-content">
					<ImageUpload
						multiple={true}
						maxFiles={10}
						on:upload={handlePhotoUpload}
						on:remove={handlePhotoRemove}
					/>
				</div>
			</div>

			<!-- Submit -->
			<div class="flex justify-end space-x-4">
				<button type="button" on:click={() => goto(`/l/${listing.id}`)} class="btn btn-outline btn-lg">
					Cancel
				</button>
				<button type="submit" disabled={submitting} class="btn-primary btn-lg">
					{submitting ? 'Saving...' : 'Save Changes'}
				</button>
			</div>
		</form>
	</div>
{/if}

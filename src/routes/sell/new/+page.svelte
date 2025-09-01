<script lang="ts">
	import { onMount } from 'svelte';
	import { supabase } from '$lib/supabase';
	import { goto } from '$app/navigation';
	import { Upload, X, Plus, DollarSign, Calendar, MapPin, Package, Truck } from 'lucide-svelte';

	let user: any = null;
	let loading = true;
	let submitting = false;
	let error = '';

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
		suburb: '',
		postcode: '',
		state: ''
	};
	let startAt = '';
	let endAt = '';
	let photos: File[] = [];

	const categories = [
		{ id: '1', name: 'Electronics' },
		{ id: '2', name: 'Home & Garden' },
		{ id: '3', name: 'Fashion' },
		{ id: '4', name: 'Sports & Leisure' },
		{ id: '5', name: 'Collectibles' },
		{ id: '6', name: 'Vehicles' },
		{ id: '7', name: 'Books & Media' }
	];

	const conditions = [
		{ id: 'new', name: 'New' },
		{ id: 'like_new', name: 'Like New' },
		{ id: 'good', name: 'Good' },
		{ id: 'fair', name: 'Fair' },
		{ id: 'parts', name: 'For Parts' }
	];

	onMount(async () => {
		const { data: { session } } = await supabase.auth.getSession();
		if (!session) {
			goto('/login');
			return;
		}

		user = session.user;
		
		// Check if user is verified seller
		const { data: userProfile } = await supabase
			.from('users')
			.select('kyc, role')
			.eq('id', user.id)
			.single();

		if (userProfile?.role !== 'seller' || userProfile?.kyc !== 'passed') {
			goto('/account?message=kyc_required');
			return;
		}

		loading = false;
	});

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files) {
			const newFiles = Array.from(target.files);
			photos = [...photos, ...newFiles].slice(0, 10); // Max 10 photos
		}
	}

	function removePhoto(index: number) {
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
			// Validate form
			if (!title || !description || !categoryId || !startCents || !startAt || !endAt) {
				error = 'Please fill in all required fields';
				return;
			}

			if (photos.length === 0) {
				error = 'Please upload at least one photo';
				return;
			}

			// Create listing
			const { data: listing, error: listingError } = await supabase
				.from('listings')
				.insert({
					seller_id: user.id,
					title,
					description,
					category_id: parseInt(categoryId),
					condition,
					start_cents: parseInt(startCents) * 100,
					reserve_cents: reserveCents ? parseInt(reserveCents) * 100 : null,
					buy_now_cents: buyNowCents ? parseInt(buyNowCents) * 100 : null,
					pickup,
					shipping,
					location,
					start_at: startAt,
					end_at: endAt,
					status: 'scheduled'
				})
				.select()
				.single();

			if (listingError) {
				error = listingError.message;
				return;
			}

			// Upload photos
			for (let i = 0; i < photos.length; i++) {
				const photo = photos[i];
				const fileName = `${listing.id}/${i}_${Date.now()}.jpg`;
				
				const { error: uploadError } = await supabase.storage
					.from('listing-photos')
					.upload(fileName, photo);

				if (uploadError) {
					console.error('Photo upload error:', uploadError);
					continue;
				}

				// Get public URL
				const { data: urlData } = supabase.storage
					.from('listing-photos')
					.getPublicUrl(fileName);

				// Save photo record
				await supabase
					.from('listing_photos')
					.insert({
						listing_id: listing.id,
						url: urlData.publicUrl,
						order_idx: i
					});
			}

			// Redirect to listing page
			goto(`/l/${listing.id}?message=created`);

		} catch (err) {
			error = 'An error occurred while creating your listing';
			console.error('Submit error:', err);
		} finally {
			submitting = false;
		}
	}

	function formatCurrency(value: string): string {
		if (!value) return '';
		const num = parseFloat(value);
		return new Intl.NumberFormat('en-AU', {
			style: 'currency',
			currency: 'AUD'
		}).format(num);
	}
</script>

<svelte:head>
	<title>Create New Listing - Aussie Market</title>
</svelte:head>

{#if loading}
	<div class="flex items-center justify-center h-64">
		<div class="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
	</div>
{:else}
	<div class="max-w-4xl mx-auto space-y-8">
		<!-- Header -->
		<div>
			<h1 class="text-3xl font-bold text-gray-900">Create New Listing</h1>
			<p class="text-gray-600 mt-2">List your item for auction and reach thousands of potential buyers</p>
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
								{#each categories as category}
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
								{#each conditions as cond}
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
								<option value="NSW">New South Wales</option>
								<option value="VIC">Victoria</option>
								<option value="QLD">Queensland</option>
								<option value="WA">Western Australia</option>
								<option value="SA">South Australia</option>
								<option value="TAS">Tasmania</option>
								<option value="ACT">Australian Capital Territory</option>
								<option value="NT">Northern Territory</option>
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
					<p class="card-description">Upload clear photos of your item (up to 10 photos)</p>
				</div>
				<div class="card-content">
					<div class="space-y-4">
						<div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
							<Upload class="mx-auto h-12 w-12 text-gray-400" />
							<div class="mt-4">
								<label for="photo-upload" class="btn-primary cursor-pointer">
									<Plus class="w-4 h-4 mr-2" />
									Upload Photos
								</label>
								<input
									id="photo-upload"
									type="file"
									accept="image/*"
									multiple
									on:change={handleFileSelect}
									class="hidden"
								/>
							</div>
							<p class="text-sm text-gray-500 mt-2">
								PNG, JPG, GIF up to 10MB each
							</p>
						</div>

						{#if photos.length > 0}
							<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
								{#each photos as photo, index}
									<div class="relative group">
										<img
											src={URL.createObjectURL(photo)}
											alt="Preview"
											class="w-full h-32 object-cover rounded-lg"
										/>
										<button
											type="button"
											on:click={() => removePhoto(index)}
											class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
										>
											<X class="w-4 h-4" />
										</button>
									</div>
								{/each}
							</div>
							<p class="text-sm text-gray-500">
								{photos.length} photo{photos.length !== 1 ? 's' : ''} selected
							</p>
						{/if}
					</div>
				</div>
			</div>

			<!-- Submit -->
			<div class="flex justify-end space-x-4">
				<button type="button" on:click={() => goto('/')} class="btn btn-outline btn-lg">
					Cancel
				</button>
				<button type="submit" disabled={submitting} class="btn-primary btn-lg">
					{submitting ? 'Creating...' : 'Create Listing'}
				</button>
			</div>
		</form>
	</div>
{/if}

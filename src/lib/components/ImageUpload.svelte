<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { Upload, X, Image, AlertCircle, CheckCircle } from 'lucide-svelte';
	import { validateFile, MAX_FILE_SIZE, ALLOWED_IMAGE_TYPES } from '$lib/storage';
	import { toastError, toastSuccess } from '$lib/toast';

	export let multiple = false;
	export let maxFiles = 10;
	export let acceptedTypes = ALLOWED_IMAGE_TYPES;
	export let maxSize = MAX_FILE_SIZE;
	export let disabled = false;
	export let loading = false;

	const dispatch = createEventDispatcher<{
		upload: { files: File[] };
		error: { message: string };
		remove: { index: number };
	}>();

	let dragOver = false;
	let files: File[] = [];
	let errors: string[] = [];

	function handleDragOver(event: DragEvent) {
		event.preventDefault();
		dragOver = true;
	}

	function handleDragLeave(event: DragEvent) {
		event.preventDefault();
		dragOver = false;
	}

	function handleDrop(event: DragEvent) {
		event.preventDefault();
		dragOver = false;

		if (disabled || loading) return;

		const droppedFiles = Array.from(event.dataTransfer?.files || []);
		processFiles(droppedFiles);
	}

	function handleFileSelect(event: Event) {
		const target = event.target as HTMLInputElement;
		if (target.files) {
			const selectedFiles = Array.from(target.files);
			processFiles(selectedFiles);
		}
	}

	function processFiles(newFiles: File[]) {
		errors = [];

		// Validate file count
		if (!multiple && newFiles.length > 1) {
			errors.push('Only one file can be selected');
			return;
		}

		if (files.length + newFiles.length > maxFiles) {
			errors.push(`Maximum ${maxFiles} files allowed`);
			return;
		}

		// Validate each file
		for (const file of newFiles) {
			const validation = validateFile(file);
			if (!validation.valid) {
				errors.push(`${file.name}: ${validation.error}`);
			}
		}

		if (errors.length > 0) {
			dispatch('error', { message: errors.join(', ') });
			toastError(errors.join(', '));
			return;
		}

		// Add valid files
		if (multiple) {
			files = [...files, ...newFiles];
		} else {
			files = newFiles;
		}

		dispatch('upload', { files: newFiles });
		toastSuccess('Files ready to upload');
	}

	function removeFile(index: number) {
		files = files.filter((_, i) => i !== index);
		dispatch('remove', { index });
	}

	function formatFileSize(bytes: number): string {
		if (bytes === 0) return '0 Bytes';
		const k = 1024;
		const sizes = ['Bytes', 'KB', 'MB', 'GB'];
		const i = Math.floor(Math.log(bytes) / Math.log(k));
		return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
	}

	function getFileIcon(type: string) {
		if (type.startsWith('image/')) return Image;
		return Upload;
	}
</script>

<div class="space-y-4">
	<!-- Upload Area -->
	<div
		class="relative border-2 border-dashed rounded-lg p-6 text-center transition-colors {dragOver
			? 'border-primary-400 bg-primary-50'
			: 'border-gray-300 hover:border-gray-400'} {disabled || loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
		on:dragover={handleDragOver}
		on:dragleave={handleDragLeave}
		on:drop={handleDrop}
	>
		<Upload class="mx-auto h-12 w-12 text-gray-400" />
		<div class="mt-4">
			<label
				for="file-upload"
				class="btn-primary cursor-pointer {disabled || loading ? 'pointer-events-none' : ''}"
			>
				<Upload class="w-4 h-4 mr-2" />
				{loading ? 'Uploading...' : 'Choose Files'}
			</label>
			<input
				id="file-upload"
				type="file"
				accept={acceptedTypes.join(',')}
				multiple={multiple}
				on:change={handleFileSelect}
				class="hidden"
				disabled={disabled || loading}
			/>
		</div>
		<p class="text-sm text-gray-500 mt-2">
			{dragOver ? 'Drop files here' : 'Drag and drop files here, or click to select'}
		</p>
		<p class="text-xs text-gray-400 mt-1">
			{acceptedTypes.join(', ')} up to {formatFileSize(maxSize)} each
		</p>
	</div>

	<!-- Error Messages -->
	{#if errors.length > 0}
		<div class="bg-red-50 border border-red-200 rounded-md p-4">
			<div class="flex">
				<AlertCircle class="h-5 w-5 text-red-400" />
				<div class="ml-3">
					<h3 class="text-sm font-medium text-red-800">Upload Errors</h3>
					<div class="mt-2 text-sm text-red-700">
						<ul class="list-disc pl-5 space-y-1">
							{#each errors as error}
								<li>{error}</li>
							{/each}
						</ul>
					</div>
				</div>
			</div>
		</div>
	{/if}

	<!-- File Previews -->
	{#if files.length > 0}
		<div class="space-y-3">
			<h4 class="text-sm font-medium text-gray-900">
				Selected Files ({files.length}/{maxFiles})
			</h4>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				{#each files as file, index}
					<div class="relative group">
						{#if file.type.startsWith('image/')}
							<img
								src={URL.createObjectURL(file)}
								alt="Preview"
								class="w-full h-32 object-cover rounded-lg"
							/>
						{:else}
							{@const FileIcon = getFileIcon(file.type)}
							<div class="w-full h-32 bg-gray-100 rounded-lg flex items-center justify-center">
								<FileIcon class="w-8 h-8 text-gray-400" />
							</div>
						{/if}
						
						<button
							type="button"
							on:click={() => removeFile(index)}
							class="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<X class="w-4 h-4" />
						</button>
						
						<div class="mt-2">
							<p class="text-xs text-gray-600 truncate">{file.name}</p>
							<p class="text-xs text-gray-400">{formatFileSize(file.size)}</p>
						</div>
					</div>
				{/each}
			</div>
		</div>
	{/if}

	<!-- Loading State -->
	{#if loading}
		<div class="flex items-center justify-center py-4">
			<div class="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
			<span class="ml-2 text-sm text-gray-600">Processing files...</span>
		</div>
	{/if}
</div>

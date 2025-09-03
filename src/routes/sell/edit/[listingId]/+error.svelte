<script lang="ts">
  import Fallback from '$lib/components/Fallback.svelte';
  export let error: any;
  export let status: number;

  const title = status === 404 ? 'Listing not found' : 'Unable to load listing editor';
  const description = error?.message || 'Please refresh and try again.';
</script>

<div class="px-4 py-10">
  <Fallback {title} {description} />
  {#if status === 404}
    <p class="mt-4 text-sm text-gray-600">The listing may have been removed.</p>
  {/if}
</div>



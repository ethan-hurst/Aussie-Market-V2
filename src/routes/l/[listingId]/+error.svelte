<script lang="ts">
  import Fallback from '$lib/components/Fallback.svelte';
  export let error: any;
  export let status: number;

  const title = status === 404 ? 'Listing not found' : 'Unable to load listing';
  const description = error?.message || 'Please try again in a moment.';
</script>

<div class="px-4 py-10">
  <Fallback {title} {description} />
  <!-- You can provide more context here if needed -->
  {#if status === 404}
    <p class="mt-4 text-sm text-gray-600">It may have been removed or has ended.</p>
  {/if}
</div>



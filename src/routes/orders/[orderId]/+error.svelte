<script lang="ts">
  import Fallback from '$lib/components/Fallback.svelte';
  export let error: any;
  export let status: number;

  const title = status === 404 ? 'Order not found' : 'Unable to load order';
  const description = error?.message || 'Please refresh or try again later.';
</script>

<div class="px-4 py-10">
  <Fallback {title} {description} />
  {#if status !== 404}
    <p class="mt-4 text-sm text-gray-600">If the problem persists, contact support.</p>
  {/if}
</div>



<script lang="ts">
  import Fallback from '$lib/components/Fallback.svelte';
  export let error: any;
  export let status: number;

  const title = status === 404 ? 'KYC page not available' : 'Unable to load KYC';
  const description = error?.message || 'Please refresh or try again shortly.';
</script>

<div class="px-4 py-10">
  <Fallback {title} {description} />
  {#if status !== 404}
    <p class="mt-4 text-sm text-gray-600">If this persists, contact support.</p>
  {/if}
</div>



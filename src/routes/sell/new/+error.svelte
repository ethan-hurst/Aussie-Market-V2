<script lang="ts">
  import Fallback from '$lib/components/Fallback.svelte';
  export let error: any;
  export let status: number;

  const title = status === 404 ? 'Sell page not found' : 'Unable to load Sell page';
  const description = error?.message || 'Please try again later.';
</script>

<div class="px-4 py-10">
  <Fallback {title} {description} />
  {#if status !== 404}
    <p class="mt-4 text-sm text-gray-600">You can also retry or return to your account.</p>
  {/if}
</div>



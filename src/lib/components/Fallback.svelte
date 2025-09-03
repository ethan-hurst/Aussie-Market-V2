<script lang="ts">
  import { AlertCircle } from 'lucide-svelte';

  export let title: string = 'Something went wrong';
  export let description: string | null = null;
  export let actionLabel: string | null = null;
  export let onAction: (() => void) | null = null;
</script>

<section role="alert" aria-live="polite" class="w-full max-w-2xl mx-auto">
  <div class="bg-red-50 border border-red-200 rounded-md p-4">
    <div class="flex items-start">
      <div class="flex-shrink-0">
        <AlertCircle class="h-5 w-5 text-red-400" />
      </div>
      <div class="ml-3">
        <h2 class="text-sm font-medium text-red-800">{title}</h2>
        {#if description}
          <p class="mt-1 text-sm text-red-700">{description}</p>
        {/if}
        {#if onAction && actionLabel}
          <div class="mt-3">
            <button class="btn btn-outline" on:click={onAction}>{actionLabel}</button>
          </div>
        {/if}
        <slot />
      </div>
    </div>
  </div>
  <div class="mt-4 text-center">
    <a href="/" class="text-sm text-gray-600 hover:text-gray-900 underline">Go back home</a>
  </div>
</section>



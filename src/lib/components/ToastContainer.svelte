<script lang="ts">
  import { toasts, removeToast, type Toast } from '$lib/toast';
  import { fly } from 'svelte/transition';
  let toastsStoreValue: Toast[] = [];
  const unsubscribe = toasts.subscribe((v) => (toastsStoreValue = v));
  import { onDestroy } from 'svelte';
  onDestroy(() => unsubscribe());
</script>

<div class="fixed inset-0 pointer-events-none z-50">
  <div class="absolute right-4 top-4 space-y-2 w-80">
    {#each toastsStoreValue as t (t.id)}
      <div
        in:fly={{ y: -8, duration: 150 }}
        out:fly={{ y: -8, duration: 150 }}
        class="pointer-events-auto rounded-md shadow bg-white border {t.type === 'error' ? 'border-red-200' : t.type === 'success' ? 'border-green-200' : 'border-gray-200'}"
      >
        <div class="px-3 py-2 text-sm flex items-start justify-between">
          <div class="pr-2 {t.type === 'error' ? 'text-red-700' : t.type === 'success' ? 'text-green-700' : 'text-gray-700'}">{t.message}</div>
          <button class="text-gray-400 hover:text-gray-600" on:click={() => removeToast(t.id)}>×</button>
        </div>
      </div>
    {/each}
  </div>
  <!-- bottom left stack -->
  <div class="absolute left-4 bottom-4 space-y-2 w-80">
  </div>
</div>



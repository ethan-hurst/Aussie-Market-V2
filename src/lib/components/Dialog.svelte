<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount, tick } from 'svelte';

  export let open: boolean = false;
  export let title: string = '';
  export let labelledBy: string | null = null;
  export let describedBy: string | null = null;
  export let dismissible: boolean = true;
  export let closeOnEscape: boolean = true;
  export let closeOnOverlay: boolean = true;

  const dispatch = createEventDispatcher<{ close: void }>();

  let dialogEl: HTMLDivElement | null = null;
  let lastActive: Element | null = null;

  function close() {
    if (!dismissible) return;
    dispatch('close');
  }

  function onKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (closeOnEscape && e.key === 'Escape') {
      e.preventDefault();
      close();
    }
  }

  async function focusDialog() {
    await tick();
    if (open && dialogEl) {
      dialogEl.focus();
    }
  }

  // manage focus and body scroll
  onMount(() => {
    window.addEventListener('keydown', onKeydown);
  });
  onDestroy(() => {
    window.removeEventListener('keydown', onKeydown);
    if (document && document.body) {
      document.body.style.overflow = '';
    }
  });

  $: if (open) {
    lastActive = document.activeElement;
    if (document && document.body) {
      document.body.style.overflow = 'hidden';
    }
    focusDialog();
  } else {
    if (document && document.body) {
      document.body.style.overflow = '';
    }
    if (lastActive instanceof HTMLElement) {
      lastActive.focus();
    }
  }

  // IDs for ARIA
  const internalTitleId = `dialog-title-${Math.random().toString(36).slice(2)}`;
  const internalDescId = `dialog-desc-${Math.random().toString(36).slice(2)}`;
</script>

{#if open}
  <div
    class="fixed inset-0 z-50 flex items-center justify-center"
    aria-hidden={!open}
  >
    <!-- Overlay -->
    <div
      class="fixed inset-0 bg-black/50"
      on:click={() => { if (closeOnOverlay) close(); }}
      aria-hidden="true"
    />

    <!-- Dialog -->
    <div
      bind:this={dialogEl}
      role="dialog"
      class="relative z-10 w-full max-w-lg mx-4 outline-none"
      tabindex="-1"
      aria-modal="true"
      aria-labelledby={labelledBy || (title ? internalTitleId : undefined)}
      aria-describedby={describedBy || internalDescId}
    >
      <div class="bg-white rounded-lg shadow-lg border">
        <div class="px-5 py-4 border-b flex items-center justify-between">
          {#if title}
            <h2 id={internalTitleId} class="text-lg font-semibold text-gray-900">{title}</h2>
          {/if}
          {#if dismissible}
            <button
              class="text-gray-500 hover:text-gray-700"
              aria-label="Close dialog"
              on:click={close}
            >
              ✕
            </button>
          {/if}
        </div>

        <div class="px-5 py-4" id={internalDescId}>
          <slot />
        </div>

        <div class="px-5 py-3 border-t">
          <slot name="footer" />
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  /* No additional styles; rely on Tailwind present in project */
  :global(body) { overscroll-behavior: contain; }
  .outline-none { outline: none; }
  .bg-black\/50 { background-color: rgba(0,0,0,0.5); }
</style>



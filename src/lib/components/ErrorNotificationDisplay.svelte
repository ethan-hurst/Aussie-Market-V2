<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { activeErrorNotifications, dismissNotification, type ErrorNotification } from '$lib/errorNotificationSystem';
  import { CheckCircle, AlertTriangle, Info, XCircle, X, RefreshCw, CreditCard, WifiOff } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import type { PaymentErrorInfo, NotificationEventData } from '$lib/types/payment';

  export let position: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left' = 'top-right';
  export let maxNotifications: number = 5;
  export let autoDismissDelay: number = 10000;

  const dispatch = createEventDispatcher<{
    notificationAction: NotificationEventData;
    notificationDismissed: { notificationId: string };
  }>();

  let notifications: ErrorNotification[] = [];
  let dismissTimeouts = new Map<string, number>();
  let unsubscribeFn: (() => void) | null = null;

  $: notifications = $activeErrorNotifications.slice(0, maxNotifications);

  onMount(() => {
    // Set up auto-dismiss for non-persistent notifications
    unsubscribeFn = activeErrorNotifications.subscribe(notifications => {
      notifications.forEach(notification => {
        if (!notification.persistent && !dismissTimeouts.has(notification.id)) {
          const timeout = setTimeout(() => {
            dismissNotification(notification.id);
            dismissTimeouts.delete(notification.id);
          }, autoDismissDelay) as unknown as number;
          dismissTimeouts.set(notification.id, timeout);
        }
      });
    });
  });

  onDestroy(() => {
    // Clear all timeouts to prevent memory leaks
    dismissTimeouts.forEach(timeout => clearTimeout(timeout));
    dismissTimeouts.clear();
    
    // Properly unsubscribe from store
    if (unsubscribeFn) {
      unsubscribeFn();
      unsubscribeFn = null;
    }
  });

  function handleDismiss(notificationId: string) {
    dismissNotification(notificationId);
    dispatch('notificationDismissed', { notificationId });
    
    // Clear timeout if it exists
    const timeout = dismissTimeouts.get(notificationId);
    if (timeout) {
      clearTimeout(timeout);
      dismissTimeouts.delete(notificationId);
    }
  }

  function handleAction(notificationId: string, actionLabel: string) {
    dispatch('notificationAction', { notificationId, actionLabel });
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case 'success':
        return CheckCircle;
      case 'warning':
        return AlertTriangle;
      case 'info':
        return Info;
      case 'error':
        return XCircle;
      default:
        return Info;
    }
  }

  function getNotificationColor(type: string) {
    switch (type) {
      case 'success':
        return 'green';
      case 'warning':
        return 'yellow';
      case 'info':
        return 'blue';
      case 'error':
        return 'red';
      default:
        return 'gray';
    }
  }

  function getPaymentErrorIcon(paymentInfo: PaymentErrorInfo | null) {
    if (!paymentInfo) return AlertTriangle;
    
    switch (paymentInfo.type) {
      case 'card_error':
        return CreditCard;
      case 'network_error':
        return WifiOff;
      case 'webhook_error':
      case 'processing_error':
        return RefreshCw;
      default:
        return AlertTriangle;
    }
  }

  function formatTimestamp(timestamp: Date): string {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    
    if (diff < 60000) { // Less than 1 minute
      return 'Just now';
    } else if (diff < 3600000) { // Less than 1 hour
      const minutes = Math.floor(diff / 60000);
      return `${minutes}m ago`;
    } else {
      return timestamp.toLocaleTimeString();
    }
  }
</script>

<div class="error-notification-display {position}" role="region" aria-live="polite" aria-label="Error notifications">
  {#each notifications as notification (notification.id)}
    <div 
      class="notification notification-{getNotificationColor(notification.type)}"
      role="alert"
      aria-live="assertive"
      aria-describedby="notification-{notification.id}-content"
      tabindex="0"
    >
      <div class="notification-content">
        <div class="notification-header">
          <div class="notification-icon" aria-hidden="true">
            {#if 'paymentInfo' in notification}
              <svelte:component this={getPaymentErrorIcon(notification.paymentInfo)} class="h-5 w-5" />
            {:else}
              <svelte:component this={getNotificationIcon(notification.type)} class="h-5 w-5" />
            {/if}
          </div>
          <div class="notification-text" id="notification-{notification.id}-content">
            <h4 class="notification-title">{notification.title}</h4>
            <p class="notification-message">{notification.message}</p>
          </div>
          <button
            class="notification-dismiss"
            on:click={() => handleDismiss(notification.id)}
            aria-label="Dismiss notification: {notification.title}"
            tabindex="0"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        {#if notification.actions && notification.actions.length > 0}
          <div class="notification-actions">
            {#each notification.actions as action}
              <button
                class="action-button action-{action.variant || 'secondary'}"
                on:click={() => handleAction(notification.id, action.label)}
                aria-label="{action.label} for {notification.title}"
                tabindex="0"
              >
                {action.label}
              </button>
            {/each}
          </div>
        {/if}

        <div class="notification-meta">
          <span class="notification-timestamp">
            {formatTimestamp(notification.timestamp)}
          </span>
          {#if 'paymentInfo' in notification && notification.paymentInfo && ('retryable' in notification) && notification.retryable}
            <span class="notification-retryable">
              Retryable
            </span>
          {/if}
        </div>
      </div>
    </div>
  {/each}
</div>

<style>
  .error-notification-display {
    @apply fixed z-50 space-y-3 pointer-events-none;
    max-width: 400px;
  }

  .error-notification-display.top-right {
    @apply top-4 right-4;
  }

  .error-notification-display.top-left {
    @apply top-4 left-4;
  }

  .error-notification-display.bottom-right {
    @apply bottom-4 right-4;
  }

  .error-notification-display.bottom-left {
    @apply bottom-4 left-4;
  }

  .notification {
    @apply bg-white border rounded-lg shadow-lg pointer-events-auto transform transition-all duration-300 ease-in-out;
    animation: slideIn 0.3s ease-out;
  }

  .notification-green {
    @apply border-green-200 bg-green-50;
  }

  .notification-yellow {
    @apply border-yellow-200 bg-yellow-50;
  }

  .notification-blue {
    @apply border-blue-200 bg-blue-50;
  }

  .notification-red {
    @apply border-red-200 bg-red-50;
  }

  .notification-gray {
    @apply border-gray-200 bg-gray-50;
  }

  .notification-content {
    @apply p-4;
  }

  .notification-header {
    @apply flex items-start space-x-3;
  }

  .notification-icon {
    @apply flex-shrink-0 mt-0.5;
  }

  .notification-green .notification-icon {
    @apply text-green-600;
  }

  .notification-yellow .notification-icon {
    @apply text-yellow-600;
  }

  .notification-blue .notification-icon {
    @apply text-blue-600;
  }

  .notification-red .notification-icon {
    @apply text-red-600;
  }

  .notification-gray .notification-icon {
    @apply text-gray-600;
  }

  .notification-text {
    @apply flex-1 min-w-0;
  }

  .notification-title {
    @apply text-sm font-medium text-gray-900;
  }

  .notification-message {
    @apply text-sm text-gray-700 mt-1;
  }

  .notification-dismiss {
    @apply flex-shrink-0 p-1 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500;
  }

  .notification-actions {
    @apply mt-3 flex space-x-2;
  }

  .action-button {
    @apply px-3 py-1 text-xs font-medium rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1;
  }

  .action-primary {
    @apply bg-blue-600 text-white border-blue-600 hover:bg-blue-700 focus:ring-blue-500;
  }

  .action-secondary {
    @apply bg-white text-gray-700 border-gray-300 hover:bg-gray-50 focus:ring-gray-500;
  }

  .action-danger {
    @apply bg-red-600 text-white border-red-600 hover:bg-red-700 focus:ring-red-500;
  }

  .notification-meta {
    @apply mt-3 flex items-center justify-between text-xs text-gray-500;
  }

  .notification-retryable {
    @apply px-2 py-1 bg-green-100 text-green-800 rounded-full;
  }

  @keyframes slideIn {
    from {
      opacity: 0;
      transform: translateX(100%);
    }
    to {
      opacity: 1;
      transform: translateX(0);
    }
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .error-notification-display {
      @apply left-4 right-4;
      max-width: none;
    }
    
    .error-notification-display.top-right,
    .error-notification-display.top-left,
    .error-notification-display.bottom-right,
    .error-notification-display.bottom-left {
      @apply left-4 right-4;
    }
  }
</style>

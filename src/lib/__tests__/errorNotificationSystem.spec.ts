import { describe, it, expect, beforeEach, vi } from 'vitest';
import { get } from 'svelte/store';
import { 
  activeErrorNotifications, 
  addErrorNotification, 
  dismissNotification, 
  clearAllNotifications 
} from '$lib/errorNotificationSystem';

describe('Error Notification System', () => {
  beforeEach(() => {
    clearAllNotifications();
    vi.clearAllMocks();
  });

  describe('activeErrorNotifications store', () => {
    it('should start with empty notifications', () => {
      const notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(0);
    });

    it('should be reactive to changes', () => {
      let storeValue = get(activeErrorNotifications);
      expect(storeValue).toHaveLength(0);

      addErrorNotification({
        type: 'error',
        title: 'Test Error',
        message: 'Test message'
      });

      storeValue = get(activeErrorNotifications);
      expect(storeValue).toHaveLength(1);
    });
  });

  describe('addErrorNotification', () => {
    it('should add basic notification', () => {
      addErrorNotification({
        type: 'error',
        title: 'Test Error',
        message: 'Test message'
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toMatchObject({
        type: 'error',
        title: 'Test Error',
        message: 'Test message',
        persistent: false
      });
      expect(notifications[0].id).toBeDefined();
      expect(notifications[0].timestamp).toBeInstanceOf(Date);
    });

    it('should add notification with actions', () => {
      const actions = [
        { label: 'Retry', variant: 'primary' as const },
        { label: 'Cancel', variant: 'secondary' as const }
      ];

      addErrorNotification({
        type: 'warning',
        title: 'Warning',
        message: 'Warning message',
        actions
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications[0].actions).toEqual(actions);
    });

    it('should add persistent notification', () => {
      addErrorNotification({
        type: 'info',
        title: 'Info',
        message: 'Info message',
        persistent: true
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications[0].persistent).toBe(true);
    });

    it('should add payment error notification with payment info', () => {
      addErrorNotification({
        type: 'error',
        title: 'Payment Failed',
        message: 'Card declined',
        paymentInfo: {
          type: 'card_error',
          code: 'card_declined',
          retryable: true,
          canRetry: true,
          requiresNewPayment: false,
          shouldContactSupport: false,
          userMessage: 'Your card was declined'
        },
        retryable: true
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications[0]).toHaveProperty('paymentInfo');
      expect(notifications[0]).toHaveProperty('retryable', true);
      expect(notifications[0].paymentInfo).toMatchObject({
        type: 'card_error',
        retryable: true
      });
    });

    it('should generate unique IDs for notifications', () => {
      addErrorNotification({
        type: 'error',
        title: 'Error 1',
        message: 'Message 1'
      });

      addErrorNotification({
        type: 'error',
        title: 'Error 2',
        message: 'Message 2'
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications[0].id).not.toBe(notifications[1].id);
    });

    it('should maintain order of notifications (newest first)', () => {
      addErrorNotification({
        type: 'error',
        title: 'First Error',
        message: 'First message'
      });

      // Add a small delay to ensure different timestamps
      setTimeout(() => {
        addErrorNotification({
          type: 'error',
          title: 'Second Error',
          message: 'Second message'
        });
      }, 1);

      const notifications = get(activeErrorNotifications);
      expect(notifications[0].title).toBe('Second Error');
      expect(notifications[1].title).toBe('First Error');
    });
  });

  describe('dismissNotification', () => {
    it('should remove notification by ID', () => {
      addErrorNotification({
        type: 'error',
        title: 'Test Error',
        message: 'Test message'
      });

      let notifications = get(activeErrorNotifications);
      const notificationId = notifications[0].id;

      dismissNotification(notificationId);

      notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(0);
    });

    it('should only remove the specified notification', () => {
      addErrorNotification({
        type: 'error',
        title: 'Error 1',
        message: 'Message 1'
      });

      addErrorNotification({
        type: 'error',
        title: 'Error 2',
        message: 'Message 2'
      });

      let notifications = get(activeErrorNotifications);
      const firstId = notifications[1].id; // Remember notifications are newest first

      dismissNotification(firstId);

      notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(1);
      expect(notifications[0].title).toBe('Error 2');
    });

    it('should handle invalid notification ID gracefully', () => {
      addErrorNotification({
        type: 'error',
        title: 'Test Error',
        message: 'Test message'
      });

      let notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(1);

      dismissNotification('invalid-id');

      notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(1); // Should still be there
    });
  });

  describe('clearAllNotifications', () => {
    it('should remove all notifications', () => {
      // Add multiple notifications
      for (let i = 0; i < 5; i++) {
        addErrorNotification({
          type: 'error',
          title: `Error ${i}`,
          message: `Message ${i}`
        });
      }

      let notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(5);

      clearAllNotifications();

      notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(0);
    });

    it('should work when there are no notifications', () => {
      const notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(0);

      // Should not throw
      expect(() => clearAllNotifications()).not.toThrow();

      const notificationsAfter = get(activeErrorNotifications);
      expect(notificationsAfter).toHaveLength(0);
    });
  });

  describe('notification types and styling', () => {
    it.each([
      'error',
      'warning', 
      'success',
      'info'
    ])('should handle %s type notifications', (type) => {
      addErrorNotification({
        type: type as any,
        title: `${type} notification`,
        message: `${type} message`
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications[0].type).toBe(type);
    });
  });

  describe('integration with components', () => {
    it('should work with notification display component expectations', () => {
      // Add a comprehensive notification that tests all features
      addErrorNotification({
        type: 'error',
        title: 'Payment Processing Error',
        message: 'Unable to process your payment at this time',
        persistent: false,
        actions: [
          { label: 'Retry Payment', variant: 'primary' },
          { label: 'Use Different Card', variant: 'secondary' },
          { label: 'Contact Support', variant: 'secondary' }
        ],
        paymentInfo: {
          type: 'processing_error',
          code: 'processing_failed',
          retryable: true,
          canRetry: true,
          requiresNewPayment: false,
          shouldContactSupport: true,
          userMessage: 'Payment processing failed'
        },
        retryable: true
      });

      const notifications = get(activeErrorNotifications);
      const notification = notifications[0];

      // Verify all expected properties for component integration
      expect(notification).toHaveProperty('id');
      expect(notification).toHaveProperty('type', 'error');
      expect(notification).toHaveProperty('title');
      expect(notification).toHaveProperty('message');
      expect(notification).toHaveProperty('timestamp');
      expect(notification).toHaveProperty('persistent');
      expect(notification).toHaveProperty('actions');
      expect(notification).toHaveProperty('paymentInfo');
      expect(notification).toHaveProperty('retryable');

      // Verify structure expected by components
      expect(notification.actions).toHaveLength(3);
      expect(notification.actions![0]).toHaveProperty('label');
      expect(notification.actions![0]).toHaveProperty('variant');
      
      expect(notification.paymentInfo).toHaveProperty('type');
      expect(notification.paymentInfo).toHaveProperty('retryable');
    });

    it('should handle webhook fallback error notifications', () => {
      // Simulate webhook timeout scenario
      addErrorNotification({
        type: 'warning',
        title: 'Payment Processing Delayed',
        message: 'Your payment is taking longer than usual to process. We\'ll notify you when it\'s complete.',
        persistent: true,
        paymentInfo: {
          type: 'webhook_error',
          code: 'webhook_timeout',
          retryable: false,
          canRetry: false,
          requiresNewPayment: false,
          shouldContactSupport: false,
          userMessage: 'Payment processing delayed'
        }
      });

      const notifications = get(activeErrorNotifications);
      expect(notifications[0].paymentInfo?.type).toBe('webhook_error');
      expect(notifications[0].persistent).toBe(true);
    });
  });

  describe('stress testing', () => {
    it('should handle large numbers of notifications', () => {
      // Add many notifications
      for (let i = 0; i < 100; i++) {
        addErrorNotification({
          type: 'info',
          title: `Notification ${i}`,
          message: `Message ${i}`
        });
      }

      const notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(100);

      // Dismiss half of them
      for (let i = 0; i < 50; i++) {
        dismissNotification(notifications[i].id);
      }

      const remaining = get(activeErrorNotifications);
      expect(remaining).toHaveLength(50);
    });

    it('should maintain performance with rapid additions and dismissals', () => {
      const start = performance.now();

      // Rapid operations
      for (let i = 0; i < 50; i++) {
        addErrorNotification({
          type: 'error',
          title: `Error ${i}`,
          message: `Message ${i}`
        });
      }

      let notifications = get(activeErrorNotifications);
      const ids = notifications.map(n => n.id);

      for (const id of ids) {
        dismissNotification(id);
      }

      const end = performance.now();
      const duration = end - start;

      // Should complete operations quickly (less than 100ms)
      expect(duration).toBeLessThan(100);

      notifications = get(activeErrorNotifications);
      expect(notifications).toHaveLength(0);
    });
  });
});
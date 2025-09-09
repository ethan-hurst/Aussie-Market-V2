# Frontend E2E Test Fixes

## Test 1: notifications-ui.spec.ts
**Status: IDENTIFIED**
- Fix `markAllNotificationsAsRead()` call in NotificationBell.svelte line 115
- Missing userId parameter and await
- Need to reload notifications after marking all read

## Test 2: realtime-order-update.spec.ts  
**Status: IDENTIFIED**
- Fix realtime channel exposure for testing
- Add test override support to orders.ts subscribeToOrderUpdates
- Ensure channel is accessible via global window property

## Files to Modify:
- [ ] /src/lib/components/NotificationBell.svelte
- [ ] /src/lib/orders.ts
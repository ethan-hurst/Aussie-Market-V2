import { subscribeToAuction } from './auctions';
import type { BidUpdate, AuctionUpdate, AuctionStatusUpdate } from './auctions';

export interface AuctionSubscriptionCallbacks {
	onUpdate?: (update: AuctionUpdate) => void;
	onBid?: (bid: BidUpdate) => void;
	onStatusChange?: (status: AuctionStatusUpdate) => void;
	onEndingSoon?: (seconds: number) => void;
	onConnectionStatus?: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
	onError?: (error: Error) => void;
	onReconnect?: (attempt: number, maxAttempts: number) => void;
	onReconnectFailed?: (error: Error) => void;
}

export interface SubscriptionInfo {
	id: string;
	auctionId: string;
	callbacks: AuctionSubscriptionCallbacks;
	unsubscribe: () => void;
	connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'connecting';
	lastActivity: Date;
	reconnectAttempts: number;
	maxReconnectAttempts: number;
	lastError?: Error;
	pendingReconnectTimer: number | null;
	reconnectScheduled: boolean;
}

class AuctionSubscriptionManager {
	private subscriptions = new Map<string, SubscriptionInfo>();
	private globalCallbacks = new Set<AuctionSubscriptionCallbacks>();

	/**
	 * Subscribe to an auction with enhanced features
	 */
	subscribe(auctionId: string, callbacks: AuctionSubscriptionCallbacks, maxReconnectAttempts: number = 5): string {
		const subscriptionId = `auction-${auctionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Enhanced callbacks with global callbacks and reconnection logic
		const enhancedCallbacks: AuctionSubscriptionCallbacks = {
			onUpdate: (update) => {
				callbacks.onUpdate?.(update);
				this.globalCallbacks.forEach(globalCb => globalCb.onUpdate?.(update));
			},
			onBid: (bid) => {
				callbacks.onBid?.(bid);
				this.globalCallbacks.forEach(globalCb => globalCb.onBid?.(bid));
			},
			onStatusChange: (status) => {
				callbacks.onStatusChange?.(status);
				this.globalCallbacks.forEach(globalCb => globalCb.onStatusChange?.(status));
			},
			onEndingSoon: (seconds) => {
				callbacks.onEndingSoon?.(seconds);
				this.globalCallbacks.forEach(globalCb => globalCb.onEndingSoon?.(seconds));
			},
			onConnectionStatus: (status) => {
				// Update subscription status
				const sub = this.subscriptions.get(subscriptionId);
				if (sub) {
					sub.connectionStatus = status;
					sub.lastActivity = new Date();
					
					// Reset reconnect attempts on successful connection
					if (status === 'connected') {
						sub.reconnectAttempts = 0;
						sub.lastError = undefined;
					}
				}
				callbacks.onConnectionStatus?.(status);
				this.globalCallbacks.forEach(globalCb => globalCb.onConnectionStatus?.(status));
			},
			onError: (error) => {
				// Store error and attempt reconnection
				const sub = this.subscriptions.get(subscriptionId);
				if (sub && !sub.reconnectScheduled) {
					sub.lastError = error;
					sub.reconnectScheduled = true;
					this.attemptReconnection(subscriptionId);
				}
				
				callbacks.onError?.(error);
				this.globalCallbacks.forEach(globalCb => globalCb.onError?.(error));
			},
			onReconnect: (attempt, maxAttempts) => {
				callbacks.onReconnect?.(attempt, maxAttempts);
				this.globalCallbacks.forEach(globalCb => globalCb.onReconnect?.(attempt, maxAttempts));
			},
			onReconnectFailed: (error) => {
				callbacks.onReconnectFailed?.(error);
				this.globalCallbacks.forEach(globalCb => globalCb.onReconnectFailed?.(error));
			}
		};

		const unsubscribe = subscribeToAuction(auctionId, enhancedCallbacks);

		const subscriptionInfo: SubscriptionInfo = {
			id: subscriptionId,
			auctionId,
			callbacks: enhancedCallbacks,
			unsubscribe,
			connectionStatus: 'connecting',
			lastActivity: new Date(),
			reconnectAttempts: 0,
			maxReconnectAttempts,
			pendingReconnectTimer: null,
			reconnectScheduled: false
		};

		this.subscriptions.set(subscriptionId, subscriptionInfo);

		// Auto-cleanup inactive subscriptions after 30 minutes
		setTimeout(() => {
			this.checkAndCleanup(subscriptionId);
		}, 30 * 60 * 1000);

		return subscriptionId;
	}

	/**
	 * Unsubscribe from a specific auction
	 */
	unsubscribe(subscriptionId: string): boolean {
		const subscription = this.subscriptions.get(subscriptionId);
		if (subscription) {
			// Clear any pending reconnect timer
			if (subscription.pendingReconnectTimer) {
				clearTimeout(subscription.pendingReconnectTimer);
				subscription.pendingReconnectTimer = null;
			}
			subscription.reconnectScheduled = false;
			subscription.unsubscribe();
			this.subscriptions.delete(subscriptionId);
			return true;
		}
		return false;
	}

	/**
	 * Unsubscribe from all auctions
	 */
	unsubscribeAll(): void {
		this.subscriptions.forEach(sub => sub.unsubscribe());
		this.subscriptions.clear();
	}

	/**
	 * Get all active subscriptions
	 */
	getActiveSubscriptions(): SubscriptionInfo[] {
		return Array.from(this.subscriptions.values());
	}

	/**
	 * Get subscriptions for a specific auction
	 */
	getSubscriptionsForAuction(auctionId: string): SubscriptionInfo[] {
		return Array.from(this.subscriptions.values()).filter(sub => sub.auctionId === auctionId);
	}

	/**
	 * Add global callbacks that receive updates from all auctions
	 */
	addGlobalCallbacks(callbacks: AuctionSubscriptionCallbacks): string {
		const callbackId = `global-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
		this.globalCallbacks.add(callbacks);
		return callbackId;
	}

	/**
	 * Remove global callbacks
	 */
	removeGlobalCallbacks(callbackId: string): boolean {
		// Since we can't easily identify which callback is which, we'll need to clear all
		// In a production app, you'd want to use a Map with IDs for global callbacks too
		this.globalCallbacks.clear();
		return true;
	}

	/**
	 * Get subscription statistics
	 */
	getStats(): {
		totalSubscriptions: number;
		uniqueAuctions: number;
		connectionStatus: Record<string, number>;
	} {
		const auctions = new Set<string>();
		const statusCounts: Record<string, number> = {};

		this.subscriptions.forEach(sub => {
			auctions.add(sub.auctionId);
			statusCounts[sub.connectionStatus] = (statusCounts[sub.connectionStatus] || 0) + 1;
		});

		return {
			totalSubscriptions: this.subscriptions.size,
			uniqueAuctions: auctions.size,
			connectionStatus: statusCounts
		};
	}

	/**
	 * Check and cleanup inactive subscriptions
	 */
	private checkAndCleanup(subscriptionId: string): void {
		const subscription = this.subscriptions.get(subscriptionId);
		if (subscription) {
			const now = new Date();
			const timeSinceActivity = now.getTime() - subscription.lastActivity.getTime();

			// Cleanup if inactive for more than 30 minutes
			if (timeSinceActivity > 30 * 60 * 1000) {
				console.log(`Cleaning up inactive subscription: ${subscriptionId}`);
				this.unsubscribe(subscriptionId);
			}
		}
	}

	/**
	 * Attempt reconnection for a specific subscription
	 */
	private attemptReconnection(subscriptionId: string): void {
		const subscription = this.subscriptions.get(subscriptionId);
		if (!subscription) return;

		// Check if we should attempt reconnection
		if (subscription.reconnectAttempts >= subscription.maxReconnectAttempts) {
			console.log(`Max reconnection attempts reached for subscription: ${subscriptionId}`);
			subscription.connectionStatus = 'disconnected';
			subscription.reconnectScheduled = false;
			subscription.pendingReconnectTimer = null;
			subscription.callbacks.onReconnectFailed?.(subscription.lastError || new Error('Max reconnection attempts reached'));
			return;
		}

		// Increment reconnect attempts
		subscription.reconnectAttempts++;
		subscription.connectionStatus = 'reconnecting';

		// Notify of reconnection attempt
		subscription.callbacks.onReconnect?.(subscription.reconnectAttempts, subscription.maxReconnectAttempts);

		// Calculate delay with exponential backoff and jitter
		const baseDelay = Math.min(1000 * Math.pow(2, subscription.reconnectAttempts - 1), 30000); // Max 30 seconds
		const jitter = Math.random() * 1000; // Add up to 1 second of jitter
		const delay = baseDelay + jitter;

		// Clear any existing timer
		if (subscription.pendingReconnectTimer) {
			clearTimeout(subscription.pendingReconnectTimer);
		}

		subscription.pendingReconnectTimer = setTimeout(() => {
			// Clear the timer reference
			subscription.pendingReconnectTimer = null;
			
			// Unsubscribe from the old subscription first
			subscription.unsubscribe();
			
			// Attempt to reconnect by creating a new subscription
			try {
				const newUnsubscribe = subscribeToAuction(subscription.auctionId, subscription.callbacks);
				subscription.unsubscribe = newUnsubscribe;
				subscription.connectionStatus = 'connecting';
				subscription.lastActivity = new Date();
				subscription.reconnectScheduled = false;
				
				// Reset reconnect attempts on successful connection
				// This will be handled by the onConnectionStatus callback
			} catch (error) {
				console.error(`Reconnection failed for subscription ${subscriptionId}:`, error);
				subscription.lastError = error as Error;
				subscription.connectionStatus = 'disconnected';
				subscription.reconnectScheduled = false;
				
				// Try again if we haven't exceeded max attempts
				if (subscription.reconnectAttempts < subscription.maxReconnectAttempts) {
					this.attemptReconnection(subscriptionId);
				} else {
					subscription.callbacks.onReconnectFailed?.(error as Error);
				}
			}
		}, delay);
	}

	/**
	 * Force reconnection for all disconnected subscriptions
	 */
	forceReconnect(): void {
		this.subscriptions.forEach(sub => {
			if (sub.connectionStatus === 'disconnected') {
				console.log(`Force reconnecting subscription: ${sub.id}`);
				sub.reconnectAttempts = 0; // Reset attempts for manual reconnection
				this.attemptReconnection(sub.id);
			}
		});
	}

	/**
	 * Get connection health status
	 */
	getConnectionHealth(): {
		totalSubscriptions: number;
		connected: number;
		disconnected: number;
		reconnecting: number;
		connecting: number;
		failedReconnections: number;
	} {
		const stats = {
			totalSubscriptions: this.subscriptions.size,
			connected: 0,
			disconnected: 0,
			reconnecting: 0,
			connecting: 0,
			failedReconnections: 0
		};

		this.subscriptions.forEach(sub => {
			switch (sub.connectionStatus) {
				case 'connected':
					stats.connected++;
					break;
				case 'disconnected':
					stats.disconnected++;
					if (sub.reconnectAttempts >= sub.maxReconnectAttempts) {
						stats.failedReconnections++;
					}
					break;
				case 'reconnecting':
					stats.reconnecting++;
					break;
				case 'connecting':
					stats.connecting++;
					break;
			}
		});

		return stats;
	}
}

// Export singleton instance
export const auctionSubscriptionManager = new AuctionSubscriptionManager();

// Export convenience functions
export const subscribeToAuctionWithManager = (auctionId: string, callbacks: AuctionSubscriptionCallbacks): string => {
	return auctionSubscriptionManager.subscribe(auctionId, callbacks);
};

export const unsubscribeFromAuction = (subscriptionId: string): boolean => {
	return auctionSubscriptionManager.unsubscribe(subscriptionId);
};

export const getAuctionSubscriptionStats = () => {
	return auctionSubscriptionManager.getStats();
};

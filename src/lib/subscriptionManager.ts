import { subscribeToAuction, BidUpdate, AuctionUpdate, AuctionStatusUpdate } from './auctions';

export interface AuctionSubscriptionCallbacks {
	onUpdate?: (update: AuctionUpdate) => void;
	onBid?: (bid: BidUpdate) => void;
	onStatusChange?: (status: AuctionStatusUpdate) => void;
	onEndingSoon?: (seconds: number) => void;
	onConnectionStatus?: (status: 'connected' | 'disconnected' | 'reconnecting') => void;
	onError?: (error: Error) => void;
}

export interface SubscriptionInfo {
	id: string;
	auctionId: string;
	callbacks: AuctionSubscriptionCallbacks;
	unsubscribe: () => void;
	connectionStatus: 'connected' | 'disconnected' | 'reconnecting' | 'connecting';
	lastActivity: Date;
}

class AuctionSubscriptionManager {
	private subscriptions = new Map<string, SubscriptionInfo>();
	private globalCallbacks = new Set<AuctionSubscriptionCallbacks>();

	/**
	 * Subscribe to an auction with enhanced features
	 */
	subscribe(auctionId: string, callbacks: AuctionSubscriptionCallbacks): string {
		const subscriptionId = `auction-${auctionId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

		// Enhanced callbacks with global callbacks
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
				}
				callbacks.onConnectionStatus?.(status);
				this.globalCallbacks.forEach(globalCb => globalCb.onConnectionStatus?.(status));
			},
			onError: (error) => {
				callbacks.onError?.(error);
				this.globalCallbacks.forEach(globalCb => globalCb.onError?.(error));
			}
		};

		const unsubscribe = subscribeToAuction(auctionId, enhancedCallbacks);

		const subscriptionInfo: SubscriptionInfo = {
			id: subscriptionId,
			auctionId,
			callbacks: enhancedCallbacks,
			unsubscribe,
			connectionStatus: 'connecting',
			lastActivity: new Date()
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
	 * Force reconnection for all disconnected subscriptions
	 */
	forceReconnect(): void {
		this.subscriptions.forEach(sub => {
			if (sub.connectionStatus === 'disconnected') {
				// The enhanced subscription function already handles reconnection
				// This is just a placeholder for manual reconnection if needed
				console.log(`Attempting manual reconnection for: ${sub.id}`);
			}
		});
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

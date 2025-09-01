import { supabase } from './supabase';

export interface Notification {
	id: string;
	user_id: string;
	type: 'order_paid' | 'order_shipped' | 'order_delivered' | 'payment_failed' | 'dispute_created' | 'new_message';
	title: string;
	message: string;
	read: boolean;
	created_at: string;
	metadata?: Record<string, any>;
}

export async function createNotification(
	userId: string,
	type: Notification['type'],
	title: string,
	message: string,
	metadata?: Record<string, any>
): Promise<void> {
	try {
		const { error } = await supabase
			.from('notifications')
			.insert({
				user_id: userId,
				type,
				title,
				message,
				read: false,
				metadata,
				created_at: new Date().toISOString()
			});

		if (error) {
			console.error('Error creating notification:', error);
		}
	} catch (error) {
		console.error('Error creating notification:', error);
	}
}

export async function getUserNotifications(userId: string): Promise<Notification[]> {
	try {
		const { data, error } = await supabase
			.from('notifications')
			.select('*')
			.eq('user_id', userId)
			.order('created_at', { ascending: false });

		if (error) {
			console.error('Error fetching notifications:', error);
			return [];
		}

		return data || [];
	} catch (error) {
		console.error('Error fetching notifications:', error);
		return [];
	}
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
	try {
		const { error } = await supabase
			.from('notifications')
			.update({ read: true })
			.eq('id', notificationId);

		if (error) {
			console.error('Error marking notification as read:', error);
		}
	} catch (error) {
		console.error('Error marking notification as read:', error);
	}
}

export async function markAllNotificationsAsRead(userId: string): Promise<void> {
	try {
		const { error } = await supabase
			.from('notifications')
			.update({ read: true })
			.eq('user_id', userId)
			.eq('read', false);

		if (error) {
			console.error('Error marking all notifications as read:', error);
		}
	} catch (error) {
		console.error('Error marking all notifications as read:', error);
	}
}

export async function getUnreadNotificationCount(userId: string): Promise<number> {
	try {
		const { count, error } = await supabase
			.from('notifications')
			.select('*', { count: 'exact', head: true })
			.eq('user_id', userId)
			.eq('read', false);

		if (error) {
			console.error('Error getting unread notification count:', error);
			return 0;
		}

		return count || 0;
	} catch (error) {
		console.error('Error getting unread notification count:', error);
		return 0;
	}
}

// Order-specific notification functions
export async function notifyOrderPaid(orderId: string, buyerId: string, sellerId: string): Promise<void> {
	// Notify buyer
	await createNotification(
		buyerId,
		'order_paid',
		'Payment Successful',
		'Your payment has been processed successfully. The seller will be notified to ship your item.',
		{ orderId }
	);

	// Notify seller
	await createNotification(
		sellerId,
		'order_paid',
		'Payment Received',
		'A buyer has paid for your item. Please ship the item and update the order status.',
		{ orderId }
	);
}

export async function notifyOrderShipped(orderId: string, buyerId: string): Promise<void> {
	await createNotification(
		buyerId,
		'order_shipped',
		'Item Shipped',
		'Your item has been shipped by the seller. You will receive tracking information soon.',
		{ orderId }
	);
}

export async function notifyOrderDelivered(orderId: string, sellerId: string): Promise<void> {
	await createNotification(
		sellerId,
		'order_delivered',
		'Item Delivered',
		'The buyer has confirmed delivery of the item. Funds will be released to your account.',
		{ orderId }
	);
}

export async function notifyPaymentFailed(orderId: string, buyerId: string): Promise<void> {
	await createNotification(
		buyerId,
		'payment_failed',
		'Payment Failed',
		'Your payment could not be processed. Please try again or contact support.',
		{ orderId }
	);
}

export async function notifyDisputeCreated(orderId: string, buyerId: string, sellerId: string): Promise<void> {
	// Notify both parties about dispute
	await createNotification(
		buyerId,
		'dispute_created',
		'Dispute Created',
		'A dispute has been created for your order. Our team will review the case.',
		{ orderId }
	);

	await createNotification(
		sellerId,
		'dispute_created',
		'Dispute Created',
		'A dispute has been created for your order. Our team will review the case.',
		{ orderId }
	);
}

export async function notifyNewMessage(threadId: string, senderId: string, recipientId: string, senderName: string): Promise<void> {
	await createNotification(
		recipientId,
		'new_message',
		'New Message',
		`You have a new message from ${senderName}.`,
		{ threadId, senderId }
	);
}

export async function notifyDisputeUpdated(disputeId: string, userId: string, message: string): Promise<void> {
	await createNotification(
		userId,
		'dispute_created',
		'Dispute Updated',
		message,
		{ disputeId }
	);
}

export async function notifyDisputeResolved(disputeId: string, userId: string, message: string): Promise<void> {
	await createNotification(
		userId,
		'dispute_created',
		'Dispute Resolved',
		message,
		{ disputeId }
	);
}

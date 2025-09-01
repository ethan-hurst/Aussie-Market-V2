import { supabase } from './supabase';
import { notifyNewMessage } from './notifications';

export interface MessageThread {
	id: string;
	order_id?: string;
	buyer_id: string;
	seller_id: string;
	subject?: string;
	last_message_at: string;
	created_at: string;
	updated_at: string;
	// Joined data
	buyer?: {
		id: string;
		legal_name: string;
		email: string;
	};
	seller?: {
		id: string;
		legal_name: string;
		email: string;
	};
	order?: {
		id: string;
		listing: {
			title: string;
			listing_photos: Array<{ url: string; order_idx: number }>;
		};
	};
	unread_count?: number;
}

export interface Message {
	id: string;
	thread_id: string;
	sender_id: string;
	content: string;
	message_type: 'text' | 'image' | 'file' | 'system';
	attachment_url?: string;
	attachment_name?: string;
	attachment_size?: number;
	read_at?: string;
	created_at: string;
	updated_at: string;
	// Joined data
	sender?: {
		id: string;
		legal_name: string;
		email: string;
	};
}

export interface CreateThreadData {
	order_id?: string;
	buyer_id: string;
	seller_id: string;
	subject?: string;
}

export interface SendMessageData {
	thread_id: string;
	content: string;
	message_type?: 'text' | 'image' | 'file' | 'system';
	attachment_url?: string;
	attachment_name?: string;
	attachment_size?: number;
}

// Get all message threads for a user
export async function getUserThreads(userId: string): Promise<MessageThread[]> {
	try {
		const { data, error } = await supabase
			.from('message_threads')
			.select(`
				*,
				buyer:users!message_threads_buyer_id_fkey(
					id,
					legal_name,
					email
				),
				seller:users!message_threads_seller_id_fkey(
					id,
					legal_name,
					email
				),
				order:orders(
					id,
					listing:listings(
						title,
						listing_photos(url, order_idx)
					)
				)
			`)
			.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
			.order('last_message_at', { ascending: false });

		if (error) {
			console.error('Error fetching user threads:', error);
			return [];
		}

		// Add unread count for each thread
		const threadsWithUnreadCount = await Promise.all(
			(data || []).map(async (thread) => {
				const unreadCount = await getThreadUnreadCount(thread.id, userId);
				return { ...thread, unread_count: unreadCount };
			})
		);

		return threadsWithUnreadCount;
	} catch (error) {
		console.error('Error in getUserThreads:', error);
		return [];
	}
}

// Get a specific message thread with messages
export async function getThreadWithMessages(threadId: string): Promise<{ thread: MessageThread; messages: Message[] } | null> {
	try {
		// Get thread details
		const { data: thread, error: threadError } = await supabase
			.from('message_threads')
			.select(`
				*,
				buyer:users!message_threads_buyer_id_fkey(
					id,
					legal_name,
					email
				),
				seller:users!message_threads_seller_id_fkey(
					id,
					legal_name,
					email
				),
				order:orders(
					id,
					listing:listings(
						title,
						listing_photos(url, order_idx)
					)
				)
			`)
			.eq('id', threadId)
			.single();

		if (threadError || !thread) {
			console.error('Error fetching thread:', threadError);
			return null;
		}

		// Get messages
		const { data: messages, error: messagesError } = await supabase
			.from('messages')
			.select(`
				*,
				sender:users!messages_sender_id_fkey(
					id,
					legal_name,
					email
				)
			`)
			.eq('thread_id', threadId)
			.order('created_at', { ascending: true });

		if (messagesError) {
			console.error('Error fetching messages:', messagesError);
			return { thread, messages: [] };
		}

		return { thread, messages: messages || [] };
	} catch (error) {
		console.error('Error in getThreadWithMessages:', error);
		return null;
	}
}

// Create a new message thread
export async function createThread(data: CreateThreadData): Promise<MessageThread | null> {
	try {
		const { data: thread, error } = await supabase
			.from('message_threads')
			.insert({
				order_id: data.order_id,
				buyer_id: data.buyer_id,
				seller_id: data.seller_id,
				subject: data.subject
			})
			.select(`
				*,
				buyer:users!message_threads_buyer_id_fkey(
					id,
					legal_name,
					email
				),
				seller:users!message_threads_seller_id_fkey(
					id,
					legal_name,
					email
				)
			`)
			.single();

		if (error) {
			console.error('Error creating thread:', error);
			return null;
		}

		return thread;
	} catch (error) {
		console.error('Error in createThread:', error);
		return null;
	}
}

// Send a message
export async function sendMessage(data: SendMessageData): Promise<Message | null> {
	try {
		const { data: message, error } = await supabase
			.from('messages')
			.insert({
				thread_id: data.thread_id,
				content: data.content,
				message_type: data.message_type || 'text',
				attachment_url: data.attachment_url,
				attachment_name: data.attachment_name,
				attachment_size: data.attachment_size
			})
			.select(`
				*,
				sender:users!messages_sender_id_fkey(
					id,
					legal_name,
					email
				)
			`)
			.single();

		if (error) {
			console.error('Error sending message:', error);
			return null;
		}

		// Send notification to the other user in the thread
		if (message) {
			const thread = await getThreadWithMessages(data.thread_id);
			if (thread) {
				const recipientId = message.sender_id === thread.thread.buyer_id 
					? thread.thread.seller_id 
					: thread.thread.buyer_id;
				
				await notifyNewMessage(
					data.thread_id,
					message.sender_id,
					recipientId,
					message.sender?.legal_name || 'Unknown User'
				);
			}
		}

		return message;
	} catch (error) {
		console.error('Error in sendMessage:', error);
		return null;
	}
}

// Mark messages as read
export async function markThreadAsRead(threadId: string, userId: string): Promise<void> {
	try {
		const { error } = await supabase
			.from('messages')
			.update({ read_at: new Date().toISOString() })
			.eq('thread_id', threadId)
			.neq('sender_id', userId)
			.is('read_at', null);

		if (error) {
			console.error('Error marking thread as read:', error);
		}
	} catch (error) {
		console.error('Error in markThreadAsRead:', error);
	}
}

// Get unread count for a thread
export async function getThreadUnreadCount(threadId: string, userId: string): Promise<number> {
	try {
		const { count, error } = await supabase
			.from('messages')
			.select('*', { count: 'exact', head: true })
			.eq('thread_id', threadId)
			.neq('sender_id', userId)
			.is('read_at', null);

		if (error) {
			console.error('Error getting unread count:', error);
			return 0;
		}

		return count || 0;
	} catch (error) {
		console.error('Error in getThreadUnreadCount:', error);
		return 0;
	}
}

// Get total unread count for a user
export async function getTotalUnreadCount(userId: string): Promise<number> {
	try {
		const { count, error } = await supabase
			.from('messages')
			.select('*', { count: 'exact', head: true })
			.neq('sender_id', userId)
			.is('read_at', null)
			.in('thread_id', 
				supabase
					.from('message_threads')
					.select('id')
					.or(`buyer_id.eq.${userId},seller_id.eq.${userId}`)
			);

		if (error) {
			console.error('Error getting total unread count:', error);
			return 0;
		}

		return count || 0;
	} catch (error) {
		console.error('Error in getTotalUnreadCount:', error);
		return 0;
	}
}

// Real-time subscriptions
export function subscribeToThread(threadId: string, callback: (message: Message) => void) {
	return supabase
		.channel(`thread-${threadId}`)
		.on('postgres_changes', {
			event: 'INSERT',
			schema: 'public',
			table: 'messages',
			filter: `thread_id=eq.${threadId}`
		}, (payload) => {
			callback(payload.new as Message);
		})
		.subscribe();
}

export function subscribeToUserThreads(userId: string, callback: (thread: MessageThread) => void) {
	return supabase
		.channel(`user-threads-${userId}`)
		.on('postgres_changes', {
			event: 'UPDATE',
			schema: 'public',
			table: 'message_threads',
			filter: `buyer_id=eq.${userId} OR seller_id=eq.${userId}`
		}, (payload) => {
			callback(payload.new as MessageThread);
		})
		.subscribe();
}

// Utility functions
export function formatMessageTime(dateString: string): string {
	const date = new Date(dateString);
	const now = new Date();
	const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

	if (diffInSeconds < 60) return 'Just now';
	if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
	if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
	if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`;
	
	return date.toLocaleDateString('en-AU', {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

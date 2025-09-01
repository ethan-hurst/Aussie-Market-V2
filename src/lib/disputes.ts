import { supabase } from './supabase';
import { notifyNewMessage, notifyDisputeUpdated, notifyDisputeResolved } from './notifications';

export interface Dispute {
	id: string;
	order_id: string;
	initiator_id: string;
	respondent_id: string;
	dispute_type: 'item_not_received' | 'item_not_as_described' | 'damaged_item' | 'other';
	reason: string;
	description: string;
	amount_cents: number;
	currency: string;
	status: 'open' | 'under_review' | 'resolved' | 'closed' | 'escalated';
	resolution?: string;
	resolution_type?: 'refund' | 'replacement' | 'partial_refund' | 'no_action';
	refund_amount_cents?: number;
	admin_notes?: string;
	resolved_at?: string;
	created_at: string;
	updated_at: string;
	order?: any;
	initiator?: any;
	respondent?: any;
}

export interface DisputeEvidence {
	id: string;
	dispute_id: string;
	user_id: string;
	evidence_type: 'image' | 'document' | 'text';
	title: string;
	description?: string;
	file_url?: string;
	file_name?: string;
	file_size?: number;
	created_at: string;
	user?: any;
}

export interface DisputeMessage {
	id: string;
	dispute_id: string;
	sender_id: string;
	message_type: 'text' | 'image' | 'file';
	content: string;
	attachment_url?: string;
	attachment_name?: string;
	attachment_size?: number;
	created_at: string;
	sender?: any;
}

export interface CreateDisputeData {
	orderId: string;
	disputeType: Dispute['dispute_type'];
	reason: string;
	description: string;
	amountCents: number;
}

export interface AddEvidenceData {
	disputeId: string;
	evidenceType: DisputeEvidence['evidence_type'];
	title: string;
	description?: string;
	fileUrl?: string;
	fileName?: string;
	fileSize?: number;
}

export interface SendDisputeMessageData {
	disputeId: string;
	messageType: DisputeMessage['message_type'];
	content: string;
	attachmentUrl?: string;
	attachmentName?: string;
	attachmentSize?: number;
}

// Get user's disputes
export async function getUserDisputes(userId: string): Promise<Dispute[]> {
	const { data, error } = await supabase
		.from('disputes')
		.select(`
			*,
			orders!disputes_order_id_fkey (
				*,
				listings!orders_listing_id_fkey (
					*,
					listing_photos (*)
				)
			),
			users!disputes_initiator_id_fkey (
				id,
				legal_name,
				email
			),
			users!disputes_respondent_id_fkey (
				id,
				legal_name,
				email
			)
		`)
		.or(`initiator_id.eq.${userId},respondent_id.eq.${userId}`)
		.order('created_at', { ascending: false });

	if (error) {
		console.error('Error fetching disputes:', error);
		return [];
	}

	return data || [];
}

// Get dispute with all details
export async function getDisputeWithDetails(disputeId: string): Promise<Dispute | null> {
	const { data, error } = await supabase
		.from('disputes')
		.select(`
			*,
			orders!disputes_order_id_fkey (
				*,
				listings!orders_listing_id_fkey (
					*,
					listing_photos (*)
				)
			),
			users!disputes_initiator_id_fkey (
				id,
				legal_name,
				email
			),
			users!disputes_respondent_id_fkey (
				id,
				legal_name,
				email
			)
		`)
		.eq('id', disputeId)
		.single();

	if (error) {
		console.error('Error fetching dispute:', error);
		return null;
	}

	return data;
}

// Create a new dispute
export async function createDispute(data: CreateDisputeData, userId: string): Promise<{
	success: boolean;
	dispute?: Dispute;
	error?: string;
}> {
	try {
		// Get order details
		const { data: order, error: orderError } = await supabase
			.from('orders')
			.select('*, listings!orders_listing_id_fkey(*)')
			.eq('id', data.orderId)
			.single();

		if (orderError || !order) {
			return { success: false, error: 'Order not found' };
		}

		// Determine respondent (the other party)
		const respondentId = order.buyer_id === userId ? order.seller_id : order.buyer_id;

		const { data: dispute, error } = await supabase
			.from('disputes')
			.insert({
				order_id: data.orderId,
				initiator_id: userId,
				respondent_id: respondentId,
				dispute_type: data.disputeType,
				reason: data.reason,
				description: data.description,
				amount_cents: data.amountCents,
				currency: 'AUD',
				status: 'open'
			})
			.select()
			.single();

		if (error) {
			console.error('Error creating dispute:', error);
			return { success: false, error: 'Failed to create dispute' };
		}

		// Notify the other party
		await notifyDisputeUpdated(dispute.id, respondentId, 'New dispute filed');

		return { success: true, dispute };
	} catch (error) {
		console.error('Error creating dispute:', error);
		return { success: false, error: 'Failed to create dispute' };
	}
}

// Add evidence to a dispute
export async function addEvidence(data: AddEvidenceData, userId: string): Promise<{
	success: boolean;
	evidence?: DisputeEvidence;
	error?: string;
}> {
	try {
		const { data: evidence, error } = await supabase
			.from('dispute_evidence')
			.insert({
				dispute_id: data.disputeId,
				user_id: userId,
				evidence_type: data.evidenceType,
				title: data.title,
				description: data.description,
				file_url: data.fileUrl,
				file_name: data.fileName,
				file_size: data.fileSize
			})
			.select()
			.single();

		if (error) {
			console.error('Error adding evidence:', error);
			return { success: false, error: 'Failed to add evidence' };
		}

		return { success: true, evidence };
	} catch (error) {
		console.error('Error adding evidence:', error);
		return { success: false, error: 'Failed to add evidence' };
	}
}

// Send a message in a dispute
export async function sendDisputeMessage(data: SendDisputeMessageData, userId: string): Promise<{
	success: boolean;
	message?: DisputeMessage;
	error?: string;
}> {
	try {
		// Get dispute details to notify the other party
		const { data: dispute } = await supabase
			.from('disputes')
			.select('initiator_id, respondent_id')
			.eq('id', data.disputeId)
			.single();

		if (!dispute) {
			return { success: false, error: 'Dispute not found' };
		}

		const { data: message, error } = await supabase
			.from('dispute_messages')
			.insert({
				dispute_id: data.disputeId,
				sender_id: userId,
				message_type: data.messageType,
				content: data.content,
				attachment_url: data.attachmentUrl,
				attachment_name: data.attachmentName,
				attachment_size: data.attachmentSize
			})
			.select()
			.single();

		if (error) {
			console.error('Error sending message:', error);
			return { success: false, error: 'Failed to send message' };
		}

		// Notify the other party
		const recipientId = dispute.initiator_id === userId ? dispute.respondent_id : dispute.initiator_id;
		await notifyNewMessage(data.disputeId, userId, recipientId, 'Dispute message');

		return { success: true, message };
	} catch (error) {
		console.error('Error sending message:', error);
		return { success: false, error: 'Failed to send message' };
	}
}

// Update dispute status
export async function updateDisputeStatus(disputeId: string, status: Dispute['status'], resolution?: string): Promise<{
	success: boolean;
	error?: string;
}> {
	try {
		const updateData: any = { status };
		if (resolution) {
			updateData.resolution = resolution;
		}
		if (status === 'resolved') {
			updateData.resolved_at = new Date().toISOString();
		}

		const { error } = await supabase
			.from('disputes')
			.update(updateData)
			.eq('id', disputeId);

		if (error) {
			console.error('Error updating dispute status:', error);
			return { success: false, error: 'Failed to update dispute status' };
		}

		// Notify parties if resolved
		if (status === 'resolved') {
			const { data: dispute } = await supabase
				.from('disputes')
				.select('initiator_id, respondent_id')
				.eq('id', disputeId)
				.single();

			if (dispute) {
				await notifyDisputeResolved(disputeId, dispute.initiator_id, 'Dispute resolved');
				await notifyDisputeResolved(disputeId, dispute.respondent_id, 'Dispute resolved');
			}
		}

		return { success: true };
	} catch (error) {
		console.error('Error updating dispute status:', error);
		return { success: false, error: 'Failed to update dispute status' };
	}
}

// Get dispute evidence
export async function getDisputeEvidence(disputeId: string): Promise<DisputeEvidence[]> {
	const { data, error } = await supabase
		.from('dispute_evidence')
		.select(`
			*,
			users!dispute_evidence_user_id_fkey (
				id,
				legal_name
			)
		`)
		.eq('dispute_id', disputeId)
		.order('created_at', { ascending: true });

	if (error) {
		console.error('Error fetching dispute evidence:', error);
		return [];
	}

	return data || [];
}

// Get dispute messages
export async function getDisputeMessages(disputeId: string): Promise<DisputeMessage[]> {
	const { data, error } = await supabase
		.from('dispute_messages')
		.select(`
			*,
			users!dispute_messages_sender_id_fkey (
				id,
				legal_name
			)
		`)
		.eq('dispute_id', disputeId)
		.order('created_at', { ascending: true });

	if (error) {
		console.error('Error fetching dispute messages:', error);
		return [];
	}

	return data || [];
}

// Real-time subscriptions
export function subscribeToDispute(disputeId: string, callback: (dispute: Dispute) => void) {
	return supabase
		.channel(`dispute-${disputeId}`)
		.on('postgres_changes', {
			event: 'UPDATE',
			schema: 'public',
			table: 'disputes',
			filter: `id=eq.${disputeId}`
		}, async (payload) => {
			const updatedDispute = await getDisputeWithDetails(disputeId);
			if (updatedDispute) {
				callback(updatedDispute);
			}
		})
		.subscribe();
}

export function subscribeToDisputeMessages(disputeId: string, callback: (message: DisputeMessage) => void) {
	return supabase
		.channel(`dispute-messages-${disputeId}`)
		.on('postgres_changes', {
			event: 'INSERT',
			schema: 'public',
			table: 'dispute_messages',
			filter: `dispute_id=eq.${disputeId}`
		}, (payload) => {
			callback(payload.new as DisputeMessage);
		})
		.subscribe();
}

export function subscribeToDisputeEvidence(disputeId: string, callback: (evidence: DisputeEvidence) => void) {
	return supabase
		.channel(`dispute-evidence-${disputeId}`)
		.on('postgres_changes', {
			event: 'INSERT',
			schema: 'public',
			table: 'dispute_evidence',
			filter: `dispute_id=eq.${disputeId}`
		}, (payload) => {
			callback(payload.new as DisputeEvidence);
		})
		.subscribe();
}

// Utility functions
export function getDisputeStatusColor(status: Dispute['status']): string {
	switch (status) {
		case 'open':
			return 'bg-blue-100 text-blue-800';
		case 'under_review':
			return 'bg-yellow-100 text-yellow-800';
		case 'resolved':
			return 'bg-green-100 text-green-800';
		case 'closed':
			return 'bg-gray-100 text-gray-800';
		case 'escalated':
			return 'bg-red-100 text-red-800';
		default:
			return 'bg-gray-100 text-gray-800';
	}
}

export function getDisputeStatusLabel(status: Dispute['status']): string {
	switch (status) {
		case 'open':
			return 'Open';
		case 'under_review':
			return 'Under Review';
		case 'resolved':
			return 'Resolved';
		case 'closed':
			return 'Closed';
		case 'escalated':
			return 'Escalated';
		default:
			return 'Unknown';
	}
}

export function getDisputeTypeLabel(type: Dispute['dispute_type']): string {
	switch (type) {
		case 'item_not_received':
			return 'Item Not Received';
		case 'item_not_as_described':
			return 'Item Not As Described';
		case 'damaged_item':
			return 'Damaged Item';
		case 'other':
			return 'Other';
		default:
			return 'Unknown';
	}
}

export function formatPrice(cents: number): string {
	return new Intl.NumberFormat('en-AU', {
		style: 'currency',
		currency: 'AUD'
	}).format(cents / 100);
}

export function formatFileSize(bytes: number): string {
	if (bytes === 0) return '0 Bytes';
	const k = 1024;
	const sizes = ['Bytes', 'KB', 'MB', 'GB'];
	const i = Math.floor(Math.log(bytes) / Math.log(k));
	return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatPrice(cents: number): string {
	return new Intl.NumberFormat('en-AU', {
		style: 'currency',
		currency: 'AUD'
	}).format(cents / 100);
}

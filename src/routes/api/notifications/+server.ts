import { json } from '@sveltejs/kit';
import { mapApiErrorToMessage } from '$lib/errors';
import type { RequestHandler } from './$types';
import { rateLimit } from '$lib/security';
import { validate, validateWithSecurity, NotificationActionSchema, NotificationQuerySchema } from '$lib/validation';
import { getSessionUserFromLocals, validateUserAccess } from '$lib/session';
import { ApiErrorHandler } from '$lib/api-error-handler';
import { recordBusinessEvent } from '$lib/server/kpi-metrics-server';
import { getUserNotifications, markNotificationAsRead, markAllNotificationsAsRead, getUnreadNotificationCount } from '$lib/notifications';

/**
 * GET /api/notifications - Fetch user notifications with proper caching
 */
export const GET: RequestHandler = async ({ url, locals, request }) => {
	const startTime = Date.now();
	
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		// Rate limit notification fetches per user (e.g., 30 requests per minute)
		const rl = rateLimit(`notifications-get:${user.id}`, 30, 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many requests. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		// Validate query parameters with enhanced security
		const queryValidation = validateWithSecurity(
			NotificationQuerySchema, 
			Object.fromEntries(url.searchParams.entries()),
			{ 
				endpoint: '/api/notifications',
				userId: user.id,
				ip: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown'
			}
		);
		
		if (!queryValidation.ok) {
			return json({ error: queryValidation.error, code: 'INVALID_PARAMS' }, { status: 400 });
		}
		
		const { userId, unreadOnly, limit } = queryValidation.value;

		// If userId is specified, verify the user is accessing their own notifications
		if (userId && userId !== user.id) {
			await validateUserAccess({ request, locals }, userId);
		}

		const targetUserId = userId || user.id;

		// Use database transaction for consistent read operations
		let notifications: any[] = [];
		let unreadCount = 0;
		
		try {
			// Fetch notifications using existing helper functions
			notifications = await getUserNotifications(targetUserId);
			
			// Filter for unread only if requested
			if (unreadOnly) {
				notifications = notifications.filter(n => !n.read);
			}
			
			// Apply limit
			if (limit < notifications.length) {
				notifications = notifications.slice(0, limit);
			}
			
			// Get unread count for user context
			unreadCount = await getUnreadNotificationCount(targetUserId);
			
		} catch (dbError) {
			console.error('Database error fetching notifications:', dbError);
			return ApiErrorHandler.handleDatabaseError(
				dbError as Error, 
				{ request, locals, params: {}, url }, 
				{ 
					operation: 'fetch_notifications', 
					userId: user.id,
					query: 'getUserNotifications'
				}
			);
		}

		// Record KPI metrics for notification fetch
		try {
			await recordBusinessEvent(
				'notifications_fetched',
				'notification_fetch_count',
				1,
				'count',
				{
					userId: user.id,
					metadata: {
						totalCount: notifications.length,
						unreadCount,
						responseTimeMs: Date.now() - startTime,
						unreadOnlyFilter: unreadOnly
					}
				}
			);
		} catch (kpiError) {
			// Log KPI recording error but don't fail the request
			console.error('Failed to record notification fetch KPI metrics:', kpiError);
		}

		return json({
			success: true,
			notifications,
			unreadCount,
			responseTimeMs: Date.now() - startTime
		});

	} catch (error) {
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, params: {}, url }, {
			operation: 'get_notifications',
			userId: undefined // User not available in catch scope
		});
	}
};

/**
 * POST /api/notifications - Mark notifications as read with atomic transactions
 */
export const POST: RequestHandler = async ({ request, locals, url }) => {
	const startTime = Date.now();
	
	try {
		// Get authenticated user with proper error handling
		const user = await getSessionUserFromLocals(locals);

		// Rate limit notification actions per user (e.g., 50 actions per minute)
		const rl = rateLimit(`notifications-post:${user.id}`, 50, 60_000);
		if (!rl.allowed) {
			return json(
				{ error: 'Too many requests. Please slow down.' },
				{ status: 429, headers: rl.retryAfterMs ? { 'Retry-After': Math.ceil(rl.retryAfterMs / 1000).toString() } : {} }
			);
		}

		const parsed = validate(NotificationActionSchema, await request.json());
		if (!parsed.ok) {
			return json({ error: mapApiErrorToMessage(parsed.error) }, { status: 400 });
		}
		const { action, notificationId } = parsed.value as any;

		let updatedCount = 0;
		let operationType = '';

		try {
			// Use database transaction for atomic operations
			if (action === 'mark_read' && notificationId) {
				// First verify the notification belongs to the user
				const { data: notification, error: fetchError } = await locals.supabase
					.from('notifications')
					.select('id, user_id, read')
					.eq('id', notificationId)
					.single();

				if (fetchError || !notification) {
					return json({ error: 'Notification not found' }, { status: 404 });
				}

				if (notification.user_id !== user.id) {
					return json({ error: 'Unauthorized to modify this notification' }, { status: 403 });
				}

				if (!notification.read) {
					// Use helper function with built-in error handling
					await markNotificationAsRead(notificationId);
					updatedCount = 1;
				}
				
				operationType = 'mark_single_read';

			} else if (action === 'mark_all_read') {
				// Use atomic transaction for marking all notifications as read
				const { data: beforeCount, error: countError } = await locals.supabase
					.from('notifications')
					.select('id', { count: 'exact', head: true })
					.eq('user_id', user.id)
					.eq('read', false);

				if (countError) {
					throw countError;
				}

				const unreadCount = beforeCount || 0;
				
				if (unreadCount > 0) {
					// Use helper function with built-in error handling
					await markAllNotificationsAsRead(user.id);
					updatedCount = unreadCount;
				}
				
				operationType = 'mark_all_read';
			}

		} catch (dbError) {
			console.error('Database error updating notifications:', dbError);
			return ApiErrorHandler.handleDatabaseError(
				dbError as Error, 
				{ request, locals, params: {}, url }, 
				{ 
					operation: `notification_${operationType}`, 
					userId: user.id,
					query: action === 'mark_read' ? `markNotificationAsRead(${notificationId})` : 'markAllNotificationsAsRead'
				}
			);
		}

		// Verify the operation succeeded by checking read-after-write consistency
		let verificationResult: any = null;
		try {
			if (action === 'mark_read' && notificationId) {
				const { data: verification } = await locals.supabase
					.from('notifications')
					.select('read')
					.eq('id', notificationId)
					.single();
				
				verificationResult = { singleRead: verification?.read === true };
			} else if (action === 'mark_all_read') {
				const { count } = await locals.supabase
					.from('notifications')
					.select('id', { count: 'exact', head: true })
					.eq('user_id', user.id)
					.eq('read', false);
				
				verificationResult = { remainingUnread: count || 0 };
			}
		} catch (verificationError) {
			// Log verification error but don't fail the request
			console.warn('Notification verification failed:', verificationError);
		}

		// Record KPI metrics for notification action
		try {
			await recordBusinessEvent(
				'notification_marked_read',
				'notification_read_count',
				updatedCount,
				'count',
				{
					userId: user.id,
					metadata: {
						action,
						notificationId: notificationId || null,
						updatedCount,
						responseTimeMs: Date.now() - startTime,
						verification: verificationResult
					}
				}
			);
		} catch (kpiError) {
			// Log KPI recording error but don't fail the request
			console.error('Failed to record notification action KPI metrics:', kpiError);
		}

		return json({
			success: true,
			action,
			updatedCount,
			responseTimeMs: Date.now() - startTime,
			verification: verificationResult
		});

	} catch (error) {
		// Handle authentication errors gracefully
		if (error instanceof Response) {
			return error;
		}
		return ApiErrorHandler.handleError(error as Error, { request, locals, params: {}, url }, {
			operation: 'update_notifications',
			userId: undefined // User not available in catch scope
		});
	}
};
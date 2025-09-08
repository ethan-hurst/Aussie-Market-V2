import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { withEnhancedLogging, withDatabaseLogging } from '../_shared/logger.ts';
import { Metrics, setupMetricsCleanup } from '../_shared/metrics.ts';
import { initSentry, captureException, captureMessage } from '../_shared/sentry.ts';
import { Webhook } from 'https://esm.sh/stripe@14.21.0';

// Use function-scoped env names (avoid SUPABASE_ prefix per platform rules)
const supabaseUrl = Deno.env.get('PUBLIC_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Initialize Stripe webhook for signature validation
const webhook = new Webhook(stripeWebhookSecret);

// Setup metrics cleanup
const cleanup = setupMetricsCleanup();

// Initialize Sentry
initSentry();

interface StripeWebhookEvent {
  id: string;
  type: string;
  data: {
    object: any;
  };
  created: number;
  livemode: boolean;
}

interface WebhookProcessingResult {
  success: boolean;
  eventId: string;
  eventType: string;
  processedAt: string;
  orderId?: string;
  error?: string;
}

serve(async (req) => {
  return await withEnhancedLogging('stripe-webhook', req, async (logger) => {
    try {
      logger.info('Processing Stripe webhook request');

      // Validate request method
      if (req.method !== 'POST') {
        logger.warn('Invalid request method', { method: req.method });
        return {
          error: 'Method not allowed',
          allowedMethods: ['POST']
        };
      }

      // Get request body
      const body = await req.text();
      logger.debug('Webhook request body received', { bodyLength: body.length });

      // Note: Event parsing is now handled by Stripe's signature validation
      // which ensures both authenticity and proper JSON structure

      // Validate webhook signature (CRITICAL SECURITY FIX)
      const signature = req.headers.get('stripe-signature');
      if (!signature) {
        logger.warn('Missing Stripe signature header');
        Metrics.errorTracked('webhook_signature_missing', 'authentication');
        return {
          error: 'Missing signature',
          requestId: logger.getRequestId()
        };
      }

      // Validate webhook signature using Stripe's official method
      let validatedEvent: StripeWebhookEvent;
      try {
        validatedEvent = webhook.constructEvent(body, signature, stripeWebhookSecret);
        logger.info('Webhook signature validated successfully', {
          eventId: validatedEvent.id,
          eventType: validatedEvent.type
        });
      } catch (error) {
        logger.logError('Webhook signature validation failed', error as Error, {
          signature: signature.substring(0, 20) + '...', // Log partial signature for debugging
          bodyLength: body.length
        });
        Metrics.errorTracked('webhook_signature_invalid', 'authentication', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
        captureException(error as Error, {
          tags: {
            operation: 'webhook_signature_validation',
            function: 'stripe_webhook',
            severity: 'critical'
          },
          extra: {
            signature: signature.substring(0, 20) + '...',
            bodyLength: body.length
          }
        });
        return {
          error: 'Invalid signature',
          requestId: logger.getRequestId()
        };
      }

      // Use the validated event instead of the parsed one
      event = validatedEvent;

      // Additional security: Check event age (prevent replay attacks)
      const eventAge = Date.now() - (event.created * 1000);
      const maxEventAge = 5 * 60 * 1000; // 5 minutes
      
      if (eventAge > maxEventAge) {
        logger.warn('Webhook event too old, potential replay attack', {
          eventId: event.id,
          eventAge: eventAge,
          maxAge: maxEventAge,
          created: new Date(event.created * 1000).toISOString()
        });
        Metrics.errorTracked('webhook_event_too_old', 'security', {
          eventId: event.id,
          eventAge: eventAge
        });
        return {
          error: 'Event too old',
          requestId: logger.getRequestId()
        };
      }

      // Additional security: Rate limiting by event type
      const rateLimitKey = `webhook_rate_limit:${event.type}`;
      const rateLimitWindow = 60 * 1000; // 1 minute
      const rateLimitMax = 100; // Max 100 events per type per minute
      
      // Simple in-memory rate limiting (in production, use Redis or similar)
      const now = Date.now();
      const rateLimitData = (globalThis as any).webhookRateLimit || {};
      
      if (!rateLimitData[rateLimitKey]) {
        rateLimitData[rateLimitKey] = { count: 0, windowStart: now };
      }
      
      const rateLimit = rateLimitData[rateLimitKey];
      
      // Reset window if expired
      if (now - rateLimit.windowStart > rateLimitWindow) {
        rateLimit.count = 0;
        rateLimit.windowStart = now;
      }
      
      // Check rate limit
      if (rateLimit.count >= rateLimitMax) {
        logger.warn('Webhook rate limit exceeded', {
          eventType: event.type,
          count: rateLimit.count,
          limit: rateLimitMax,
          windowStart: new Date(rateLimit.windowStart).toISOString()
        });
        Metrics.errorTracked('webhook_rate_limit_exceeded', 'security', {
          eventType: event.type,
          count: rateLimit.count
        });
        return {
          error: 'Rate limit exceeded',
          requestId: logger.getRequestId()
        };
      }
      
      // Increment rate limit counter
      rateLimit.count++;
      (globalThis as any).webhookRateLimit = rateLimitData;

      // Process the webhook event
      const result = await processWebhookEvent(event, logger);
      
      // Log processing result
      logger.info('Webhook processing completed', {
        eventId: event.id,
        eventType: event.type,
        success: result.success,
        orderId: result.orderId
      });

      // Track webhook metrics
      Metrics.webhookProcessed(event.type, Date.now() - logger['startTime'], result.success, event.id);

      return {
        success: true,
        eventId: event.id,
        eventType: event.type,
        processed: result.success,
        orderId: result.orderId,
        requestId: logger.getRequestId(),
        correlationId: logger.getCorrelationId(),
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      logger.logError('Webhook processing failed', error as Error);
      Metrics.errorTracked('webhook_processing_error', 'processing', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      captureException(error as Error, {
        tags: {
          operation: 'webhook_processing',
          function: 'stripe_webhook',
          severity: 'critical'
        },
        extra: {
          requestId: logger.getRequestId(),
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      });
      
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
        success: false,
        requestId: logger.getRequestId(),
        correlationId: logger.getCorrelationId(),
        timestamp: new Date().toISOString()
      };
    } finally {
      // Ensure metrics are flushed
      cleanup();
    }
  });
});

async function processWebhookEvent(event: StripeWebhookEvent, logger: any): Promise<WebhookProcessingResult> {
  const startTime = Date.now();
  
  try {
    logger.info('Processing webhook event', {
      eventId: event.id,
      eventType: event.type,
      created: new Date(event.created * 1000).toISOString()
    });

    // Enhanced idempotency check with race condition protection
    const isDuplicate = await withDatabaseLogging(
      logger,
      'check_duplicate_webhook',
      async () => {
        // Use a more robust check that includes event type and processing status
        const { data, error } = await supabase
          .from('webhook_events')
          .select('id, processed_at, processing_status')
          .eq('event_id', event.id)
          .maybeSingle();
        
        if (error) throw error;
        
        // If event exists and was successfully processed, it's a duplicate
        if (data && data.processing_status === 'completed') {
          return { isDuplicate: true, status: 'completed' };
        }
        
        // If event exists but is still processing, it might be a race condition
        if (data && data.processing_status === 'processing') {
          return { isDuplicate: true, status: 'processing' };
        }
        
        return { isDuplicate: false, status: 'new' };
      },
      { eventId: event.id }
    );

    if (isDuplicate.isDuplicate) {
      if (isDuplicate.status === 'completed') {
        logger.warn('Duplicate webhook event detected (already completed)', { eventId: event.id });
        Metrics.errorTracked('webhook_duplicate_completed', 'idempotency', { eventId: event.id });
        return {
          success: true,
          eventId: event.id,
          eventType: event.type,
          processedAt: new Date().toISOString()
        };
      } else if (isDuplicate.status === 'processing') {
        logger.warn('Webhook event already being processed (race condition)', { eventId: event.id });
        Metrics.errorTracked('webhook_race_condition', 'idempotency', { eventId: event.id });
        return {
          success: false,
          eventId: event.id,
          eventType: event.type,
          processedAt: new Date().toISOString(),
          error: 'Event already being processed'
        };
      }
    }

    // Record webhook event for idempotency with processing status
    await withDatabaseLogging(
      logger,
      'record_webhook_event',
      async () => {
        const { error } = await supabase
          .from('webhook_events')
          .insert({
            event_id: event.id,
            event_type: event.type,
            processed_at: new Date().toISOString(),
            processing_status: 'processing',
            livemode: event.livemode,
            created_at: new Date(event.created * 1000).toISOString()
          });
        
        if (error) throw error;
      },
      { eventId: event.id, eventType: event.type }
    );

    // Process based on event type
    let result: WebhookProcessingResult;
    switch (event.type) {
      case 'payment_intent.succeeded':
        result = await handlePaymentIntentSucceeded(event, logger);
        break;
      case 'payment_intent.payment_failed':
        result = await handlePaymentIntentFailed(event, logger);
        break;
      case 'payment_intent.canceled':
        result = await handlePaymentIntentCanceled(event, logger);
        break;
      case 'charge.dispute.created':
        result = await handleChargeDisputeCreated(event, logger);
        break;
      case 'charge.refunded':
        result = await handleChargeRefunded(event, logger);
        break;
      default:
        logger.info('Unhandled webhook event type', { eventType: event.type });
        result = {
          success: true,
          eventId: event.id,
          eventType: event.type,
          processedAt: new Date().toISOString()
        };
    }

    // Update processing status based on result
    await withDatabaseLogging(
      logger,
      'update_webhook_processing_status',
      async () => {
        const { error } = await supabase
          .from('webhook_events')
          .update({ 
            processing_status: result.success ? 'completed' : 'failed',
            completed_at: new Date().toISOString(),
            error_message: result.error || null
          })
          .eq('event_id', event.id);
        
        if (error) throw error;
      },
      { eventId: event.id, success: result.success }
    );

    const duration = Date.now() - startTime;
    logger.logPerformance(`webhook_${event.type}`, duration, {
      eventId: event.id,
      success: result.success
    });

    return result;

  } catch (error) {
    logger.logError(`Failed to process webhook event ${event.type}`, error as Error, {
      eventId: event.id
    });
    
    return {
      success: false,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

async function handlePaymentIntentSucceeded(event: StripeWebhookEvent, logger: any): Promise<WebhookProcessingResult> {
  const paymentIntent = event.data.object;
  const orderId = paymentIntent.metadata?.order_id;

  if (!orderId) {
    logger.warn('Payment intent succeeded but no order_id in metadata', {
      paymentIntentId: paymentIntent.id
    });
    return {
      success: false,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      error: 'Missing order_id in payment intent metadata'
    };
  }

  logger.info('Processing payment intent succeeded', {
    paymentIntentId: paymentIntent.id,
    orderId,
    amount: paymentIntent.amount
  });

  try {
    // Validate order state transition before processing
    const { data: stateValidation, error: stateError } = await supabase.rpc('validate_order_state_transition', {
      order_id: orderId,
      new_state: 'paid',
      user_id: paymentIntent.metadata?.buyer_id
    });

    if (stateError) {
      logger.logError('State validation failed', stateError, { orderId });
      throw new Error('State validation failed');
    }

    if (!stateValidation?.valid) {
      logger.warn('Invalid state transition for payment', {
        orderId,
        currentState: stateValidation?.current_state,
        newState: stateValidation?.new_state,
        error: stateValidation?.error
      });
      return {
        success: false,
        eventId: event.id,
        eventType: event.type,
        processedAt: new Date().toISOString(),
        error: `Invalid state transition: ${stateValidation?.error}`
      };
    }

    // Update order status to paid with enhanced error handling
    await withDatabaseLogging(
      logger,
      'update_order_paid',
      async () => {
        const { data: updateResult, error } = await supabase
          .from('orders')
          .update({ 
            state: 'paid',
            paid_at: new Date().toISOString(),
            payment_intent_id: paymentIntent.id,
            updated_at: new Date().toISOString()
          })
          .eq('id', orderId)
          .eq('state', stateValidation.current_state) // Ensure state hasn't changed
          .select('id');
        
        if (error) throw error;
        
        // Check if any rows were updated (prevents race conditions)
        if (!updateResult || updateResult.length === 0) {
          throw new Error('Order state changed during processing - possible race condition');
        }
      },
      { orderId, paymentIntentId: paymentIntent.id }
    );

    // Create ledger entry
    await withDatabaseLogging(
      logger,
      'create_payment_ledger_entry',
      async () => {
        const { error } = await supabase
          .from('ledger_entries')
          .insert({
            order_id: orderId,
            user_id: paymentIntent.metadata?.buyer_id,
            amount_cents: paymentIntent.amount,
            entry_type: 'PAYMENT_RECEIVED',
            description: `Payment received for order ${orderId}`,
            created_at: new Date().toISOString()
          });
        
        if (error) throw error;
      },
      { orderId, amount: paymentIntent.amount }
    );

    // Send notification
    await withDatabaseLogging(
      logger,
      'send_payment_notification',
      async () => {
        const { error } = await supabase
          .from('notifications')
          .insert({
            user_id: paymentIntent.metadata?.buyer_id,
            type: 'payment_received',
            title: 'Payment Successful',
            message: `Your payment of $${(paymentIntent.amount / 100).toFixed(2)} has been processed successfully.`,
            metadata: { order_id: orderId }
          });
        
        if (error) throw error;
      },
      { orderId, userId: paymentIntent.metadata?.buyer_id }
    );

    logger.info('Payment intent succeeded processed successfully', { orderId });
    Metrics.orderCreated(orderId, paymentIntent.amount);

    return {
      success: true,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      orderId
    };

  } catch (error) {
    logger.logError('Failed to process payment intent succeeded', error as Error, { orderId });
    throw error;
  }
}

async function handlePaymentIntentFailed(event: StripeWebhookEvent, logger: any): Promise<WebhookProcessingResult> {
  const paymentIntent = event.data.object;
  const orderId = paymentIntent.metadata?.order_id;

  logger.info('Processing payment intent failed', {
    paymentIntentId: paymentIntent.id,
    orderId,
    failureCode: paymentIntent.last_payment_error?.code
  });

  try {
    if (orderId) {
      // Update order status
      await withDatabaseLogging(
        logger,
        'update_order_payment_failed',
        async () => {
          const { error } = await supabase
            .from('orders')
            .update({ 
              state: 'payment_failed',
              payment_failed_at: new Date().toISOString(),
              payment_failure_reason: paymentIntent.last_payment_error?.message
            })
            .eq('id', orderId);
          
          if (error) throw error;
        },
        { orderId, failureCode: paymentIntent.last_payment_error?.code }
      );

      // Send notification
      await withDatabaseLogging(
        logger,
        'send_payment_failed_notification',
        async () => {
          const { error } = await supabase
            .from('notifications')
            .insert({
              user_id: paymentIntent.metadata?.buyer_id,
              type: 'payment_failed',
              title: 'Payment Failed',
              message: `Your payment failed. Please try again or contact support.`,
              metadata: { order_id: orderId, failure_reason: paymentIntent.last_payment_error?.message }
            });
          
          if (error) throw error;
        },
        { orderId, userId: paymentIntent.metadata?.buyer_id }
      );
    }

    return {
      success: true,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      orderId
    };

  } catch (error) {
    logger.logError('Failed to process payment intent failed', error as Error, { orderId });
    throw error;
  }
}

async function handlePaymentIntentCanceled(event: StripeWebhookEvent, logger: any): Promise<WebhookProcessingResult> {
  const paymentIntent = event.data.object;
  const orderId = paymentIntent.metadata?.order_id;

  logger.info('Processing payment intent canceled', {
    paymentIntentId: paymentIntent.id,
    orderId,
    cancellationReason: paymentIntent.cancellation_reason
  });

  try {
    if (orderId) {
      // Update order status
      await withDatabaseLogging(
        logger,
        'update_order_canceled',
        async () => {
          const { error } = await supabase
            .from('orders')
            .update({ 
              state: 'cancelled',
              cancelled_at: new Date().toISOString(),
              cancellation_reason: paymentIntent.cancellation_reason
            })
            .eq('id', orderId);
          
          if (error) throw error;
        },
        { orderId, reason: paymentIntent.cancellation_reason }
      );
    }

    return {
      success: true,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      orderId
    };

  } catch (error) {
    logger.logError('Failed to process payment intent canceled', error as Error, { orderId });
    throw error;
  }
}

async function handleChargeDisputeCreated(event: StripeWebhookEvent, logger: any): Promise<WebhookProcessingResult> {
  const dispute = event.data.object;
  const orderId = dispute.metadata?.order_id;

  logger.info('Processing charge dispute created', {
    disputeId: dispute.id,
    orderId,
    amount: dispute.amount,
    reason: dispute.reason
  });

  try {
    if (orderId) {
      // Update order status
      await withDatabaseLogging(
        logger,
        'update_order_disputed',
        async () => {
          const { error } = await supabase
            .from('orders')
            .update({ 
              state: 'disputed',
              disputed_at: new Date().toISOString(),
              dispute_id: dispute.id,
              dispute_reason: dispute.reason
            })
            .eq('id', orderId);
          
          if (error) throw error;
        },
        { orderId, disputeId: dispute.id, reason: dispute.reason }
      );

      // Create dispute record
      await withDatabaseLogging(
        logger,
        'create_dispute_record',
        async () => {
          const { error } = await supabase
            .from('disputes')
            .insert({
              id: dispute.id,
              order_id: orderId,
              amount_cents: dispute.amount,
              reason: dispute.reason,
              status: 'open',
              created_at: new Date().toISOString()
            });
          
          if (error) throw error;
        },
        { orderId, disputeId: dispute.id }
      );
    }

    return {
      success: true,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      orderId
    };

  } catch (error) {
    logger.logError('Failed to process charge dispute created', error as Error, { orderId });
    throw error;
  }
}

async function handleChargeRefunded(event: StripeWebhookEvent, logger: any): Promise<WebhookProcessingResult> {
  const charge = event.data.object;
  const orderId = charge.metadata?.order_id;

  logger.info('Processing charge refunded', {
    chargeId: charge.id,
    orderId,
    refundAmount: charge.amount_refunded
  });

  try {
    if (orderId) {
      // Update order status
      await withDatabaseLogging(
        logger,
        'update_order_refunded',
        async () => {
          const { error } = await supabase
            .from('orders')
            .update({ 
              state: 'refunded',
              refunded_at: new Date().toISOString(),
              refund_amount_cents: charge.amount_refunded
            })
            .eq('id', orderId);
          
          if (error) throw error;
        },
        { orderId, refundAmount: charge.amount_refunded }
      );

      // Create ledger entry
      await withDatabaseLogging(
        logger,
        'create_refund_ledger_entry',
        async () => {
          const { error } = await supabase
            .from('ledger_entries')
            .insert({
              order_id: orderId,
              user_id: charge.metadata?.buyer_id,
              amount_cents: -charge.amount_refunded, // Negative for refund
              entry_type: 'REFUND',
              description: `Refund processed for order ${orderId}`,
              created_at: new Date().toISOString()
            });
          
          if (error) throw error;
        },
        { orderId, refundAmount: charge.amount_refunded }
      );
    }

    return {
      success: true,
      eventId: event.id,
      eventType: event.type,
      processedAt: new Date().toISOString(),
      orderId
    };

  } catch (error) {
    logger.logError('Failed to process charge refunded', error as Error, { orderId });
    throw error;
  }
}

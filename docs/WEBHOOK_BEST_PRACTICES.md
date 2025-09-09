# 🎯 Webhook Best Practices Guide

**Document Type**: Best Practices Guide  
**Version**: 1.0  
**Date**: 2025-09-09  
**Author**: Session Librarian  
**Status**: ✅ **PRODUCTION READY**

---

## 📋 Executive Summary

This comprehensive guide outlines best practices for webhook development, implementation, and maintenance in the Aussie-Market-V2 C2C auction marketplace. These practices are derived from real-world experience, industry standards, and lessons learned from production issues.

### 🎯 **Purpose**
- **Standardize** webhook development practices
- **Prevent** common webhook issues
- **Improve** system reliability and security
- **Enhance** developer productivity
- **Ensure** production readiness

---

## 🏗️ Architecture Best Practices

### **1. Dual Implementation Strategy**

#### **Recommended Approach**
Implement webhook handlers in both SvelteKit API routes and Supabase Edge Functions for maximum reliability.

```typescript
// Primary: SvelteKit API Route
// File: src/routes/api/webhooks/stripe/+server.ts
export const POST: RequestHandler = async ({ request }) => {
    // Primary webhook processing logic
};

// Backup: Supabase Edge Function
// File: supabase/functions/stripe-webhook/index.ts
serve(async (req) => {
    // Backup webhook processing logic
});
```

#### **Benefits**
- **Redundancy**: If one implementation fails, the other can handle requests
- **Performance**: Different implementations can be optimized for different scenarios
- **Maintenance**: Allows for independent updates and testing
- **Scalability**: Can handle different load patterns

### **2. Event-Driven Architecture**

#### **Design Principles**
- **Single Responsibility**: Each webhook handler should handle one event type
- **Loose Coupling**: Minimize dependencies between webhook handlers
- **High Cohesion**: Related functionality should be grouped together

```typescript
// ✅ GOOD: Single responsibility
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    // Only handles payment success logic
}

async function handlePaymentIntentFailed(paymentIntent: Stripe.PaymentIntent) {
    // Only handles payment failure logic
}

// ❌ BAD: Multiple responsibilities
async function handlePaymentEvents(event: Stripe.Event) {
    // Handles multiple event types in one function
    if (event.type === 'payment_intent.succeeded') {
        // Success logic
    } else if (event.type === 'payment_intent.failed') {
        // Failure logic
    }
}
```

### **3. Microservices Integration**

#### **Service Boundaries**
- **Payment Service**: Handle payment-related webhooks
- **Order Service**: Manage order state transitions
- **Notification Service**: Send user notifications
- **Audit Service**: Log and track events

```typescript
// ✅ GOOD: Clear service boundaries
class PaymentWebhookService {
    async processPaymentSuccess(paymentIntent: Stripe.PaymentIntent) {
        // Payment-specific logic
        await this.updatePaymentStatus(paymentIntent);
        await this.notifyOrderService(paymentIntent);
        await this.auditService.logEvent(paymentIntent);
    }
}
```

---

## 🔒 Security Best Practices

### **1. Signature Validation**

#### **Implementation Standards**

```typescript
// ✅ SECURE: Proper signature validation
export const POST: RequestHandler = async ({ request }) => {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    
    // Validate signature
    if (!sig) {
        return json({ error: 'Missing signature' }, { status: 400 });
    }
    
    try {
        const event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
        // Process event
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return json({ error: 'Invalid signature' }, { status: 400 });
    }
};
```

#### **Security Checklist**
- [ ] Always validate webhook signatures
- [ ] Use environment-specific secrets
- [ ] Reject requests without signatures in production
- [ ] Log signature validation failures
- [ ] Implement proper error responses

### **2. Replay Protection**

#### **Event Age Validation**

```typescript
// ✅ SECURE: Event age validation
const MAX_EVENT_AGE_SECONDS = 3600; // 1 hour
const WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes

if (event?.created) {
    const nowSec = Math.floor(Date.now() / 1000);
    const eventAge = nowSec - event.created;
    
    // Reject events that are too old
    if (eventAge > MAX_EVENT_AGE_SECONDS) {
        console.error(`Rejecting old event: ${event.id}, age: ${eventAge}s`);
        return json({ error: 'Event too old' }, { status: 400 });
    }
    
    // Reject events from the future
    if (eventAge < -WEBHOOK_TOLERANCE_SECONDS) {
        console.error(`Rejecting future event: ${event.id}, age: ${eventAge}s`);
        return json({ error: 'Event from future' }, { status: 400 });
    }
}
```

#### **Replay Protection Checklist**
- [ ] Validate event timestamps
- [ ] Reject events that are too old
- [ ] Reject events from the future
- [ ] Log suspicious events
- [ ] Monitor for replay attacks

### **3. Rate Limiting**

#### **Implementation**

```typescript
// ✅ SECURE: Rate limiting by event type
const rateLimitKey = `webhook_rate_limit:${event.type}`;
const rateLimitWindow = 60 * 1000; // 1 minute
const rateLimitMax = 100; // Max 100 events per type per minute

// Check rate limit
if (rateLimit.count >= rateLimitMax) {
    logger.warn('Webhook rate limit exceeded', {
        eventType: event.type,
        count: rateLimit.count,
        limit: rateLimitMax
    });
    return { error: 'Rate limit exceeded' };
}
```

#### **Rate Limiting Best Practices**
- [ ] Implement per-event-type rate limiting
- [ ] Use appropriate rate limits (not too restrictive)
- [ ] Log rate limit violations
- [ ] Consider distributed rate limiting for production
- [ ] Implement backoff strategies for retries

### **4. Input Validation**

#### **Data Validation**

```typescript
// ✅ SECURE: Input validation
function validateWebhookEvent(event: Stripe.Event): boolean {
    // Validate required fields
    if (!event.id || !event.type || !event.created) {
        return false;
    }
    
    // Validate event structure
    if (!event.data || !event.data.object) {
        return false;
    }
    
    // Validate event age
    const eventAge = Date.now() - (event.created * 1000);
    if (eventAge > MAX_EVENT_AGE_SECONDS) {
        return false;
    }
    
    return true;
}
```

#### **Validation Checklist**
- [ ] Validate all input data
- [ ] Check required fields
- [ ] Validate data types
- [ ] Sanitize user input
- [ ] Implement schema validation

---

## 🗄️ Database Best Practices

### **1. Idempotency Protection**

#### **Implementation**

```typescript
// ✅ SECURE: Comprehensive idempotency
async function checkIdempotency(eventId: string, orderId?: string, eventType?: string) {
    // Global event idempotency
    const existing = await supabase
        .from('webhook_events')
        .select('event_id, processed_at, order_id, event_type')
        .eq('event_id', eventId)
        .single();
    
    if (existing.data) {
        return { isDuplicate: true, status: 'completed' };
    }
    
    // Order-specific idempotency for payment events
    if (orderId && eventType) {
        const orderEvent = await supabase
            .from('webhook_events')
            .select('event_id, processed_at')
            .eq('order_id', orderId)
            .eq('event_type', eventType)
            .eq('processed_at', null)
            .single();
        
        if (orderEvent.data) {
            return { isDuplicate: true, status: 'processing' };
        }
    }
    
    return { isDuplicate: false, status: 'new' };
}
```

#### **Idempotency Checklist**
- [ ] Implement global event idempotency
- [ ] Add order-specific idempotency for payment events
- [ ] Use database constraints for data integrity
- [ ] Handle race conditions properly
- [ ] Log idempotency violations

### **2. State Management**

#### **Atomic State Transitions**

```typescript
// ✅ SECURE: Atomic state transitions
async function updateOrderState(orderId: string, newState: string, currentState: string) {
    const { data: updateResult, error } = await supabase
        .from('orders')
        .update({ 
            state: newState,
            updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .eq('state', currentState) // Ensure state hasn't changed
        .select('id');
    
    if (error) throw error;
    
    // Check if any rows were updated
    if (!updateResult || updateResult.length === 0) {
        throw new Error('Order state changed during processing');
    }
    
    return updateResult[0];
}
```

#### **State Management Checklist**
- [ ] Validate state transitions
- [ ] Use atomic database operations
- [ ] Implement state validation functions
- [ ] Handle concurrent updates
- [ ] Log state transition attempts

### **3. Database Performance**

#### **Query Optimization**

```typescript
// ✅ GOOD: Optimized queries
// Select only needed columns
const { data } = await supabase
    .from('orders')
    .select('id, state, stripe_payment_intent_id')
    .eq('id', orderId)
    .single();

// Use database functions for complex operations
const { data } = await supabase.rpc('validate_order_state_transition', {
    order_id: orderId,
    new_state: 'paid',
    user_id: userId
});

// ❌ BAD: Inefficient queries
// Selecting all columns
const { data } = await supabase
    .from('orders')
    .select('*')
    .eq('id', orderId)
    .single();
```

#### **Performance Checklist**
- [ ] Use specific column selection
- [ ] Implement proper indexing
- [ ] Use database functions for complex operations
- [ ] Monitor query performance
- [ ] Implement connection pooling

---

## 📊 Monitoring and Logging Best Practices

### **1. Structured Logging**

#### **Implementation**

```typescript
// ✅ GOOD: Structured logging
logger.info('Processing webhook event', {
    eventId: event.id,
    eventType: event.type,
    orderId: orderId,
    timestamp: new Date().toISOString(),
    processingTime: Date.now() - startTime
});

logger.error('Webhook processing failed', {
    eventId: event.id,
    eventType: event.type,
    error: error.message,
    stack: error.stack,
    context: { orderId, userId }
});
```

#### **Logging Checklist**
- [ ] Use structured logging format
- [ ] Include relevant context
- [ ] Log at appropriate levels
- [ ] Include correlation IDs
- [ ] Avoid logging sensitive data

### **2. Metrics and Monitoring**

#### **Key Metrics**

```typescript
// ✅ GOOD: Comprehensive metrics
class WebhookMetrics {
    static trackProcessingTime(eventType: string, duration: number) {
        // Track processing time
    }
    
    static trackSuccess(eventType: string, eventId: string) {
        // Track successful processing
    }
    
    static trackError(eventType: string, error: string) {
        // Track errors
    }
    
    static trackIdempotency(eventType: string, isDuplicate: boolean) {
        // Track idempotency
    }
}
```

#### **Monitoring Checklist**
- [ ] Track processing times
- [ ] Monitor success/failure rates
- [ ] Track error patterns
- [ ] Monitor resource usage
- [ ] Set up alerting

### **3. Error Tracking**

#### **Implementation**

```typescript
// ✅ GOOD: Comprehensive error tracking
try {
    await processWebhookEvent(event);
} catch (error) {
    // Log error with context
    logger.error('Webhook processing failed', {
        eventId: event.id,
        eventType: event.type,
        error: error.message,
        stack: error.stack
    });
    
    // Track error metrics
    Metrics.trackError(event.type, error.message);
    
    // Send to error tracking service
    captureException(error, {
        tags: {
            operation: 'webhook_processing',
            event_type: event.type
        },
        extra: {
            event_id: event.id,
            order_id: orderId
        }
    });
    
    // Return appropriate error response
    return json({ error: 'Processing failed' }, { status: 500 });
}
```

#### **Error Tracking Checklist**
- [ ] Log all errors with context
- [ ] Track error metrics
- [ ] Send to error tracking service
- [ ] Implement error recovery
- [ ] Monitor error trends

---

## 🚀 Performance Best Practices

### **1. Async Processing**

#### **Non-Blocking Operations**

```typescript
// ✅ GOOD: Async processing for non-critical operations
async function processWebhookEvent(event: Stripe.Event) {
    // Critical operations (synchronous)
    await updateOrderState(event);
    await createPaymentRecord(event);
    
    // Non-critical operations (asynchronous)
    setImmediate(async () => {
        try {
            await sendNotification(event);
            await updateAnalytics(event);
        } catch (error) {
            logger.error('Async operation failed', { error });
        }
    });
}
```

#### **Async Processing Checklist**
- [ ] Identify critical vs non-critical operations
- [ ] Use async processing for non-critical operations
- [ ] Implement proper error handling for async operations
- [ ] Monitor async operation performance
- [ ] Use appropriate async patterns

### **2. Caching Strategy**

#### **Implementation**

```typescript
// ✅ GOOD: Strategic caching
class WebhookCache {
    private cache = new Map<string, any>();
    
    async getOrder(orderId: string) {
        const cacheKey = `order:${orderId}`;
        
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey);
        }
        
        const order = await supabase
            .from('orders')
            .select('id, state, stripe_payment_intent_id')
            .eq('id', orderId)
            .single();
        
        // Cache for 5 minutes
        this.cache.set(cacheKey, order, 5 * 60 * 1000);
        
        return order;
    }
}
```

#### **Caching Checklist**
- [ ] Cache frequently accessed data
- [ ] Implement appropriate cache TTL
- [ ] Handle cache invalidation
- [ ] Monitor cache performance
- [ ] Use distributed caching for production

### **3. Resource Management**

#### **Connection Pooling**

```typescript
// ✅ GOOD: Connection pool configuration
const supabase = createClient(url, key, {
    db: {
        schema: 'public',
    },
    auth: {
        persistSession: false
    },
    global: {
        headers: {
            'Connection': 'keep-alive'
        }
    }
});
```

#### **Resource Management Checklist**
- [ ] Implement connection pooling
- [ ] Monitor resource usage
- [ ] Implement proper cleanup
- [ ] Use appropriate timeouts
- [ ] Handle resource exhaustion

---

## 🧪 Testing Best Practices

### **1. Unit Testing**

#### **Test Structure**

```typescript
// ✅ GOOD: Comprehensive unit tests
describe('Webhook Handlers', () => {
    describe('handlePaymentIntentSucceeded', () => {
        it('should process payment success correctly', async () => {
            // Arrange
            const paymentIntent = createMockPaymentIntent();
            const order = createMockOrder();
            
            // Act
            await handlePaymentIntentSucceeded(paymentIntent);
            
            // Assert
            expect(mockSupabase.from).toHaveBeenCalledWith('orders');
            expect(mockSupabase.update).toHaveBeenCalledWith({
                state: 'paid',
                paid_at: expect.any(String)
            });
        });
        
        it('should handle missing order gracefully', async () => {
            // Arrange
            const paymentIntent = createMockPaymentIntent();
            mockSupabase.from.mockReturnValue({
                select: jest.fn().mockResolvedValue({ data: null, error: null })
            });
            
            // Act & Assert
            await expect(handlePaymentIntentSucceeded(paymentIntent))
                .resolves.not.toThrow();
        });
        
        it('should validate state transitions', async () => {
            // Test state validation logic
        });
    });
});
```

#### **Testing Checklist**
- [ ] Test all webhook handlers
- [ ] Test error scenarios
- [ ] Test state validation
- [ ] Test idempotency
- [ ] Test edge cases

### **2. Integration Testing**

#### **End-to-End Testing**

```typescript
// ✅ GOOD: Integration tests
describe('Webhook Integration Tests', () => {
    it('should process payment webhook end-to-end', async () => {
        // Create test order
        const order = await createTestOrder();
        
        // Send webhook request
        const response = await request(app)
            .post('/api/webhooks/stripe')
            .set('Stripe-Signature', createTestSignature())
            .send(createTestWebhookEvent(order.id));
        
        // Verify response
        expect(response.status).toBe(200);
        
        // Verify database state
        const updatedOrder = await getOrder(order.id);
        expect(updatedOrder.state).toBe('paid');
    });
});
```

#### **Integration Testing Checklist**
- [ ] Test end-to-end flows
- [ ] Test database interactions
- [ ] Test error scenarios
- [ ] Test concurrent processing
- [ ] Test idempotency

### **3. Load Testing**

#### **Performance Testing**

```typescript
// ✅ GOOD: Load testing
describe('Webhook Load Tests', () => {
    it('should handle high webhook volume', async () => {
        const promises = [];
        
        // Send 100 concurrent webhooks
        for (let i = 0; i < 100; i++) {
            promises.push(
                request(app)
                    .post('/api/webhooks/stripe')
                    .set('Stripe-Signature', createTestSignature())
                    .send(createTestWebhookEvent(`order-${i}`))
            );
        }
        
        const responses = await Promise.all(promises);
        
        // Verify all requests succeeded
        responses.forEach(response => {
            expect(response.status).toBe(200);
        });
    });
});
```

#### **Load Testing Checklist**
- [ ] Test concurrent processing
- [ ] Test high volume scenarios
- [ ] Monitor performance metrics
- [ ] Test under stress conditions
- [ ] Validate error handling under load

---

## 🔧 Development Best Practices

### **1. Code Organization**

#### **File Structure**

```
src/routes/api/webhooks/
├── stripe/
│   ├── +server.ts              # Main Stripe webhook handler
│   ├── identity/
│   │   └── +server.ts          # KYC webhook handler
│   └── handlers/
│       ├── payment.ts          # Payment event handlers
│       ├── dispute.ts          # Dispute event handlers
│       └── refund.ts           # Refund event handlers
├── shared/
│   ├── validation.ts           # Validation utilities
│   ├── logging.ts              # Logging utilities
│   └── metrics.ts              # Metrics utilities
└── types/
    └── webhook.ts              # TypeScript types
```

#### **Code Organization Checklist**
- [ ] Organize files by functionality
- [ ] Separate concerns properly
- [ ] Use consistent naming conventions
- [ ] Implement proper abstractions
- [ ] Document complex logic

### **2. Error Handling**

#### **Error Handling Patterns**

```typescript
// ✅ GOOD: Consistent error handling
class WebhookError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public context?: Record<string, any>
    ) {
        super(message);
        this.name = 'WebhookError';
    }
}

function handleWebhookError(error: Error): Response {
    if (error instanceof WebhookError) {
        return json({ error: error.message }, { status: error.statusCode });
    }
    
    // Log unexpected errors
    logger.error('Unexpected webhook error', { error });
    
    return json({ error: 'Internal server error' }, { status: 500 });
}
```

#### **Error Handling Checklist**
- [ ] Use consistent error types
- [ ] Implement proper error responses
- [ ] Log all errors with context
- [ ] Handle errors gracefully
- [ ] Provide meaningful error messages

### **3. Configuration Management**

#### **Environment Configuration**

```typescript
// ✅ GOOD: Environment configuration
interface WebhookConfig {
    stripe: {
        secretKey: string;
        webhookSecret: string;
        apiVersion: string;
    };
    database: {
        url: string;
        serviceKey: string;
    };
    security: {
        maxEventAge: number;
        toleranceSeconds: number;
        rateLimitWindow: number;
        rateLimitMax: number;
    };
}

const config: WebhookConfig = {
    stripe: {
        secretKey: env.STRIPE_SECRET_KEY,
        webhookSecret: env.STRIPE_WEBHOOK_SECRET,
        apiVersion: '2023-10-16'
    },
    database: {
        url: env.SUPABASE_URL,
        serviceKey: env.SUPABASE_SERVICE_ROLE_KEY
    },
    security: {
        maxEventAge: parseInt(env.MAX_EVENT_AGE_SECONDS || '3600'),
        toleranceSeconds: parseInt(env.WEBHOOK_TOLERANCE_SECONDS || '300'),
        rateLimitWindow: parseInt(env.RATE_LIMIT_WINDOW_MS || '60000'),
        rateLimitMax: parseInt(env.RATE_LIMIT_MAX_EVENTS || '100')
    }
};
```

#### **Configuration Checklist**
- [ ] Use environment variables
- [ ] Validate configuration on startup
- [ ] Provide sensible defaults
- [ ] Document configuration options
- [ ] Use type-safe configuration

---

## 🚀 Deployment Best Practices

### **1. Pre-Deployment Checklist**

#### **Security Validation**
- [ ] All environment variables configured
- [ ] Webhook secrets properly set
- [ ] Database migrations applied
- [ ] RLS policies enabled
- [ ] Security tests passing

#### **Performance Validation**
- [ ] Load testing completed
- [ ] Database indexes created
- [ ] Monitoring configured
- [ ] Error tracking enabled

#### **Quality Validation**
- [ ] All tests passing
- [ ] Code review completed
- [ ] Documentation updated
- [ ] Rollback plan prepared

### **2. Deployment Process**

#### **Staging Deployment**

```bash
# 1. Deploy to staging
npm run deploy:staging

# 2. Configure webhook endpoints
# Update Stripe webhook URLs to staging

# 3. Run integration tests
npm run test:integration

# 4. Validate security measures
npm run test:security

# 5. Test error scenarios
npm run test:error-scenarios
```

#### **Production Deployment**

```bash
# 1. Deploy to production
npm run deploy:production

# 2. Update webhook endpoints
# Update Stripe webhook URLs to production

# 3. Monitor error rates
# Check monitoring dashboards

# 4. Validate processing times
# Monitor performance metrics

# 5. Check security logs
# Review security event logs
```

### **3. Post-Deployment Monitoring**

#### **Key Metrics to Monitor**

```typescript
// ✅ GOOD: Post-deployment monitoring
const monitoringMetrics = {
    processing: {
        successRate: '> 99%',
        averageProcessingTime: '< 5 seconds',
        errorRate: '< 1%'
    },
    security: {
        signatureValidationFailures: '< 0.1%',
        rateLimitViolations: '< 0.1%',
        suspiciousActivity: '0'
    },
    performance: {
        databaseConnectionUsage: '< 80%',
        memoryUsage: '< 80%',
        cpuUsage: '< 80%'
    }
};
```

#### **Monitoring Checklist**
- [ ] Monitor webhook processing success rate
- [ ] Track average processing time
- [ ] Monitor error rates by type
- [ ] Check database performance
- [ ] Review security events

---

## 📚 Documentation Best Practices

### **1. Code Documentation**

#### **Function Documentation**

```typescript
/**
 * Processes a successful payment intent webhook event
 * 
 * @param paymentIntent - The Stripe PaymentIntent object
 * @returns Promise<void>
 * 
 * @throws {Error} When order_id is missing from metadata
 * @throws {Error} When order state transition is invalid
 * @throws {Error} When database update fails
 * 
 * @example
 * ```typescript
 * const paymentIntent = {
 *   id: 'pi_123',
 *   metadata: { order_id: 'order_456' },
 *   amount: 1000
 * };
 * 
 * await handlePaymentIntentSucceeded(paymentIntent);
 * ```
 */
async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    // Implementation
}
```

#### **Documentation Checklist**
- [ ] Document all public functions
- [ ] Include parameter descriptions
- [ ] Document return values
- [ ] Include error conditions
- [ ] Provide usage examples

### **2. API Documentation**

#### **Webhook Endpoint Documentation**

```markdown
## POST /api/webhooks/stripe

Processes Stripe webhook events for payment processing.

### Headers
- `Content-Type: application/json`
- `Stripe-Signature: t=timestamp,v1=signature`

### Request Body
```json
{
  "id": "evt_1234567890",
  "type": "payment_intent.succeeded",
  "data": {
    "object": {
      "id": "pi_1234567890",
      "amount": 1000,
      "currency": "aud",
      "metadata": {
        "order_id": "order_123"
      }
    }
  },
  "created": 1234567890
}
```

### Response
- **200 OK**: Event processed successfully
- **400 Bad Request**: Invalid signature or malformed request
- **422 Unprocessable Entity**: Invalid state transition
- **500 Internal Server Error**: System error
```

#### **API Documentation Checklist**
- [ ] Document all endpoints
- [ ] Include request/response examples
- [ ] Document error responses
- [ ] Include authentication requirements
- [ ] Provide testing examples

### **3. Troubleshooting Documentation**

#### **Common Issues Guide**

```markdown
## Common Webhook Issues

### Issue: Signature Validation Failures

**Symptoms**: HTTP 400 errors with "Invalid signature"

**Causes**:
- Incorrect webhook secret
- Clock skew between systems
- Malformed request body

**Solutions**:
1. Verify webhook secret configuration
2. Check system time synchronization
3. Validate request body format

### Issue: Event Age Validation Failures

**Symptoms**: HTTP 400 errors with "Event too old"

**Causes**:
- System clock drift
- Network delays
- Processing bottlenecks

**Solutions**:
1. Synchronize system time
2. Optimize processing speed
3. Adjust tolerance settings
```

#### **Troubleshooting Checklist**
- [ ] Document common issues
- [ ] Provide diagnostic steps
- [ ] Include solutions
- [ ] Add prevention measures
- [ ] Update regularly

---

## 🔄 Maintenance Best Practices

### **1. Regular Maintenance Tasks**

#### **Weekly Tasks**
- [ ] Review error logs and patterns
- [ ] Check system performance metrics
- [ ] Update dependencies if needed
- [ ] Review security logs

#### **Monthly Tasks**
- [ ] Analyze webhook processing trends
- [ ] Review and update documentation
- [ ] Conduct security assessment
- [ ] Performance optimization review

#### **Quarterly Tasks**
- [ ] Comprehensive security audit
- [ ] Load testing and capacity planning
- [ ] Disaster recovery testing
- [ ] Team training and knowledge sharing

### **2. Update Procedures**

#### **Dependency Updates**

```bash
# Check for updates
npm outdated

# Update dependencies
npm update

# Test after updates
npm test
npm run test:e2e
```

#### **Code Updates**

```bash
# Build and test
npm run build
npm test

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production
```

### **3. Monitoring and Alerting**

#### **Alerting Rules**

```yaml
# Example alerting configuration
alerts:
  - name: "Webhook Error Rate High"
    condition: "error_rate > 0.05"
    duration: "5m"
    severity: "critical"
    
  - name: "Webhook Processing Time High"
    condition: "avg_processing_time > 10s"
    duration: "5m"
    severity: "warning"
    
  - name: "Database Connection Pool Exhausted"
    condition: "connection_pool_usage > 0.9"
    duration: "2m"
    severity: "critical"
```

#### **Monitoring Checklist**
- [ ] Set up comprehensive alerting
- [ ] Monitor key performance metrics
- [ ] Track error rates and patterns
- [ ] Monitor resource usage
- [ ] Regular alerting rule reviews

---

## 📋 Best Practices Checklist

### **Development Checklist**

#### **Code Quality**
- [ ] Use TypeScript for type safety
- [ ] Implement comprehensive error handling
- [ ] Add detailed logging for debugging
- [ ] Write unit tests for all functions
- [ ] Document complex business logic

#### **Security**
- [ ] Always validate webhook signatures
- [ ] Implement proper error responses
- [ ] Use environment-specific configurations
- [ ] Log security events
- [ ] Regular security audits

#### **Performance**
- [ ] Optimize database queries
- [ ] Implement proper caching
- [ ] Use async processing for non-critical operations
- [ ] Monitor performance metrics
- [ ] Implement connection pooling

### **Operations Checklist**

#### **Monitoring**
- [ ] Set up comprehensive alerting
- [ ] Monitor key performance metrics
- [ ] Track error rates and patterns
- [ ] Regular log analysis
- [ ] Performance benchmarking

#### **Maintenance**
- [ ] Regular dependency updates
- [ ] Database maintenance
- [ ] Security patch management
- [ ] Performance optimization
- [ ] Documentation updates

#### **Incident Response**
- [ ] Document incident response procedures
- [ ] Establish escalation procedures
- [ ] Create runbooks for common issues
- [ ] Regular incident response training
- [ ] Post-incident reviews

---

## 📞 Support and Contacts

### **Team Responsibilities**

**Development Team**:
- Code implementation and optimization
- Testing and quality assurance
- Performance monitoring
- Bug fixes and feature development

**Security Team**:
- Security validation and compliance
- Vulnerability assessment
- Incident response
- Security training

**Operations Team**:
- System monitoring and alerting
- Performance optimization
- Disaster recovery
- Infrastructure management

### **Escalation Procedures**

**Level 1 - Development Team** (0-2 hours):
- Code issues
- Feature requests
- Bug reports
- Performance issues

**Level 2 - Technical Lead** (2-8 hours):
- Architecture decisions
- Security concerns
- System outages
- Critical bugs

**Level 3 - Management** (8+ hours):
- Business impact
- Resource allocation
- Strategic decisions
- Compliance issues

---

## 📋 Appendices

### **Appendix A: Code Examples**

#### **Complete Webhook Handler Example**

```typescript
import { json } from '@sveltejs/kit';
import Stripe from 'stripe';
import { supabase } from '$lib/supabase';
import { env } from '$lib/env';
import type { RequestHandler } from './$types';

const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: '2023-10-16'
});

const endpointSecret = env.STRIPE_WEBHOOK_SECRET;
const MAX_EVENT_AGE_SECONDS = 3600;
const WEBHOOK_TOLERANCE_SECONDS = 300;

export const POST: RequestHandler = async ({ request }) => {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');

    // Validate signature
    if (!sig) {
        return json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
        event = stripe.webhooks.constructEvent(body, sig, endpointSecret);
    } catch (err) {
        console.error('Webhook signature verification failed:', err);
        return json({ error: 'Invalid signature' }, { status: 400 });
    }

    // Validate event age
    if (event?.created) {
        const nowSec = Math.floor(Date.now() / 1000);
        const eventAge = nowSec - event.created;
        
        if (eventAge > MAX_EVENT_AGE_SECONDS) {
            console.error(`Rejecting old event: ${event.id}, age: ${eventAge}s`);
            return json({ error: 'Event too old' }, { status: 400 });
        }
        
        if (eventAge < -WEBHOOK_TOLERANCE_SECONDS) {
            console.error(`Rejecting future event: ${event.id}, age: ${eventAge}s`);
            return json({ error: 'Event from future' }, { status: 400 });
        }
    }

    // Check idempotency
    const existing = await supabase
        .from('webhook_events')
        .select('event_id, processed_at')
        .eq('event_id', event.id)
        .single();
    
    if (existing.data) {
        console.log(`Event ${event.id} already processed`);
        return json({ received: true, idempotent: true });
    }

    // Record event
    await supabase
        .from('webhook_events')
        .insert({
            event_id: event.id,
            type: event.type,
            created_at: new Date(event.created * 1000).toISOString()
        });

    try {
        // Process event
        console.log(`Processing webhook event: ${event.type} (${event.id})`);
        
        switch (event.type) {
            case 'payment_intent.succeeded':
                await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
                break;
            case 'payment_intent.payment_failed':
                await handlePaymentIntentFailed(event.data.object as Stripe.PaymentIntent);
                break;
            default:
                console.log(`Unhandled event type: ${event.type} (${event.id})`);
        }

        // Mark as processed
        await supabase
            .from('webhook_events')
            .update({ processed_at: new Date().toISOString() })
            .eq('event_id', event.id);

        console.log(`Successfully processed webhook event: ${event.type} (${event.id})`);
        return json({ received: true, processed: true });
    } catch (error) {
        console.error(`Error processing webhook event ${event.type} (${event.id}):`, error);
        
        // Mark as failed
        await supabase
            .from('webhook_events')
            .update({ 
                processed_at: new Date().toISOString(),
                error_message: error instanceof Error ? error.message : 'Unknown error'
            })
            .eq('event_id', event.id);

        return json({ 
            error: 'Webhook processing failed', 
            event_id: event.id,
            event_type: event.type
        }, { status: 500 });
    }
};

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
    const orderId = paymentIntent.metadata.order_id;
    
    if (!orderId) {
        throw new Error('Missing order_id in payment intent metadata');
    }

    // Validate order state
    const { data: existingOrder } = await supabase
        .from('orders')
        .select('state, stripe_payment_intent_id')
        .eq('id', orderId)
        .single();

    if (!existingOrder) {
        console.log(`Order ${orderId} not found - treating as idempotent success`);
        return;
    }

    const validFromStates = ['pending', 'pending_payment'];
    if (!validFromStates.includes(existingOrder.state)) {
        console.log(`Order ${orderId} in state ${existingOrder.state}, cannot transition to paid`);
        return;
    }

    // Update order state
    const { error: updateError } = await supabase
        .from('orders')
        .update({
            state: 'paid',
            stripe_payment_intent_id: paymentIntent.id,
            paid_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        })
        .eq('id', orderId)
        .in('state', validFromStates);

    if (updateError) {
        console.error('Error updating order after payment success:', updateError);
        if (updateError.message.includes('state')) {
            console.log(`Order ${orderId} state changed during processing - treating as idempotent success`);
            return;
        }
        throw updateError;
    }

    console.log(`Payment succeeded for order ${orderId}`);
}
```

### **Appendix B: Configuration Reference**

**Environment Variables**:
```bash
# Required
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Optional
NODE_ENV=production
WEBHOOK_TOLERANCE_SECONDS=300
MAX_EVENT_AGE_SECONDS=3600
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_EVENTS=100
LOG_LEVEL=info
```

**Database Configuration**:
```sql
-- Connection settings
max_connections = 100
shared_preload_libraries = 'pg_stat_statements'
log_statement = 'all'
log_min_duration_statement = 1000

-- Performance settings
shared_buffers = '256MB'
effective_cache_size = '1GB'
work_mem = '4MB'
maintenance_work_mem = '64MB'
```

### **Appendix C: Testing Examples**

#### **Unit Test Example**

```typescript
import { handlePaymentIntentSucceeded } from '../handlers/payment';
import { supabase } from '$lib/supabase';

jest.mock('$lib/supabase');

describe('handlePaymentIntentSucceeded', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should process payment success correctly', async () => {
        // Arrange
        const paymentIntent = {
            id: 'pi_123',
            metadata: { order_id: 'order_456' },
            amount: 1000
        };
        
        const mockOrder = {
            id: 'order_456',
            state: 'pending_payment',
            stripe_payment_intent_id: null
        };
        
        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: mockOrder, error: null })
                })
            }),
            update: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    in: jest.fn().mockResolvedValue({ error: null })
                })
            })
        });

        // Act
        await handlePaymentIntentSucceeded(paymentIntent);

        // Assert
        expect(supabase.from).toHaveBeenCalledWith('orders');
        expect(supabase.from().update).toHaveBeenCalledWith({
            state: 'paid',
            stripe_payment_intent_id: 'pi_123',
            paid_at: expect.any(String),
            updated_at: expect.any(String)
        });
    });

    it('should handle missing order gracefully', async () => {
        // Arrange
        const paymentIntent = {
            id: 'pi_123',
            metadata: { order_id: 'order_456' },
            amount: 1000
        };
        
        (supabase.from as jest.Mock).mockReturnValue({
            select: jest.fn().mockReturnValue({
                eq: jest.fn().mockReturnValue({
                    single: jest.fn().mockResolvedValue({ data: null, error: null })
                })
            })
        });

        // Act & Assert
        await expect(handlePaymentIntentSucceeded(paymentIntent))
            .resolves.not.toThrow();
    });
});
```

---

**Document Status**: ✅ **COMPLETE**  
**Last Updated**: 2025-09-09  
**Next Review**: 2025-12-09  
**Version**: 1.0

---

*This best practices guide is maintained by the Session Librarian and should be updated whenever new practices are discovered or standards change.*

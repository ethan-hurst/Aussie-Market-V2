# 🔧 Webhook Troubleshooting Guide

**Document Type**: Troubleshooting Guide  
**Version**: 1.0  
**Date**: 2025-09-09  
**Author**: Session Librarian  
**Status**: ✅ **PRODUCTION READY**

---

## 📋 Quick Reference

### **Emergency Response Checklist**

🚨 **Critical Issues (P0)**:
- [ ] Webhook processing completely down
- [ ] Payment events not processing
- [ ] Security vulnerabilities detected
- [ ] Database connection failures

🟡 **High Priority Issues (P1)**:
- [ ] High error rates (>5%)
- [ ] Processing delays (>10 seconds)
- [ ] Signature validation failures
- [ ] Idempotency conflicts

🟢 **Medium Priority Issues (P2)**:
- [ ] Rate limiting triggered
- [ ] Event age validation failures
- [ ] Notification delivery issues
- [ ] Performance degradation

---

## 🔍 Diagnostic Tools

### **1. Health Check Commands**

```bash
# Check webhook endpoint health
curl -X GET https://your-domain.com/api/health/webhook

# Test webhook signature validation
curl -X POST https://your-domain.com/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test_signature" \
  -d '{"type": "test.event", "id": "evt_test"}'

# Check database connectivity
curl -X GET https://your-domain.com/api/health/database
```

### **2. Database Queries**

```sql
-- Check recent webhook events
SELECT 
    event_id,
    event_type,
    order_id,
    created_at,
    processed_at,
    error_message,
    retry_count
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY created_at DESC
LIMIT 20;

-- Check error patterns
SELECT 
    error_message,
    COUNT(*) as error_count,
    MAX(created_at) as last_occurrence
FROM webhook_events
WHERE error_message IS NOT NULL
    AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_message
ORDER BY error_count DESC;

-- Check processing performance
SELECT 
    event_type,
    COUNT(*) as total_events,
    COUNT(processed_at) as processed_events,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

### **3. Log Analysis**

```bash
# Check application logs
tail -f /var/log/app/webhook.log | grep ERROR

# Check system logs
journalctl -u webhook-service -f

# Check database logs
tail -f /var/log/postgresql/postgresql.log | grep webhook
```

---

## 🚨 Common Issues and Solutions

### **Issue 1: Signature Validation Failures**

#### **Symptoms**
- HTTP 400 errors with "Invalid signature"
- Webhook events not processing
- Stripe dashboard showing failed deliveries

#### **Root Causes**
1. **Incorrect webhook secret**
2. **Clock skew between systems**
3. **Malformed request body**
4. **Missing signature header**

#### **Diagnostic Steps**

```bash
# 1. Verify webhook secret configuration
echo $STRIPE_WEBHOOK_SECRET
# Should start with 'whsec_' and be 64+ characters

# 2. Check system time synchronization
date
# Compare with: https://time.is/

# 3. Test webhook endpoint manually
curl -X POST https://your-domain.com/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test_signature" \
  -d '{"type": "test.event", "id": "evt_test"}'
```

#### **Solutions**

**Solution 1: Fix Webhook Secret**
```bash
# Get correct webhook secret from Stripe Dashboard
# 1. Go to Stripe Dashboard → Developers → Webhooks
# 2. Click on your webhook endpoint
# 3. Copy the "Signing secret"
# 4. Update environment variable

export STRIPE_WEBHOOK_SECRET=whsec_correct_secret_here
```

**Solution 2: Fix Clock Skew**
```bash
# Synchronize system time
sudo ntpdate -s time.nist.gov
# or
sudo chrony sources -v
```

**Solution 3: Debug Signature Validation**
```typescript
// Add debug logging to webhook handler
console.log('Signature header:', req.headers.get('stripe-signature'));
console.log('Body length:', body.length);
console.log('Webhook secret configured:', !!endpointSecret);
```

#### **Prevention**
- Use NTP for time synchronization
- Regularly verify webhook secrets
- Implement signature validation testing
- Monitor signature validation errors

---

### **Issue 2: Event Age Validation Failures**

#### **Symptoms**
- HTTP 400 errors with "Event too old"
- Events rejected as replay attacks
- Inconsistent event processing

#### **Root Causes**
1. **System clock drift**
2. **Network delays**
3. **Processing bottlenecks**
4. **Incorrect tolerance settings**

#### **Diagnostic Steps**

```sql
-- Check event age distribution
SELECT 
    event_id,
    event_type,
    created_at,
    NOW() - created_at as age,
    EXTRACT(EPOCH FROM (NOW() - created_at)) as age_seconds
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'
ORDER BY age_seconds DESC
LIMIT 10;
```

```bash
# Check system time accuracy
date
timedatectl status
```

#### **Solutions**

**Solution 1: Adjust Tolerance Settings**
```typescript
// Increase tolerance if needed (be careful with security implications)
const MAX_EVENT_AGE_SECONDS = 7200; // 2 hours instead of 1
const WEBHOOK_TOLERANCE_SECONDS = 600; // 10 minutes instead of 5
```

**Solution 2: Fix System Time**
```bash
# Synchronize system time
sudo ntpdate -s time.nist.gov
# or configure chrony
sudo systemctl enable chrony
sudo systemctl start chrony
```

**Solution 3: Optimize Processing Speed**
```typescript
// Implement async processing for non-critical operations
setTimeout(async () => {
    await sendNotification(orderId, 'payment_success');
}, 0);
```

#### **Prevention**
- Regular time synchronization
- Monitor processing times
- Optimize webhook handlers
- Set appropriate tolerance values

---

### **Issue 3: Idempotency Conflicts**

#### **Symptoms**
- Duplicate event processing
- Database constraint violations
- Race conditions
- Inconsistent order states

#### **Root Causes**
1. **Concurrent webhook processing**
2. **Network retries**
3. **Event replay**
4. **Missing idempotency checks**

#### **Diagnostic Steps**

```sql
-- Check for duplicate events
SELECT 
    event_id,
    event_type,
    order_id,
    created_at,
    processed_at,
    error_message
FROM webhook_events
WHERE event_id IN (
    SELECT event_id
    FROM webhook_events
    GROUP BY event_id
    HAVING COUNT(*) > 1
)
ORDER BY event_id, created_at;

-- Check race conditions
SELECT 
    order_id,
    event_type,
    COUNT(*) as event_count,
    COUNT(processed_at) as processed_count
FROM webhook_events
WHERE order_id IS NOT NULL
    AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY order_id, event_type
HAVING COUNT(*) > 1;
```

#### **Solutions**

**Solution 1: Clean Up Duplicate Events**
```sql
-- Remove duplicate unprocessed events
DELETE FROM webhook_events
WHERE id IN (
    SELECT id
    FROM (
        SELECT id,
               ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at DESC) as rn
        FROM webhook_events
        WHERE processed_at IS NULL
    ) t
    WHERE rn > 1
);
```

**Solution 2: Implement Better Idempotency**
```typescript
// Enhanced idempotency check with race condition protection
const isDuplicate = await withDatabaseLogging(
    logger,
    'check_duplicate_webhook',
    async () => {
        const { data, error } = await supabase
            .from('webhook_events')
            .select('id, processed_at, error_message')
            .eq('event_id', event.id)
            .maybeSingle();
        
        if (error) throw error;
        
        // If event exists and was successfully processed, it's a duplicate
        if (data && data.processed_at && !data.error_message) {
            return { isDuplicate: true, status: 'completed' };
        }
        
        // If event exists but is still processing, it might be a race condition
        if (data && !data.processed_at) {
            return { isDuplicate: true, status: 'processing' };
        }
        
        return { isDuplicate: false, status: 'new' };
    }
);
```

**Solution 3: Fix Race Conditions**
```typescript
// Use database-level locking for critical operations
const { data: updateResult, error } = await supabase
    .from('orders')
    .update({ 
        state: 'paid',
        paid_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .eq('state', 'pending_payment') // Ensure state hasn't changed
    .select('id');
```

#### **Prevention**
- Implement proper database constraints
- Use atomic operations
- Add comprehensive idempotency checks
- Monitor for race conditions

---

### **Issue 4: Database Connection Issues**

#### **Symptoms**
- HTTP 500 errors during processing
- Connection timeouts
- Transaction failures
- "Connection pool exhausted" errors

#### **Root Causes**
1. **Database overload**
2. **Connection pool exhaustion**
3. **Network issues**
4. **Long-running transactions**

#### **Diagnostic Steps**

```sql
-- Check active connections
SELECT 
    state,
    COUNT(*) as connection_count
FROM pg_stat_activity
WHERE datname = 'your_database_name'
GROUP BY state;

-- Check long-running queries
SELECT 
    pid,
    now() - pg_stat_activity.query_start AS duration,
    query
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes'
    AND state = 'active';
```

```bash
# Check database server status
systemctl status postgresql
# Check connection limits
psql -c "SHOW max_connections;"
```

#### **Solutions**

**Solution 1: Optimize Connection Pool**
```typescript
// Configure connection pool settings
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

**Solution 2: Implement Connection Retry Logic**
```typescript
async function withRetry<T>(
    operation: () => Promise<T>, 
    maxRetries = 3,
    delay = 1000
): Promise<T> {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            if (i === maxRetries - 1) throw error;
            
            // Check if it's a connection error
            if (error.message.includes('connection') || 
                error.message.includes('timeout')) {
                await new Promise(resolve => 
                    setTimeout(resolve, delay * (i + 1))
                );
                continue;
            }
            throw error;
        }
    }
    throw new Error('Max retries exceeded');
}
```

**Solution 3: Optimize Database Queries**
```typescript
// Use specific column selection
const { data } = await supabase
    .from('orders')
    .select('id, state, stripe_payment_intent_id') // Only select needed columns
    .eq('id', orderId)
    .single();

// Use database functions for complex operations
const { data } = await supabase.rpc('validate_order_state_transition', {
    order_id: orderId,
    new_state: 'paid',
    user_id: userId
});
```

#### **Prevention**
- Monitor connection pool usage
- Optimize database queries
- Implement proper error handling
- Regular database maintenance

---

### **Issue 5: Rate Limiting Issues**

#### **Symptoms**
- HTTP 429 errors
- "Rate limit exceeded" messages
- Webhook events being rejected
- Inconsistent processing

#### **Root Causes**
1. **High webhook volume**
2. **Incorrect rate limit settings**
3. **Memory-based rate limiting issues**
4. **Webhook retry storms**

#### **Diagnostic Steps**

```typescript
// Check rate limiting data
console.log('Rate limit data:', (globalThis as any).webhookRateLimit);

// Monitor webhook volume
SELECT 
    event_type,
    COUNT(*) as event_count,
    DATE_TRUNC('minute', created_at) as minute
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type, minute
ORDER BY minute DESC;
```

#### **Solutions**

**Solution 1: Adjust Rate Limits**
```typescript
// Increase rate limits if needed
const rateLimitWindow = 60 * 1000; // 1 minute
const rateLimitMax = 200; // Increase from 100 to 200
```

**Solution 2: Implement Redis-Based Rate Limiting**
```typescript
// Use Redis for distributed rate limiting
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

async function checkRateLimit(eventType: string): Promise<boolean> {
    const key = `webhook_rate_limit:${eventType}`;
    const window = 60; // 1 minute
    const limit = 100;
    
    const current = await redis.incr(key);
    if (current === 1) {
        await redis.expire(key, window);
    }
    
    return current <= limit;
}
```

**Solution 3: Implement Backoff Strategy**
```typescript
// Implement exponential backoff for retries
async function processWithBackoff(event: any, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await processEvent(event);
        } catch (error) {
            if (error.status === 429 && i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000; // Exponential backoff
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }
}
```

#### **Prevention**
- Monitor webhook volume patterns
- Implement proper rate limiting
- Use distributed rate limiting for production
- Set up alerting for rate limit violations

---

### **Issue 6: State Transition Errors**

#### **Symptoms**
- HTTP 422 errors
- "Invalid state transition" messages
- Orders stuck in incorrect states
- Business logic failures

#### **Root Causes**
1. **Race conditions**
2. **Invalid state transitions**
3. **Missing state validation**
4. **Concurrent updates**

#### **Diagnostic Steps**

```sql
-- Check order state transitions
SELECT 
    id,
    state,
    created_at,
    updated_at,
    stripe_payment_intent_id
FROM orders
WHERE state IN ('pending', 'pending_payment', 'paid')
    AND updated_at > NOW() - INTERVAL '1 hour'
ORDER BY updated_at DESC;

-- Check for stuck orders
SELECT 
    state,
    COUNT(*) as order_count
FROM orders
WHERE updated_at < NOW() - INTERVAL '1 hour'
GROUP BY state;
```

#### **Solutions**

**Solution 1: Implement State Validation**
```typescript
// Validate state transitions before processing
const validFromStates = ['pending', 'pending_payment'];
if (!validFromStates.includes(existingOrder.state)) {
    console.log(`Order ${orderId} in state ${existingOrder.state}, cannot transition to paid`);
    return; // Idempotent: already processed
}

// Use atomic updates with state validation
const { error: updateError } = await supabase
    .from('orders')
    .update({
        state: 'paid',
        paid_at: new Date().toISOString()
    })
    .eq('id', orderId)
    .in('state', validFromStates); // Only update if still in valid state
```

**Solution 2: Fix Stuck Orders**
```sql
-- Reset stuck orders to valid states
UPDATE orders
SET state = 'pending_payment',
    updated_at = NOW()
WHERE state = 'pending'
    AND created_at < NOW() - INTERVAL '1 hour'
    AND stripe_payment_intent_id IS NULL;
```

**Solution 3: Implement State Machine**
```typescript
// Define valid state transitions
const stateTransitions = {
    'pending': ['pending_payment', 'cancelled'],
    'pending_payment': ['paid', 'payment_failed', 'cancelled'],
    'paid': ['ready_for_handover', 'refunded', 'disputed'],
    'payment_failed': ['pending_payment', 'cancelled'],
    'cancelled': [],
    'refunded': [],
    'disputed': ['refunded', 'released']
};

function isValidTransition(currentState: string, newState: string): boolean {
    return stateTransitions[currentState]?.includes(newState) || false;
}
```

#### **Prevention**
- Implement proper state validation
- Use atomic database operations
- Add comprehensive logging
- Regular state consistency checks

---

## 🔧 Advanced Troubleshooting

### **1. Performance Issues**

#### **Slow Processing Times**

**Diagnostic Steps**:
```sql
-- Check processing time distribution
SELECT 
    event_type,
    COUNT(*) as total_events,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time,
    MAX(EXTRACT(EPOCH FROM (processed_at - created_at))) as max_processing_time,
    PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (processed_at - created_at))) as p95_processing_time
FROM webhook_events
WHERE processed_at IS NOT NULL
    AND created_at > NOW() - INTERVAL '1 hour'
GROUP BY event_type;
```

**Solutions**:
```typescript
// Optimize database queries
const { data } = await supabase
    .from('orders')
    .select('id, state') // Only select needed columns
    .eq('id', orderId)
    .single();

// Use database functions for complex operations
const { data } = await supabase.rpc('process_payment_webhook', {
    order_id: orderId,
    payment_intent_id: paymentIntent.id
});

// Implement async processing for non-critical operations
setTimeout(async () => {
    await sendNotification(orderId, 'payment_success');
}, 0);
```

#### **High Memory Usage**

**Diagnostic Steps**:
```bash
# Check memory usage
ps aux | grep webhook
free -h
top -p $(pgrep webhook)

# Check for memory leaks
node --inspect webhook-server.js
```

**Solutions**:
```typescript
// Implement proper cleanup
process.on('SIGTERM', () => {
    // Clean up resources
    cleanup();
    process.exit(0);
});

// Use streaming for large payloads
const stream = new ReadableStream({
    start(controller) {
        // Process data in chunks
    }
});
```

### **2. Security Issues**

#### **Suspicious Activity**

**Diagnostic Steps**:
```sql
-- Check for suspicious patterns
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    COUNT(*) as event_count,
    COUNT(DISTINCT event_id) as unique_events
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour DESC;

-- Check for failed signature validations
SELECT 
    COUNT(*) as failed_signatures
FROM webhook_events
WHERE error_message LIKE '%signature%'
    AND created_at > NOW() - INTERVAL '1 hour';
```

**Solutions**:
```typescript
// Implement additional security checks
if (eventAge > MAX_EVENT_AGE_SECONDS) {
    logger.warn('Potential replay attack detected', {
        eventId: event.id,
        eventAge: eventAge
    });
    Metrics.errorTracked('webhook_replay_attack', 'security');
    return json({ error: 'Event too old' }, { status: 400 });
}

// Implement IP whitelisting
const allowedIPs = ['54.187.174.169', '54.187.205.235', '54.187.216.72'];
const clientIP = request.headers.get('x-forwarded-for') || request.ip;
if (!allowedIPs.includes(clientIP)) {
    logger.warn('Unauthorized IP address', { clientIP });
    return json({ error: 'Unauthorized' }, { status: 403 });
}
```

### **3. Data Consistency Issues**

#### **Inconsistent Order States**

**Diagnostic Steps**:
```sql
-- Check for inconsistent states
SELECT 
    o.id,
    o.state,
    o.stripe_payment_intent_id,
    p.status as payment_status,
    p.stripe_payment_intent_id as payment_intent_id
FROM orders o
LEFT JOIN payments p ON o.id = p.order_id
WHERE o.state = 'paid' 
    AND (p.status IS NULL OR p.status != 'completed')
    AND o.created_at > NOW() - INTERVAL '24 hours';
```

**Solutions**:
```sql
-- Fix inconsistent states
UPDATE orders
SET state = 'pending_payment'
WHERE state = 'paid'
    AND id NOT IN (
        SELECT order_id 
        FROM payments 
        WHERE status = 'completed'
    );
```

---

## 📊 Monitoring and Alerting

### **1. Key Metrics to Monitor**

**Performance Metrics**:
- Webhook processing success rate
- Average processing time
- 95th percentile processing time
- Error rate by type
- Database connection pool usage

**Business Metrics**:
- Payment processing success rate
- Order state transition success rate
- Notification delivery rate
- Dispute resolution time

**Security Metrics**:
- Signature validation failure rate
- Rate limit violations
- Suspicious activity patterns
- Failed authentication attempts

### **2. Alerting Rules**

```yaml
# Example alerting configuration
alerts:
  - name: "Webhook Processing Failure Rate High"
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
    
  - name: "Signature Validation Failures"
    condition: "signature_failures > 10"
    duration: "5m"
    severity: "warning"
```

### **3. Dashboard Queries**

```sql
-- Webhook processing overview
SELECT 
    DATE_TRUNC('hour', created_at) as hour,
    event_type,
    COUNT(*) as total_events,
    COUNT(processed_at) as processed_events,
    COUNT(CASE WHEN error_message IS NOT NULL THEN 1 END) as failed_events,
    AVG(EXTRACT(EPOCH FROM (processed_at - created_at))) as avg_processing_time
FROM webhook_events
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour, event_type
ORDER BY hour DESC, event_type;

-- Error analysis
SELECT 
    error_message,
    COUNT(*) as error_count,
    MAX(created_at) as last_occurrence,
    COUNT(DISTINCT event_type) as affected_event_types
FROM webhook_events
WHERE error_message IS NOT NULL
    AND created_at > NOW() - INTERVAL '24 hours'
GROUP BY error_message
ORDER BY error_count DESC;
```

---

## 🚀 Recovery Procedures

### **1. Complete System Recovery**

**Step 1: Assess the Situation**
```bash
# Check system status
curl -X GET https://your-domain.com/api/health
systemctl status webhook-service
systemctl status postgresql
```

**Step 2: Stop Processing**
```bash
# Stop webhook processing
systemctl stop webhook-service
# Or disable webhook endpoints temporarily
```

**Step 3: Fix Root Cause**
- Follow specific troubleshooting steps above
- Apply necessary fixes
- Test in staging environment

**Step 4: Restart Services**
```bash
# Restart services in order
systemctl restart postgresql
systemctl restart webhook-service
```

**Step 5: Verify Recovery**
```bash
# Test webhook processing
curl -X POST https://your-domain.com/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test_signature" \
  -d '{"type": "test.event", "id": "evt_test"}'
```

### **2. Data Recovery**

**Recover Failed Events**:
```sql
-- Find failed events that can be retried
SELECT 
    event_id,
    event_type,
    order_id,
    created_at,
    error_message
FROM webhook_events
WHERE processed_at IS NULL
    AND error_message IS NOT NULL
    AND created_at > NOW() - INTERVAL '24 hours'
ORDER BY created_at DESC;

-- Reset failed events for retry
UPDATE webhook_events
SET processed_at = NULL,
    error_message = NULL,
    retry_count = retry_count + 1
WHERE event_id IN (
    SELECT event_id
    FROM webhook_events
    WHERE processed_at IS NULL
        AND error_message IS NOT NULL
        AND retry_count < 3
);
```

**Fix Inconsistent States**:
```sql
-- Fix orders stuck in pending states
UPDATE orders
SET state = 'pending_payment'
WHERE state = 'pending'
    AND created_at < NOW() - INTERVAL '1 hour'
    AND stripe_payment_intent_id IS NULL;

-- Fix orders with missing payment records
INSERT INTO payments (order_id, amount_cents, currency, payment_method, status, processed_at)
SELECT 
    o.id,
    o.total_amount_cents,
    'aud',
    'stripe',
    'completed',
    o.paid_at
FROM orders o
WHERE o.state = 'paid'
    AND o.paid_at IS NOT NULL
    AND NOT EXISTS (
        SELECT 1 FROM payments p WHERE p.order_id = o.id
    );
```

---

## 📚 Best Practices

### **1. Prevention**

**Regular Maintenance**:
- Monitor system metrics daily
- Review error logs weekly
- Update dependencies monthly
- Conduct security audits quarterly

**Testing**:
- Unit tests for all webhook handlers
- Integration tests for end-to-end flows
- Load testing for performance validation
- Security testing for vulnerability assessment

**Documentation**:
- Keep troubleshooting guides updated
- Document all configuration changes
- Maintain runbooks for common issues
- Regular team training sessions

### **2. Response**

**Incident Response**:
1. **Immediate Response** (0-5 minutes)
   - Assess severity and impact
   - Notify relevant team members
   - Implement temporary fixes if needed

2. **Investigation** (5-30 minutes)
   - Analyze logs and metrics
   - Identify root cause
   - Document findings

3. **Resolution** (30 minutes - 2 hours)
   - Implement permanent fix
   - Test solution thoroughly
   - Deploy to production
   - Monitor for issues

4. **Post-Incident** (2-24 hours)
   - Document lessons learned
   - Update procedures
   - Improve monitoring
   - Conduct team review

### **3. Continuous Improvement**

**Metrics Analysis**:
- Track error trends over time
- Identify performance bottlenecks
- Monitor security incidents
- Analyze business impact

**Process Improvement**:
- Regular procedure reviews
- Automation opportunities
- Tool and technology updates
- Team skill development

---

## 📞 Support Contacts

### **Internal Team**

**Development Team**:
- **Backend Engineer**: System implementation and optimization
- **Security Auditor**: Security issues and compliance
- **Quality Engineer**: Testing and quality assurance
- **Session Librarian**: Documentation and knowledge management

### **External Support**

**Stripe Support**:
- **Technical Issues**: https://support.stripe.com/
- **API Documentation**: https://stripe.com/docs/api
- **Webhook Testing**: https://stripe.com/docs/webhooks/test

**Supabase Support**:
- **Database Issues**: https://supabase.com/support
- **Edge Functions**: https://supabase.com/docs/guides/functions
- **Documentation**: https://supabase.com/docs

### **Escalation Matrix**

| Issue Type | Level 1 | Level 2 | Level 3 |
|------------|---------|---------|---------|
| **Code Issues** | Development Team | Technical Lead | Engineering Manager |
| **Security Issues** | Security Auditor | Security Lead | CTO |
| **Infrastructure** | DevOps Team | Infrastructure Lead | CTO |
| **Business Impact** | Product Manager | Engineering Manager | CEO |

---

## 📋 Appendices

### **Appendix A: Error Code Reference**

| HTTP Code | Error Type | Description | Common Causes |
|-----------|------------|-------------|---------------|
| 400 | Bad Request | Invalid signature, malformed request | Wrong webhook secret, clock skew |
| 401 | Unauthorized | Missing or invalid authentication | Missing API keys, expired tokens |
| 403 | Forbidden | Access denied | IP restrictions, rate limits |
| 422 | Unprocessable Entity | Invalid state transition | Business logic errors, race conditions |
| 429 | Too Many Requests | Rate limit exceeded | High webhook volume, retry storms |
| 500 | Internal Server Error | System error | Database issues, code bugs |
| 502 | Bad Gateway | Upstream service error | External API failures |
| 503 | Service Unavailable | System overload | High load, maintenance mode |

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

### **Appendix C: Useful Commands**

**System Commands**:
```bash
# Check service status
systemctl status webhook-service
systemctl status postgresql

# View logs
journalctl -u webhook-service -f
tail -f /var/log/postgresql/postgresql.log

# Check system resources
htop
df -h
free -h
```

**Database Commands**:
```sql
-- Check connections
SELECT * FROM pg_stat_activity WHERE datname = 'your_database';

-- Check locks
SELECT * FROM pg_locks WHERE NOT granted;

-- Check slow queries
SELECT query, mean_time, calls FROM pg_stat_statements ORDER BY mean_time DESC LIMIT 10;
```

**Webhook Testing**:
```bash
# Test webhook endpoint
curl -X POST https://your-domain.com/api/webhooks/stripe \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=1234567890,v1=test_signature" \
  -d '{"type": "test.event", "id": "evt_test"}'

# Test with Stripe CLI
stripe listen --forward-to https://your-domain.com/api/webhooks/stripe
stripe trigger payment_intent.succeeded
```

---

**Document Status**: ✅ **COMPLETE**  
**Last Updated**: 2025-09-09  
**Next Review**: 2025-12-09  
**Version**: 1.0

---

*This troubleshooting guide is maintained by the Session Librarian and should be updated whenever new issues are discovered or resolved.*

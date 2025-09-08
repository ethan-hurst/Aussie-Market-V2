# Sentry Integration Documentation

This document describes the comprehensive Sentry integration implemented across all application layers of Aussie-Market-V2.

## Overview

Sentry provides error tracking, performance monitoring, and alerting capabilities across:
- **Frontend**: SvelteKit client-side error tracking
- **Backend**: API route error handling and performance monitoring
- **Edge Functions**: Supabase Edge Function error tracking
- **Database**: Database operation error tracking
- **External Services**: Stripe webhook error tracking

## Architecture

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │  Edge Functions │
│   (SvelteKit)   │    │   (API Routes)  │    │   (Supabase)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │        Sentry             │
                    │   (Error Tracking &       │
                    │    Performance)           │
                    └─────────────┬─────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      Alerting             │
                    │   (Slack, PagerDuty,     │
                    │    Email, Webhooks)       │
                    └───────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Sentry DSNs
PUBLIC_SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id

# Sentry CLI Configuration
SENTRY_ORG=your-org
SENTRY_PROJECT=your-project
SENTRY_AUTH_TOKEN=your-auth-token

# Alerting Configuration (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
PAGERDUTY_INTEGRATION_KEY=your-pagerduty-key
ALERT_EMAIL_RECIPIENTS=admin@example.com,dev@example.com
ALERT_EMAIL_FROM=alerts@aussie-market.com
```

> **🚨 CRITICAL SECURITY WARNING** 🚨
> 
> **NEVER commit real tokens or secrets to source control!** The above values are examples only.
> 
> **Secure Token Management:**
> - Store `SENTRY_AUTH_TOKEN` in CI/CD secret stores (GitHub Secrets, GitLab CI Variables, etc.)
> - Use local `.env` files for development (already gitignored)
> - Reference tokens via environment variables: `$SENTRY_AUTH_TOKEN`
> 
> **If you accidentally commit a real token:**
> 1. **Immediately rotate/revoke the token** in Sentry dashboard
> 2. Remove the token from git history using `git filter-branch` or BFG Repo-Cleaner
> 3. Force push to remove from remote repository
> 4. Notify your team to update their local copies
> 
> **CI/CD Integration:**
> ```yaml
> # GitHub Actions example
> - name: Upload source maps
>   run: npm run sentry:upload
>   env:
>     SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
> ```

### Sentry Project Setup

1. Create a new Sentry project for your application
2. Configure environment-specific DSNs
3. Set up release tracking with source maps
4. Configure alert rules and notification channels

## Implementation Details

### Frontend Integration

**Files**: `src/hooks.client.ts`, `sentry.client.config.ts`

- Client-side error capture
- Performance monitoring
- User context tracking
- Session tracking

```typescript
// Automatic error capture in SvelteKit
import { initSentry } from '$lib/sentry';

initSentry({
  dsn: env.PUBLIC_SENTRY_DSN,
  environment: env.NODE_ENV,
  tracesSampleRate: 1.0
});
```

### Backend Integration

**Files**: `src/hooks.server.ts`, `src/lib/sentry.ts`, `sentry.server.config.ts`

- Server-side error capture
- Request context tracking
- User session tracking
- Performance monitoring

```typescript
// Server-side error handling
import { captureException, setSentryUser } from '$lib/sentry';

export async function handleError({ error, event }) {
  captureException(error, {
    tags: {
      path: event.url.pathname,
      method: event.request.method
    }
  });
}
```

### API Error Handling

**Files**: `src/lib/api-error-handler.ts`

- Standardized error responses
- Error categorization
- Sentry integration
- Correlation ID tracking

```typescript
import { ApiErrorHandler } from '$lib/api-error-handler';

// Handle API errors with Sentry integration
const response = await ApiErrorHandler.handleError(error, event, {
  operation: 'create_listing',
  userId: user.id
});
```

### Performance Monitoring

**Files**: `src/lib/performance-monitor.ts`

- Operation timing
- Memory usage tracking
- Performance alerts
- Transaction monitoring

```typescript
import { PerformanceMonitor } from '$lib/performance-monitor';

// Monitor database operations
const result = await PerformanceMonitor.monitorDatabaseOperation(
  'create_listing',
  'INSERT INTO listings...',
  () => supabase.from('listings').insert(data)
);
```

### Edge Function Integration

**Files**: `supabase/functions/_shared/sentry.ts`

- Edge Function error tracking
- Deno runtime compatibility
- Shared logging integration

```typescript
import { initSentry, captureException } from '../_shared/sentry.ts';

// Initialize Sentry in Edge Functions
initSentry();

// Capture errors
captureException(error, {
  tags: {
    function: 'stripe_webhook',
    operation: 'process_payment'
  }
});
```

### Alerting System

**Files**: `src/lib/sentry-alerts.ts`

- Configurable alert rules
- Multiple notification channels
- Severity-based routing
- Cooldown management

```typescript
import { SentryAlerts } from '$lib/sentry-alerts';

// Send critical alert
await SentryAlerts.sendAlert('critical', 'critical', 
  'Database connection failed', {
    database: 'primary',
    error_count: 5
  }
);
```

## Error Categories

### Critical Errors (Immediate Alert)
- Database connection failures
- Stripe webhook failures
- High memory usage (>500MB)
- API errors (5xx) with high frequency

### High Severity (Slack Alert)
- Authentication failures
- Rate limiting exceeded
- Slow API responses (>5s)
- File upload failures

### Medium Severity (Slack Alert)
- Validation errors (high frequency)
- Edge Function timeouts
- Payment processing delays

### Low Severity (Slack Alert)
- Deprecated API usage
- Performance degradation
- Non-critical warnings

## Performance Monitoring

### Metrics Tracked
- **API Response Times**: All API routes
- **Database Operations**: Query performance
- **Edge Function Execution**: Function duration
- **Memory Usage**: Heap and RSS monitoring
- **Error Rates**: Error frequency by type

### Performance Alerts
- Slow operations (>2s)
- High memory usage (>100MB heap)
- High error rates (>10 errors/minute)
- Database query timeouts

## Alerting Channels

### Slack Integration
- Real-time notifications
- Rich error context
- Severity-based formatting
- Channel routing

### PagerDuty Integration
- Critical error escalation
- On-call notifications
- Incident management
- Severity mapping

### Email Alerts (Optional)
- Digest notifications
- Non-critical alerts
- Team notifications

### Webhook Integration
- Custom integrations
- Third-party services
- Custom alerting logic

## Validation and Testing

### Validation Script
```bash
npm run sentry:validate
```

The validation script tests:
- Basic Sentry functionality
- Error capturing
- Performance monitoring
- API error handling
- Alerting system
- Edge Function integration

### Manual Testing

1. **Error Testing**: Trigger errors in different layers
2. **Performance Testing**: Monitor operation timing
3. **Alert Testing**: Verify notification delivery
4. **Integration Testing**: Test end-to-end flows

## Deployment

### Development
- Sentry DSN configured for development
- Reduced sampling rates
- Local alerting disabled

### Staging
- Staging-specific Sentry project
- Full error tracking
- Alert testing enabled

### Production
- Production Sentry project
- Optimized sampling rates
- Full alerting enabled
- Source map uploads

### Release Management
```bash
# Create new release
npm run sentry:release

# Upload source maps
npm run sentry:upload

# Finalize release
npm run sentry:finalize
```

## Monitoring Dashboard

### Key Metrics to Monitor
- Error rate by endpoint
- Performance by operation
- Memory usage trends
- Alert frequency
- User impact metrics

### Sentry Dashboard Sections
- **Issues**: Error tracking and resolution
- **Performance**: Transaction monitoring
- **Releases**: Release tracking and health
- **Alerts**: Alert rules and notifications

## Troubleshooting

### Common Issues

1. **DSN Configuration**
   - Verify environment variables
   - Check DSN format
   - Ensure proper permissions

2. **Source Maps**
   - Verify upload process
   - Check file paths
   - Validate release configuration

3. **Alert Delivery**
   - Test webhook URLs
   - Verify API keys
   - Check rate limits

4. **Performance Impact**
   - Monitor sampling rates
   - Check memory usage
   - Optimize error handling

### Debug Mode
```typescript
// Enable debug logging
initSentry({
  debug: true,
  // ... other options
});
```

## Best Practices

### Error Handling
- Use structured error messages
- Include relevant context
- Avoid sensitive data in errors
- Implement proper error boundaries

### Performance Monitoring
- Monitor critical operations
- Set appropriate thresholds
- Use correlation IDs
- Track user impact

### Alerting
- Set meaningful alert rules
- Use appropriate severity levels
- Implement cooldown periods
- Test alert delivery

### Security
- Sanitize error messages
- Avoid logging sensitive data
- Use secure webhook URLs
- Implement proper authentication

## Maintenance

### Regular Tasks
- Review error trends
- Update alert rules
- Monitor performance metrics
- Clean up old releases

### Monthly Reviews
- Analyze error patterns
- Review alert effectiveness
- Update documentation
- Plan improvements

## Support

For issues with Sentry integration:
1. Check the validation script output
2. Review Sentry dashboard
3. Check environment configuration
4. Review error logs
5. Contact development team

## Related Documentation

- [Sentry Documentation](https://docs.sentry.io/)
- [SvelteKit Integration](https://docs.sentry.io/platforms/javascript/guides/sveltekit/)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)
- [Performance Monitoring](https://docs.sentry.io/product/performance/)

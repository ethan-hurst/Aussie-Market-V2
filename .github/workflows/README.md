# GitHub Actions Workflows

This directory contains CI/CD workflows for the Aussie-Market-V2 project.

## 🛡️ Canary Workflow (`canary.yml`)

The canary workflow validates the staging environment's health by testing critical Stripe webhook integration.

### Purpose
- Verify staging environment is accessible and functional
- Test Stripe webhook delivery and processing
- Validate webhook idempotency mechanisms
- Ensure real-time webhook event recording works correctly

### Triggers
- **Manual**: Via workflow_dispatch with environment selection
- **Scheduled**: Every 6 hours against staging environment  
- **Automatic**: On pushes to main that affect webhook or canary code

### Required Secrets

The following secrets must be configured in GitHub repository settings:

| Secret | Description | Example |
|--------|-------------|---------|
| `STAGING_SITE_URL` | Base URL of staging deployment | `https://staging.aussie-market.com` |
| `CANARY_TOKEN` | Shared secret for canary endpoint access | `canary_secret_token_123` |
| `STRIPE_SECRET_KEY` | Stripe test environment secret key | `sk_test_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint signing secret | `whsec_...` |

### Test Flow
1. **Environment Check**: Verify staging site is accessible
2. **Webhook Setup**: Create test webhook event in Stripe
3. **E2E Testing**: Run canary Playwright tests against staging
4. **Idempotency Check**: Verify webhook events are processed correctly
5. **Artifact Collection**: Save test results and reports

### Success Criteria
- ✅ Staging environment responds to health checks
- ✅ Canary E2E tests pass completely
- ✅ Webhook events are delivered and processed
- ✅ Idempotency mechanisms work correctly
- ✅ No security vulnerabilities in webhook handling

### Failure Scenarios
- ❌ Staging environment not accessible
- ❌ Stripe webhook delivery failures
- ❌ E2E test failures (invalid signatures, etc.)
- ❌ Webhook idempotency not working
- ❌ Database webhook_events table not updated

### Manual Execution

To run the canary workflow manually:

```bash
# Via GitHub CLI
gh workflow run canary.yml -f env=staging

# Via GitHub web interface
# Go to Actions tab → Canary workflow → Run workflow
```

### Monitoring

The workflow provides:
- **Real-time logs** during execution
- **Test artifacts** uploaded for 7 days retention
- **HTML reports** from Playwright test runs
- **Success/failure notifications** in workflow summary

### Integration

This canary workflow is designed to be:
- **Pre-deployment gate**: Run before production deployments
- **Health monitoring**: Continuous validation of staging environment
- **Regression detection**: Early warning of webhook integration issues

---

## 🔧 Setup Instructions

### 1. Configure GitHub Secrets
Navigate to repository Settings → Secrets and variables → Actions, then add all required secrets listed above.

### 2. Enable Workflow
The workflow is enabled automatically when merged to main branch.

### 3. Test Execution
Run the workflow manually first to verify all secrets and staging environment are configured correctly.

### 4. Monitor Results
Check the Actions tab regularly for canary test results and investigate any failures promptly.

---

## 📊 Success Metrics

- **Uptime**: Canary tests should pass >95% of the time
- **Performance**: Test execution should complete in <5 minutes
- **Coverage**: All critical webhook scenarios tested
- **Reliability**: Consistent results across multiple runs

A healthy canary indicates the staging environment is ready for production deployment.

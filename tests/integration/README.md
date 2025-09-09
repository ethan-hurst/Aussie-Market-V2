# Error Handling Integration Tests

This directory contains comprehensive integration tests for the error handling system, validating error scenarios end-to-end with production-like conditions.

## Test Structure

### Core Integration Tests

#### `error-handling-integration.spec.ts`
- **Purpose**: Core error handling system integration tests
- **Coverage**: Error categorization, notification management, error recovery
- **Key Scenarios**:
  - Payment error notifications with complete error flow
  - Network error handling with retry mechanisms
  - Webhook processing errors with polling options
  - Multiple concurrent error scenarios
  - Error notification lifecycle management
  - Real payment failure simulations

#### `error-boundary-integration.spec.ts`
- **Purpose**: Error boundary component integration with error handling system
- **Coverage**: Component error recovery, UI fallback behavior, user experience
- **Key Scenarios**:
  - Component rendering error recovery
  - Payment form validation errors
  - Stripe element loading failures
  - Network error recovery flows
  - Accessibility validation for error notifications
  - Multiple error scenario handling

#### `payment-error-scenarios.spec.ts`
- **Purpose**: Comprehensive payment error scenario testing
- **Coverage**: Real-world payment failures and recovery flows
- **Key Scenarios**:
  - Stripe payment intent failures (card declined, insufficient funds, expired card, CVC errors)
  - Network and connectivity errors (timeouts, DNS failures, intermittent connectivity)
  - Webhook processing failures (timeouts, endpoint unavailability, signature validation)
  - Payment processing edge cases (3D Secure failures, rate limiting, authentication timeouts)
  - Order state conflicts and concurrent payment attempts
  - Error recovery success scenarios

#### `webhook-error-validation.spec.ts`
- **Purpose**: Webhook error handling validation and production scenario testing
- **Coverage**: Webhook processing failures, security validation, infrastructure errors
- **Key Scenarios**:
  - Webhook signature verification failures
  - Processing timeouts and idempotency validation
  - Order state transition validation during webhook processing
  - Network and infrastructure failures affecting webhooks
  - Security validation (unauthorized sources, timestamp freshness)
  - High-volume webhook processing and error escalation

## Test Execution

### Running All Error Handling Tests
```bash
npm run test:error-handling
```

### Running Individual Test Suites
```bash
# Core error handling integration
npm run test -- tests/integration/error-handling-integration.spec.ts

# Error boundary integration  
npm run test -- tests/integration/error-boundary-integration.spec.ts

# Payment error scenarios
npm run test -- tests/integration/payment-error-scenarios.spec.ts

# Webhook error validation
npm run test -- tests/integration/webhook-error-validation.spec.ts
```

### Running All Integration Tests
```bash
npm run test:integration
```

### Running with Coverage
```bash
npm run test:coverage
```

### Error Handling Validation
```bash
npm run test:validate-errors
```

## Test Categories

### 1. Payment Error Integration
- **Card Errors**: Declined cards, insufficient funds, expired cards, invalid CVC
- **Authentication**: 3D Secure failures, authentication timeouts
- **Processing**: Payment intent failures, method authentication issues
- **Recovery**: New payment methods, retry mechanisms, user guidance

### 2. Network Error Recovery
- **Connectivity**: Timeouts, connection failures, DNS resolution issues
- **Infrastructure**: Rate limiting, server unavailability, intermittent failures
- **Recovery**: Automatic retry with exponential backoff, user-initiated retry
- **Offline Handling**: Offline state detection and recovery

### 3. Webhook Processing Validation
- **Processing Failures**: Timeouts, endpoint unavailability, processing errors
- **Security**: Signature validation, timestamp verification, source validation
- **State Management**: Idempotency, concurrent processing, order state conflicts
- **Recovery**: Retry mechanisms, status polling, manual intervention escalation

### 4. Component Error Boundaries
- **Component Failures**: Render errors, state corruption, prop validation failures
- **Recovery UI**: Fallback components, user guidance, recovery actions
- **User Experience**: Accessibility, keyboard navigation, clear error communication
- **Integration**: Error boundary integration with notification system

### 5. Error Notification System
- **Notification Management**: Creation, dismissal, persistence, auto-dismiss
- **User Interface**: Display, actions, accessibility, responsive design
- **Event Handling**: Custom events, action dispatching, error categorization
- **Statistics**: Error tracking, analytics, monitoring integration

## Test Data and Mocking

### Mock Strategies
- **Network Conditions**: Simulated timeouts, connectivity issues, slow responses
- **Payment Failures**: Stripe test card numbers for specific error scenarios
- **Webhook Simulation**: Mocked webhook endpoints and processing delays
- **Component Errors**: Controlled error injection for boundary testing

### Test Environment Setup
- **Before Each**: Clean notification state, mock setup, console suppression
- **After Each**: Cleanup mocks, restore original functions, clear notifications
- **Global Setup**: Test data seeding, environment configuration

## Success Criteria

### Test Coverage Targets
- **Lines**: 80%+ coverage for error handling components
- **Functions**: 80%+ coverage for error handling functions
- **Branches**: 70%+ coverage for error condition paths
- **Statements**: 80%+ coverage for error handling statements

### Error Scenario Coverage
- **Payment Errors**: All major Stripe error types covered
- **Network Errors**: Connection, timeout, and infrastructure failures
- **Webhook Errors**: Processing, security, and state management failures
- **Component Errors**: Render failures and recovery flows
- **User Experience**: Accessibility, recovery guidance, clear communication

### Quality Gates
- All integration tests must pass
- Error handling coverage meets thresholds
- No test flakiness or intermittent failures
- Error recovery flows work reliably
- User experience meets accessibility standards

## Production Validation

### Real-World Scenarios
- High-frequency error conditions
- Concurrent error processing
- Error context preservation across navigation
- Production-like load and stress conditions

### Monitoring Integration
- Error pattern tracking
- Recovery success rates
- User completion rates after errors
- Support escalation triggers

## Troubleshooting

### Common Issues
1. **Mock Setup**: Ensure proper mock cleanup between tests
2. **Timing**: Use proper wait conditions for async error handling
3. **State Management**: Clean notification state between tests
4. **Event Handling**: Verify custom event dispatch and handling

### Debugging
- Use `test.only()` to isolate failing tests
- Check console output for error handling logs
- Verify mock setup and cleanup
- Review error notification state management

### Test Flakiness Prevention
- Avoid hard timeouts, use waitFor conditions
- Properly mock external dependencies
- Clean up state between tests
- Use deterministic test data

## Integration with E2E Tests

These integration tests complement the E2E error handling tests in `tests/e2e/error-handling-e2e.spec.ts`:

- **Integration Tests**: Focus on system behavior, mocking, unit-level validation
- **E2E Tests**: Focus on complete user workflows, real browser behavior, full system integration

Both test suites together provide comprehensive coverage of the error handling system from unit-level behavior to complete user experience validation.
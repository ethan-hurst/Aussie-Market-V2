import { json, type RequestEvent } from '@sveltejs/kit';
import { validateCsrfToken, type CsrfValidationResult } from '$lib/security';
import { validateQueryParams } from '$lib/validation';
import { captureException, setSentryTags } from '$lib/sentry';

/**
 * Centralized CSRF and Query Parameter Validation Middleware
 * 
 * This middleware provides comprehensive security validation for all API endpoints:
 * - CSRF token validation for state-changing requests
 * - Query parameter validation and sanitization
 * - Security event logging and monitoring
 * - Standardized error responses
 */

export interface SecurityValidationOptions {
  requireCsrfToken?: boolean;
  validateQueryParams?: boolean;
  logSecurityEvents?: boolean;
  customErrorHandler?: (error: SecurityValidationError) => Response;
}

export interface SecurityValidationError {
  type: 'csrf' | 'query_params' | 'security';
  reason: string;
  details?: any;
  statusCode: number;
  headers?: Record<string, string>;
}

export interface SecurityContext {
  csrfValid: boolean;
  queryParams: any;
  securityWarnings: string[];
  clientIp?: string;
  userAgent?: string;
}

/**
 * Main CSRF and security validation middleware
 */
export async function validateRequestSecurity(
  event: RequestEvent,
  options: SecurityValidationOptions = {}
): Promise<{ 
  valid: true; 
  context: SecurityContext 
} | { 
  valid: false; 
  error: SecurityValidationError;
  response: Response 
}> {
  const {
    requireCsrfToken = true,
    validateQueryParams: shouldValidateQuery = true,
    logSecurityEvents = true,
    customErrorHandler
  } = options;

  const securityWarnings: string[] = [];
  const clientIp = event.getClientAddress();
  const userAgent = event.request.headers.get('user-agent');
  const pathname = event.url.pathname;
  const method = event.request.method;

  // Set security context for monitoring
  if (logSecurityEvents) {
    setSentryTags({
      security_middleware: 'active',
      endpoint: pathname,
      method: method,
      client_ip: clientIp
    });
  }

  try {
    // 1. CSRF Token Validation
    let csrfResult: CsrfValidationResult = { valid: true };
    
    if (requireCsrfToken) {
      csrfResult = validateCsrfToken(event);
      
      if (!csrfResult.valid) {
        const error: SecurityValidationError = {
          type: 'csrf',
          reason: csrfResult.reason || 'CSRF validation failed',
          statusCode: 403,
          headers: csrfResult.headers
        };

        // Log CSRF violation
        if (logSecurityEvents) {
          captureException(new Error(`CSRF violation: ${error.reason}`), {
            tags: {
              component: 'security',
              error_type: 'csrf_violation',
              endpoint: pathname
            },
            extra: {
              clientIp,
              userAgent,
              origin: event.request.headers.get('origin'),
              referer: event.request.headers.get('referer')
            }
          });
        }

        const response = customErrorHandler 
          ? customErrorHandler(error)
          : json(
              { 
                error: 'Invalid CSRF token', 
                code: 'CSRF_INVALID',
                details: error.reason 
              }, 
              { 
                status: error.statusCode, 
                headers: error.headers 
              }
            );

        return { valid: false, error, response };
      }
    }

    // 2. Query Parameter Validation
    let validatedQueryParams: any = {};
    
    if (shouldValidateQuery) {
      const queryValidation = validateQueryParams(pathname, event.url.searchParams);
      
      if (!queryValidation.ok) {
        const error: SecurityValidationError = {
          type: 'query_params',
          reason: 'Invalid query parameters',
          details: queryValidation.error,
          statusCode: 400
        };

        // Log query parameter validation failure
        if (logSecurityEvents) {
          console.warn('[SECURITY] Query parameter validation failed:', {
            endpoint: pathname,
            params: Object.fromEntries(event.url.searchParams.entries()),
            error: queryValidation.error,
            clientIp,
            userAgent
          });
        }

        const response = customErrorHandler 
          ? customErrorHandler(error)
          : json(
              { 
                error: 'Invalid request parameters', 
                code: 'INVALID_PARAMS',
                details: error.details 
              }, 
              { status: error.statusCode }
            );

        return { valid: false, error, response };
      }
      
      validatedQueryParams = queryValidation.value;
    }

    // 3. Additional Security Checks
    
    // Check for suspicious patterns
    const suspiciousPatterns = checkForSuspiciousActivity(event);
    if (suspiciousPatterns.length > 0) {
      securityWarnings.push(...suspiciousPatterns);
      
      if (logSecurityEvents) {
        console.warn('[SECURITY] Suspicious activity detected:', {
          endpoint: pathname,
          patterns: suspiciousPatterns,
          clientIp,
          userAgent
        });
      }
    }

    // Success - return security context
    const context: SecurityContext = {
      csrfValid: csrfResult.valid,
      queryParams: validatedQueryParams,
      securityWarnings,
      clientIp,
      userAgent
    };

    return { valid: true, context };

  } catch (error) {
    // Handle unexpected errors in security validation
    const securityError: SecurityValidationError = {
      type: 'security',
      reason: 'Security validation failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      statusCode: 500
    };

    if (logSecurityEvents) {
      captureException(error as Error, {
        tags: {
          component: 'security',
          error_type: 'middleware_error',
          endpoint: pathname
        },
        extra: { clientIp, userAgent }
      });
    }

    const response = customErrorHandler 
      ? customErrorHandler(securityError)
      : json(
          { 
            error: 'Internal security error', 
            code: 'SECURITY_ERROR' 
          }, 
          { status: 500 }
        );

    return { valid: false, error: securityError, response };
  }
}

/**
 * Convenience wrapper for API endpoints that need CSRF protection
 */
export async function withCsrfProtection<T>(
  event: RequestEvent,
  handler: (event: RequestEvent, context: SecurityContext) => Promise<T>,
  options?: SecurityValidationOptions
): Promise<T | Response> {
  const validation = await validateRequestSecurity(event, options);
  
  if (!validation.valid) {
    return validation.response;
  }
  
  return handler(event, validation.context);
}

/**
 * Check for suspicious activity patterns
 */
function checkForSuspiciousActivity(event: RequestEvent): string[] {
  const warnings: string[] = [];
  const userAgent = event.request.headers.get('user-agent');
  const referer = event.request.headers.get('referer');
  
  // Check for missing User-Agent (common in automated requests)
  if (!userAgent) {
    warnings.push('Missing User-Agent header');
  }
  
  // Check for suspicious User-Agent patterns
  if (userAgent) {
    const suspiciousUAPatterns = [
      /python-requests/i,
      /curl\//i,
      /wget/i,
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i
    ];
    
    if (suspiciousUAPatterns.some(pattern => pattern.test(userAgent))) {
      warnings.push(`Suspicious User-Agent: ${userAgent}`);
    }
  }
  
  // Check for requests without referer on sensitive endpoints
  if (!referer && event.url.pathname.includes('/api/')) {
    const sensitiveEndpoints = ['/payments/', '/orders/', '/bids/'];
    if (sensitiveEndpoints.some(endpoint => event.url.pathname.includes(endpoint))) {
      warnings.push('Missing Referer header on sensitive endpoint');
    }
  }
  
  return warnings;
}

/**
 * Express-style middleware wrapper for backwards compatibility
 */
export function csrfMiddleware(options?: SecurityValidationOptions) {
  return async (event: RequestEvent) => {
    const validation = await validateRequestSecurity(event, options);
    
    if (!validation.valid) {
      return validation.response;
    }
    
    // Attach security context to locals for use in handlers
    event.locals.securityContext = validation.context;
    
    return null; // Continue to next middleware/handler
  };
}
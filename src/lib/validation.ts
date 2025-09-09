import { z } from 'zod';

export const AUStateEnum = z.enum(['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']);

export const AddressSchema = z.object({
  street: z.string().min(1).max(120).transform(sanitizeInline),
  suburb: z.string().min(1).max(80).transform(sanitizeInline),
  postcode: z.string().regex(/^\d{4}$/),
  state: AUStateEnum
});

export const ListingCreateSchema = z.object({
  title: z.string().min(5).max(140).transform(sanitizeInline),
  description: z.string().min(20).max(4096).transform(sanitizeMultiline),
  category_id: z.number().int().positive(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts']),
  start_cents: z.number().int().min(100),
  reserve_cents: z.number().int().min(0).optional(),
  buy_now_cents: z.number().int().min(0).optional(),
  pickup: z.boolean(),
  shipping: z.boolean(),
  location: AddressSchema,
  start_at: z.string().datetime(),
  end_at: z.string().datetime()
});

export const ListingUpdateSchema = ListingCreateSchema.partial();

export const BidSchema = z.object({
  listingId: z.string().min(1),
  amount_cents: z.number().int().min(100),
  proxy_max_cents: z.number().int().min(0).optional()
});

export const ShipmentEventSchema = z.object({
  status: z.string().min(2).max(64).transform(sanitizeInline),
  description: z.string().max(512).optional().transform((v) => (v ? sanitizeMultiline(v) : v)),
  location: z.string().max(128).optional().transform((v) => (v ? sanitizeInline(v) : v))
});

export const SearchSchema = z.object({
  category_id: z.coerce.number().int().positive().optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts']).optional(),
  state: AUStateEnum.optional(),
  min_price: z.coerce.number().min(0).optional(),
  max_price: z.coerce.number().min(0).optional(),
  search: z.string().max(120).transform((s) => sanitizeInline(s || '')).optional(),
  status: z.string().max(32).optional()
});

export function sanitizeInline(input: string): string {
  return input
    .replace(/[\r\n\t]/g, ' ')
    .replace(/<[^>]*>/g, '')
    .trim();
}

export function sanitizeMultiline(input: string): string {
  return input
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/[\r\t]/g, ' ')
    .trim();
}

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { ok: true; value: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  if (!result.success) {
    const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return { ok: false, error: message };
  }
  return { ok: true, value: result.data };
}

// Orders and Pickup
export const OrderActionSchema = z.object({
  action: z.enum(['mark_ready', 'mark_shipped', 'confirm_delivery', 'release_funds', 'cancel', 'refund'])
});

export const PickupSchema = z.object({
  action: z.enum(['init', 'redeem']).default('init'),
  code6: z.string().regex(/^\d{6}$/).optional(),
  qr_token: z.string().uuid().optional()
}).refine((d) => d.action === 'init' || (!!d.code6 || !!d.qr_token), {
  message: 'Provide code6 or qr_token'
});

export const ShipmentUpsertSchema = z.object({
  carrier: z.string().min(2).max(64).transform(sanitizeInline),
  tracking: z.string().min(3).max(64).transform(sanitizeInline),
  label_url: z.string().url().optional()
});

// Payments
export const PaymentCreateIntentSchema = z.object({
  orderId: z.string().min(1),
  amount: z.number().int().min(100),
  currency: z.string().length(3).default('aud')
});

export const PaymentConfirmSchema = z.object({
  orderId: z.string().min(1),
  paymentIntentId: z.string().min(5)
});

// Storage
export const StorageDeleteSchema = z.object({
  bucket: z.string().min(1),
  path: z.string().min(1),
  photoId: z.string().optional(),
  listingId: z.string().optional()
});

// Storage upload (multipart form fields validated after extraction)
export const StorageUploadSchema = z.object({
  type: z.enum(['listing_photo', 'evidence_file', 'profile_avatar', 'address_proof']),
  listingId: z.string().uuid().optional(),
  disputeId: z.string().uuid().optional(),
  orderIndex: z.coerce.number().int().min(0).max(100).default(0)
}).refine((data) => {
  if (data.type === 'listing_photo') return !!data.listingId;
  if (data.type === 'evidence_file') return !!data.disputeId;
  return true;
}, { message: 'Missing required identifier for upload type' });

// KPI Alerts
export const KPIAlertRuleSchema = z.object({
  name: z.string().min(1).max(100).transform(sanitizeInline),
  metric: z.string().min(1).max(50).transform(sanitizeInline),
  category: z.enum(['financial', 'business', 'performance', 'operational']),
  threshold: z.number().finite(),
  operator: z.enum(['greater_than', 'less_than', 'equals', 'not_equals']),
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  enabled: z.boolean().default(true),
  cooldownMinutes: z.number().int().min(1).max(1440).default(60)
});

export const KPIAlertActionSchema = z.object({
  action: z.enum(['create', 'update', 'delete', 'toggle']),
  ruleId: z.string().uuid().optional(),
  ruleData: KPIAlertRuleSchema.optional()
}).refine((data) => {
  if (data.action === 'create') return !!data.ruleData;
  if (data.action === 'update') return !!data.ruleId && !!data.ruleData;
  if (data.action === 'delete') return !!data.ruleId;
  if (data.action === 'toggle') return !!data.ruleId;
  return true;
}, { message: 'Missing required fields for action' });

// KPI Calculation
export const KPICalculationSchema = z.object({
  startTime: z.string().datetime({ message: 'Invalid start time format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)' }),
  endTime: z.string().datetime({ message: 'Invalid end time format. Use ISO 8601 format (YYYY-MM-DDTHH:mm:ss.sssZ)' }),
  timePeriod: z.enum(['hourly', 'daily', 'weekly', 'monthly'], { message: 'Invalid time period. Must be one of: hourly, daily, weekly, monthly' })
}).refine((data) => {
  const startDate = new Date(data.startTime);
  const endDate = new Date(data.endTime);
  return startDate < endDate;
}, { message: 'Start time must be before end time' }).refine((data) => {
  const startDate = new Date(data.startTime);
  const endDate = new Date(data.endTime);
  const timeDiff = endDate.getTime() - startDate.getTime();
  const oneYear = 365 * 24 * 60 * 60 * 1000; // 1 year in milliseconds
  return timeDiff <= oneYear;
}, { message: 'Time range cannot exceed 1 year' });

// ========== QUERY PARAMETER VALIDATION SCHEMAS ==========
// Secure validation for all API query parameters

export const BidsQuerySchema = z.object({
  action: z.enum(['current', 'history', 'user', 'winning'], { message: 'Invalid action. Must be one of: current, history, user, winning' }),
  listingId: z.string().uuid({ message: 'Invalid listing ID format' }).optional(),
  userId: z.string().uuid({ message: 'Invalid user ID format' }).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
}).refine((data) => {
  // Ensure required fields are present for each action
  if (data.action === 'current' && !data.listingId) {
    return false;
  }
  if (data.action === 'history' && !data.listingId) {
    return false;
  }
  if (data.action === 'user' && !data.userId) {
    return false;
  }
  if (data.action === 'winning' && (!data.listingId || !data.userId)) {
    return false;
  }
  return true;
}, { message: 'Missing required parameters for the specified action' });

export const ListingsQuerySchema = z.object({
  action: z.enum(['get', 'user', 'search'], { message: 'Invalid action. Must be one of: get, user, search' }),
  listingId: z.string().uuid({ message: 'Invalid listing ID format' }).optional(),
  userId: z.string().uuid({ message: 'Invalid user ID format' }).optional(),
  status: z.string().max(32).transform(sanitizeInline).optional(),
  // Search parameters (extends SearchSchema)
  category_id: z.coerce.number().int().positive().optional(),
  condition: z.enum(['new', 'like_new', 'good', 'fair', 'parts']).optional(),
  state: AUStateEnum.optional(),
  min_price: z.coerce.number().min(0).max(1000000).optional(),
  max_price: z.coerce.number().min(0).max(1000000).optional(),
  search: z.string().max(120).transform((s) => sanitizeInline(s || '')).optional()
}).refine((data) => {
  if (data.action === 'get' && !data.listingId) {
    return false;
  }
  if (data.action === 'user' && !data.userId) {
    return false;
  }
  return true;
}, { message: 'Missing required parameters for the specified action' });

export const OrdersQuerySchema = z.object({
  orderId: z.string().uuid({ message: 'Invalid order ID format' })
});

export const KPIQuerySchema = z.object({
  action: z.enum(['get', 'calculate', 'alerts'], { message: 'Invalid action' }).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
  timePeriod: z.enum(['hourly', 'daily', 'weekly', 'monthly']).optional(),
  metric: z.string().max(50).transform(sanitizeInline).optional(),
  category: z.enum(['financial', 'business', 'performance', 'operational']).optional()
});

export const ShipmentQuerySchema = z.object({
  orderId: z.string().uuid({ message: 'Invalid order ID format' })
});

export const PickupQuerySchema = z.object({
  orderId: z.string().uuid({ message: 'Invalid order ID format' })
});

export const StorageQuerySchema = z.object({
  bucket: z.string().min(1).max(50).transform(sanitizeInline).optional(),
  path: z.string().min(1).max(200).transform(sanitizeInline).optional(),
  photoId: z.string().uuid().optional(),
  listingId: z.string().uuid().optional()
});

// ========== CENTRALIZED QUERY VALIDATION FUNCTION ==========

/**
 * Validate query parameters for API endpoints based on the endpoint path
 */
export function validateQueryParams(pathname: string, searchParams: URLSearchParams): { ok: true; value: any } | { ok: false; error: string } {
  const params = Object.fromEntries(searchParams.entries());
  
  // Route-based validation
  if (pathname.includes('/api/bids')) {
    return validate(BidsQuerySchema, params);
  }
  
  if (pathname.includes('/api/listings')) {
    return validate(ListingsQuerySchema, params);
  }
  
  if (pathname.includes('/api/orders')) {
    const orderIdMatch = pathname.match(/\/api\/orders\/([^\/]+)/);
    if (orderIdMatch) {
      return validate(OrdersQuerySchema, { orderId: orderIdMatch[1] });
    }
  }
  
  if (pathname.includes('/api/kpi')) {
    return validate(KPIQuerySchema, params);
  }
  
  if (pathname.includes('/api/shipments')) {
    const orderIdMatch = pathname.match(/\/api\/shipments\/([^\/]+)/);
    if (orderIdMatch) {
      return validate(ShipmentQuerySchema, { orderId: orderIdMatch[1] });
    }
  }
  
  if (pathname.includes('/api/pickup')) {
    const orderIdMatch = pathname.match(/\/api\/pickup\/([^\/]+)/);
    if (orderIdMatch) {
      return validate(PickupQuerySchema, { orderId: orderIdMatch[1] });
    }
  }
  
  if (pathname.includes('/api/storage')) {
    return validate(StorageQuerySchema, params);
  }
  
  // Default: allow all parameters for endpoints without specific validation
  return { ok: true, value: params };
}

/**
 * Enhanced validation function with security logging
 */
export function validateWithSecurity<T>(
  schema: z.ZodSchema<T>, 
  data: unknown,
  context?: { endpoint?: string; userId?: string; ip?: string }
): { ok: true; value: T } | { ok: false; error: string } {
  const result = schema.safeParse(data);
  
  if (!result.success) {
    const message = result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    
    // Log validation failures for security monitoring
    console.warn('[VALIDATION] Schema validation failed:', {
      endpoint: context?.endpoint,
      userId: context?.userId,
      ip: context?.ip,
      errors: result.error.errors,
      inputKeys: typeof data === 'object' && data !== null ? Object.keys(data) : 'non-object'
    });
    
    return { ok: false, error: message };
  }
  
  return { ok: true, value: result.data };
}



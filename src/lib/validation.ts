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
  type: z.enum(['listing_photo', 'evidence_file', 'profile_avatar']),
  listingId: z.string().uuid().optional(),
  disputeId: z.string().uuid().optional(),
  orderIndex: z.coerce.number().int().min(0).max(100).default(0)
}).refine((data) => {
  if (data.type === 'listing_photo') return !!data.listingId;
  if (data.type === 'evidence_file') return !!data.disputeId;
  return true;
}, { message: 'Missing required identifier for upload type' });



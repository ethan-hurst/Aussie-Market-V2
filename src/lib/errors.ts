export type ApiErrorInput = unknown;

const defaultMessage = 'Something went wrong. Please try again.';

export function mapApiErrorToMessage(error: ApiErrorInput): string {
  if (!error) return defaultMessage;

  // Supabase error shape
  const sb = error as any;
  if (sb?.message && typeof sb.message === 'string') {
    return normalize(sb.message);
  }

  // Stripe error shape
  if (sb?.error && typeof sb.error?.message === 'string') {
    return normalize(sb.error.message);
  }

  // API error: { error: string }
  if (typeof sb?.error === 'string') {
    return normalize(sb.error);
  }

  if (typeof error === 'string') return normalize(error);

  try {
    const serialized = JSON.stringify(error);
    if (serialized && serialized !== '{}') return defaultMessage;
  } catch {}

  return defaultMessage;
}

function normalize(message: string): string {
  const m = message.toLowerCase();
  if (m.includes('not authorized') || m.includes('permission denied')) return 'You are not allowed to perform this action.';
  if (m.includes('auction ended')) return 'This auction has already ended.';
  if (m.includes('below minimum') || m.includes('minimum bid')) return 'Your bid is below the minimum allowed.';
  if (m.includes('reserve')) return 'Your bid does not meet the reserve price.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Check your connection and try again.';
  return capitalize(message);
}

function capitalize(s: string): string {
  if (!s) return defaultMessage;
  return s.charAt(0).toUpperCase() + s.slice(1);
}



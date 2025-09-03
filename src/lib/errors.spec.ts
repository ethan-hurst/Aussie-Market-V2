import { describe, it, expect } from 'vitest';
import { mapApiErrorToMessage } from './errors';

describe('mapApiErrorToMessage', () => {
  it('handles string errors', () => {
    expect(mapApiErrorToMessage('auction ended')).toContain('Auction has already ended');
  });

  it('handles supabase shaped errors', () => {
    expect(mapApiErrorToMessage({ message: 'permission denied for table bids' })).toBe('You are not allowed to perform this action.');
  });

  it('falls back to default message', () => {
    expect(mapApiErrorToMessage({})).toBeTypeOf('string');
  });
});



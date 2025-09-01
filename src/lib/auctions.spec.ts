import { describe, it, expect } from 'vitest';
import { calculateBidIncrement, calculateMinimumBid, validateBidAmount } from './auctions';

describe('auctions math', () => {
  it('calculates bid increment by ranges', () => {
    expect(calculateBidIncrement(0)).toBe(50);
    expect(calculateBidIncrement(1500)).toBe(100);
    expect(calculateBidIncrement(60000)).toBe(2500);
  });

  it('calculates minimum next bid', () => {
    expect(calculateMinimumBid(0)).toBe(50);
    expect(calculateMinimumBid(1000)).toBe(1100);
  });

  it('validates bid amount vs minimum and reserve', () => {
    const minFail = validateBidAmount(1000, 1200);
    expect(minFail.valid).toBe(false);
    expect(minFail.minimumBid).toBe(1300);

    const reserveFail = validateBidAmount(2000, 1500, 3000);
    expect(reserveFail.valid).toBe(false);
    expect(reserveFail.minimumBid).toBe(3000);

    const ok = validateBidAmount(2000, 1500);
    expect(ok.valid).toBe(true);
  });
});



import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Comp from './+error.svelte';

describe('orders route +error.svelte', () => {
  it('renders 404 variant', () => {
    const { getByText } = render(Comp, { status: 404, error: { message: 'not found' } });
    expect(getByText('Order not found')).toBeTruthy();
  });

  it('renders generic error', () => {
    const { getByText } = render(Comp, { status: 500, error: { message: 'boom' } });
    expect(getByText('Unable to load order')).toBeTruthy();
  });
});



import { render } from '@testing-library/svelte';
import { describe, it, expect } from 'vitest';
import Fallback from './Fallback.svelte';

describe('Fallback', () => {
  it('renders title and description', () => {
    const { getByText } = render(Fallback, { title: 'Oops', description: 'Something broke' });
    expect(getByText('Oops')).toBeTruthy();
    expect(getByText('Something broke')).toBeTruthy();
  });
});



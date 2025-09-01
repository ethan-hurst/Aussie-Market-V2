import { render, fireEvent } from '@testing-library/svelte';
import { describe, it, expect, vi } from 'vitest';
import { tick } from 'svelte';
import Dialog from './Dialog.svelte';

describe('Dialog', () => {
  it('does not render when open=false', () => {
    const { queryByRole } = render(Dialog, { open: false, title: 'Test' });
    expect(queryByRole('dialog')).toBeNull();
  });

  it('renders with role=dialog when open=true', () => {
    const { getByRole } = render(Dialog, { open: true, title: 'Test' });
    expect(getByRole('dialog')).toBeTruthy();
  });

  it('emits close on overlay click when closeOnOverlay=true', async () => {
    const { container, component } = render(Dialog, { open: true, title: 'Test' });
    const onClose = vi.fn();
    component.$on('close', onClose);
    const overlay = container.querySelector('div[aria-hidden="true"]') as HTMLElement;
    await fireEvent.click(overlay);
    expect(onClose).toHaveBeenCalled();
  });

  it('emits close on Escape when closeOnEscape=true', async () => {
    const { component, getByRole } = render(Dialog, { open: true, title: 'Test' });
    const onClose = vi.fn();
    component.$on('close', onClose);
    await tick();
    const dlg = getByRole('dialog');
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    dlg.dispatchEvent(ev);
    expect(onClose).toHaveBeenCalled();
  });
});



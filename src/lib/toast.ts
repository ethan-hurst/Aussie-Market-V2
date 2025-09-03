import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
  timeoutMs?: number;
}

export const toasts = writable<Toast[]>([]);

function addToast(type: ToastType, message: string, timeoutMs = 4000) {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const toast: Toast = { id, type, message, timeoutMs };
  toasts.update((list) => [toast, ...list]);
  if (timeoutMs > 0) {
    setTimeout(() => {
      toasts.update((list) => list.filter((t) => t.id !== id));
    }, timeoutMs);
  }
}

export function removeToast(id: string) {
  toasts.update((list) => list.filter((t) => t.id !== id));
}

export const toastSuccess = (message: string, timeoutMs?: number) => addToast('success', message, timeoutMs);
export const toastError = (message: string, timeoutMs?: number) => addToast('error', message, timeoutMs);
export const toastInfo = (message: string, timeoutMs?: number) => addToast('info', message, timeoutMs);



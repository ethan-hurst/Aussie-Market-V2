import { mapApiErrorToMessage } from '$lib/errors';

export async function safeFetch(input: RequestInfo | URL, init?: RequestInit) {
  try {
    const res = await fetch(input, init);
    if (!res.ok) {
      let payload: any = null;
      try { payload = await res.json(); } catch {}
      const message = mapApiErrorToMessage(payload || { error: `${res.status}` });
      throw new Error(message);
    }
    return res;
  } catch (err) {
    throw new Error(mapApiErrorToMessage(err));
  }
}



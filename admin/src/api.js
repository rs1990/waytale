const ADMIN_KEY = import.meta.env.VITE_ADMIN_KEY ?? '';

async function req(method, path, body) {
  const res = await fetch(`/admin${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_KEY,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `${res.status}`);
  }
  return res.json();
}

export const adminApi = {
  landmarks:    ()           => req('GET',  '/landmarks'),
  pending:      ()           => req('GET',  '/pending'),
  refreshLog:   (limit = 30) => req('GET',  `/refresh-log?limit=${limit}`),
  reviews:      (id)         => req('GET',  `/reviews/${id}`),

  refreshOne:   (id, force = false) => req('POST', `/landmark/${id}/refresh`, { force, skipTts: true }),
  refreshAll:   (force = false)     => req('POST', '/refresh-all', { force, skipTts: true }),

  approve:  (id) => req('POST', `/content/${id}/approve`),
  publish:  (id) => req('POST', `/content/${id}/publish`),
  reject:   (id) => req('POST', `/content/${id}/reject`),
};

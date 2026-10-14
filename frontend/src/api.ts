export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch('/api/' + path, {
    ...init, headers: { 'Content-Type': 'application/json', ...init?.headers }
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(body.issues?.map((i: {field: string; message: string}) => i.field + ': ' + i.message).join('; ') || body.error || 'Request failed');
  }
  return res.status === 204 ? undefined as T : res.json();
}

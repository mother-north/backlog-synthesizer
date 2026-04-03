// Test helpers — HTTP client for backend integration tests
const BASE_URL = process.env.TEST_API_URL || 'http://localhost:3006';

let cachedToken: string | null = null;

async function fetchJSON(path: string, options: RequestInit = {}): Promise<{ status: number; body: any }> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

export async function getAuthToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const { body } = await fetchJSON('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin@backlog-synthesizer.com', password: 'admin123' }),
  });
  cachedToken = body.accessToken;
  return cachedToken!;
}

export async function apiGet(path: string) {
  const token = await getAuthToken();
  return fetchJSON(path, { headers: { Authorization: `Bearer ${token}` } });
}

export async function apiPost(path: string, data?: object) {
  const token = await getAuthToken();
  return fetchJSON(path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiPut(path: string, data?: object) {
  const token = await getAuthToken();
  return fetchJSON(path, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiDelete(path: string) {
  const token = await getAuthToken();
  return fetchJSON(path, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
}

export async function apiPostNoAuth(path: string, data?: object) {
  return fetchJSON(path, {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined,
  });
}

export async function apiGetNoAuth(path: string) {
  return fetchJSON(path);
}

export async function uploadMeeting(title: string, text: string): Promise<{ status: number; body: any }> {
  const token = await getAuthToken();
  const formData = new FormData();
  formData.append('title', title);
  formData.append('pasteText', text);
  const res = await fetch(`${BASE_URL}/api/meetings/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

import { Platform } from 'react-native';

function resolveBackendUrl(): string {
  const configured = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://13.60.90.159';
  // An https page (e.g. the Vercel-hosted web app) cannot call an http://
  // backend directly — the browser blocks mixed content. Use same-origin
  // paths instead and let the host's /api/* rewrite proxy to the backend.
  if (
    Platform.OS === 'web' &&
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    configured.startsWith('http://')
  ) {
    return '';
  }
  return configured;
}

export const BACKEND_URL = resolveBackendUrl();

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

class ApiClient {
  private token: string | null = null;
  private onUnauthorized: (() => void) | null = null;

  setToken(t: string | null) {
    this.token = t;
  }

  // AuthProvider wires this up so the client can trigger a logout when
  // the JWT expires, instead of every caller silently throwing a generic
  // "Request failed" that leaves the UI in a broken state.
  setOnUnauthorized(cb: (() => void) | null) {
    this.onUnauthorized = cb;
  }

  async request(path: string, options: RequestInit = {}) {
    const url = `${BACKEND_URL}/api${path}`;
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const headers: Record<string, string> = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers as Record<string, string> || {}),
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    const res = await fetch(url, { ...options, headers });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Request failed' }));
      const message = err.detail || 'Request failed';
      if (res.status === 401 && this.onUnauthorized) {
        // Clear our in-memory token so retries don't immediately loop
        // back to the same 401 before the auth provider finishes its
        // logout flow.
        this.token = null;
        try { this.onUnauthorized(); } catch {}
      }
      throw new ApiError(message, res.status);
    }
    if (res.status === 204) return null;
    return res.json();
  }

  get(path: string) {
    return this.request(path);
  }

  post(path: string, body: any) {
    const isFormData = typeof FormData !== 'undefined' && body instanceof FormData;
    return this.request(path, {
      method: 'POST',
      body: isFormData ? body : JSON.stringify(body),
    });
  }

  put(path: string, body?: any) {
    return this.request(path, {
      method: 'PUT',
      body: body ? JSON.stringify(body) : undefined,
    });
  }

  del(path: string) {
    return this.request(path, { method: 'DELETE' });
  }
}

export const api = new ApiClient();

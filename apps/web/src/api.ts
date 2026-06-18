import type { DomainDto, MeResponse, SubscriptionDto } from '@lest/contracts';

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

async function api<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
    ...opts,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'message' in data && String(data.message)) ||
      res.statusText;
    throw new ApiClientError(res.status, message, data);
  }
  return data as T;
}

export interface CreateDomainInput {
  fqdn: string;
  type?: 'primary' | 'addon' | 'subdomain' | 'alias';
  phpVersion?: string | null;
  httpsMode?: 'off' | 'redirect' | 'only';
}

export const Api = {
  me: () => api<MeResponse>('/api/v1/auth/me'),
  login: (email: string, password: string) =>
    api<MeResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  logout: () => api<{ ok: boolean }>('/api/v1/auth/logout', { method: 'POST' }),
  subscriptions: () => api<SubscriptionDto[]>('/api/v1/subscriptions'),
  domains: (subId: string) => api<DomainDto[]>(`/api/v1/subscriptions/${subId}/domains`),
  createDomain: (subId: string, input: CreateDomainInput) =>
    api<DomainDto>(`/api/v1/subscriptions/${subId}/domains`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),
};

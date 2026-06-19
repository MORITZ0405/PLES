import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Api, ApiClientError } from '../api';
import { Button, Field, Input } from '../ui';

export default function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState('admin@lest.local');
  const [password, setPassword] = useState('');

  const mutation = useMutation({
    mutationFn: () => Api.login(email, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['me'] }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    mutation.mutate();
  };

  let error: string | null = null;
  if (mutation.isError) {
    const err = mutation.error;
    if (err instanceof ApiClientError) {
      error = err.status === 401 ? 'E-Mail oder Passwort ist falsch.' : `Fehler ${err.status}: ${err.message}`;
    } else {
      error = `Login fehlgeschlagen — Server nicht erreichbar? (${
        err instanceof Error ? err.message : 'unbekannter Fehler'
      })`;
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-100 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-2xl font-bold text-white">
            L
          </div>
          <h1 className="text-lg font-semibold text-ink-800">Bei LEST anmelden</h1>
          <p className="text-sm text-ink-500">Server Control Panel</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-4 rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
        >
          <Field label="E-Mail">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Passwort">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? 'Anmelden…' : 'Anmelden'}
          </Button>
        </form>

        <p className="mt-4 text-center text-xs text-ink-400">
          LEST — Lightweight Easy Server Toolkit
        </p>
      </div>
    </div>
  );
}

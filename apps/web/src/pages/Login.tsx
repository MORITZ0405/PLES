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

  const error =
    mutation.error instanceof ApiClientError
      ? mutation.error.status === 401
        ? 'Invalid email or password.'
        : mutation.error.message
      : null;

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-5">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-500 text-2xl font-black text-slate-950">
            L
          </div>
          <h1 className="text-xl font-semibold text-slate-100">LEST</h1>
          <p className="text-sm text-slate-400">Lightweight Easy Server Toolkit</p>
        </div>

        <div className="space-y-4 rounded-xl border border-slate-800 bg-slate-900/60 p-6">
          <Field label="Email">
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </Field>
          <Field label="Password">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={mutation.isPending} className="w-full">
            {mutation.isPending ? 'Signing in…' : 'Sign in'}
          </Button>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Card, Notice } from '@/components/ui';

export function LoginForm({ next, initialError }: { next: string; initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError ?? '');
  const [message, setMessage] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');

    const supabase = createClient();
    const result =
      mode === 'signin'
        ? await supabase.auth.signInWithPassword({ email, password })
        : await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
          });

    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }

    if (mode === 'signup' && !result.data.session) {
      setMessage('Check your inbox to confirm the address, then sign in.');
      setBusy(false);
      return;
    }

    router.push(next);
    router.refresh();
  }

  return (
    <Card>
      <form onSubmit={submit} className="grid gap-3">
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input
            id="email"
            className="field"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="password">Password</label>
          <input
            id="password"
            className="field"
            type="password"
            autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <Notice tone="fail">{error}</Notice>}
        {message && <Notice tone="ok">{message}</Notice>}

        <button className="btn btn-primary mt-1" type="submit" disabled={busy}>
          {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
        </button>

        <button
          type="button"
          className="text-xs underline"
          style={{ color: 'var(--text-soft)' }}
          onClick={() => {
            setMode(mode === 'signin' ? 'signup' : 'signin');
            setError('');
            setMessage('');
          }}
        >
          {mode === 'signin' ? 'Create an account' : 'I already have an account'}
        </button>

        <p className="mt-1 text-xs" style={{ color: 'var(--text-soft)' }}>
          A new account can see nothing until an administrator approves it and
          gives it a role. If you are expecting access and do not have it, ask
          the store custodian.
        </p>
      </form>
    </Card>
  );
}

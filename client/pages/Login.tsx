import { useState, type FormEvent } from 'react';
import { Layers3, LoaderCircle, LogIn } from 'lucide-react';
import { loginSchema, type Session } from '../../shared/schema';
import { api } from '../api';
import { Field } from '../components/ui';

export default function Login({
  onSignedIn,
  pendingCount,
}: {
  onSignedIn: () => void;
  pendingCount: number;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = loginSchema.safeParse({ password });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    setError('');
    try {
      await api<Session>('/auth/login', { method: 'POST', body: JSON.stringify(parsed.data) });
      onSignedIn();
    } catch (failure) {
      setError((failure as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <form className="panel login-panel" onSubmit={submit} noValidate>
        <span className="brand-mark">
          <Layers3 size={22} />
        </span>
        <div>
          <h1>Sign in</h1>
          <p className="section-description">Quality Inspection Tracker</p>
        </div>
        <Field id="password" label="Password" required error={error}>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError('');
            }}
            aria-invalid={!!error}
            aria-describedby={error ? 'password-error' : undefined}
          />
        </Field>
        <button className="button primary" type="submit" disabled={busy}>
          {busy ? <LoaderCircle size={18} className="spin" /> : <LogIn size={18} />}
          Sign in
        </button>
        {pendingCount > 0 && (
          <p className="login-note">
            {pendingCount} {pendingCount === 1 ? 'inspection' : 'inspections'} saved offline will
            sync once you're signed in.
          </p>
        )}
      </form>
    </main>
  );
}

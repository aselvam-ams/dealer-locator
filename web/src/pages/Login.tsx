import { useState } from 'react';
import { useAuth } from '../auth';

const DEMO = [
  ['admin@ams.local', 'Admin'],
  ['power@ams.local', 'AMS Power User'],
  ['consultant@ams.local', 'Consultant (NAC)'],
  ['provider@nationwide.local', 'Service Provider'],
  ['oem@mazda.local', 'OEM Office (Mazda)'],
  ['dealer@mazda.local', 'Dealer (Mazda Chatswood)'],
  ['dealer.locked@mazda.local', 'Dealer (OEM-locked)'],
];

export function Login({ embedded }: { embedded?: boolean }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('consultant@ams.local');
  const [password, setPassword] = useState('password123');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <div className="card">
        <h2 style={{ marginTop: 0 }}>Dealer Locator 2025</h2>
        {embedded && <p className="muted">Salesforce embed — please authenticate.</p>}
        <form onSubmit={submit}>
          <label>Email</label>
          <input value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          <label style={{ marginTop: '0.6rem' }}>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && <p className="error" style={{ marginTop: '0.7rem' }}>{error}</p>}
          <button style={{ marginTop: '0.9rem', width: '100%' }} disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="demo-accounts">
          <strong>Demo accounts</strong> (password <code>password123</code>):
          {DEMO.map(([e, label]) => (
            <div key={e}>
              <code onClick={() => setEmail(e)}>{e}</code> — {label}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

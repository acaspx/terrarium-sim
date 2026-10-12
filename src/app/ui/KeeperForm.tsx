import { useState, type FormEvent } from 'react';
import { Check, Copy } from 'lucide-react';
import { claimName, signIn, type Identity } from '../playground.js';

/**
 * Claim a username, or sign in with one you already have. There is no email or
 * password: the recovery code shown after claiming is the account, so the form
 * does not move on until the keeper says they have saved it.
 */
export function KeeperForm({ onDone, intro }: { onDone?: (me: Identity) => void; intro?: string }) {
  const [mode, setMode] = useState<'claim' | 'signin'>('claim');
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Identity | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'claim') setFresh(await claimName(name));
      else onDone?.(await signIn(name, code));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (fresh) return <RecoveryCode me={fresh} onSaved={() => onDone?.(fresh)} />;

  return (
    <form className="keeper-form" onSubmit={submit}>
      {intro && <p className="hint">{intro}</p>}
      <label className="field">
        <span className="field-label">Username</span>
        <input
          className="small-input" value={name} maxLength={20} autoComplete="username" spellCheck={false} autoCapitalize="none"
          onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
          placeholder="fern_keeper" aria-describedby="name-rules" required minLength={3}
        />
        <span id="name-rules" className="hint">3 to 20 lowercase letters, numbers, hyphens or underscores.</span>
      </label>
      {mode === 'signin' && (
        <label className="field">
          <span className="field-label">Recovery code</span>
          <input className="small-input code-input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
            autoComplete="off" spellCheck={false} autoCapitalize="characters" required />
        </label>
      )}
      {error && <p className="issue issue-critical" role="alert">{error}</p>}
      <div className="share-row">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'One moment…' : mode === 'claim' ? 'Claim this name' : 'Sign in'}
        </button>
        <button type="button" className="button quiet" onClick={() => { setMode(mode === 'claim' ? 'signin' : 'claim'); setError(null); }}>
          {mode === 'claim' ? 'I already have a username' : 'Pick a new username instead'}
        </button>
      </div>
    </form>
  );
}

function RecoveryCode({ me, onSaved }: { me: Identity; onSaved: () => void }) {
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${me.name} ${me.key}`);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="keeper-form" role="status">
      <p><strong>@{me.name} is yours.</strong> This is your recovery code:</p>
      <p className="recovery-code">{me.key}</p>
      <p className="hint">
        It is the only way to sign in on another phone or browser, or after clearing this one. We cannot show it again or reset it, so
        keep it somewhere safe, like a password manager or a note.
      </p>
      <div className="share-row">
        <button type="button" className="button" onClick={copy}>
          {copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />} {copied ? 'Copied' : 'Copy name and code'}
        </button>
      </div>
      <label className="saved-check">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I have saved my recovery code
      </label>
      <div className="share-row">
        <button type="button" className="button primary" disabled={!saved} onClick={onSaved}>Continue</button>
      </div>
    </div>
  );
}

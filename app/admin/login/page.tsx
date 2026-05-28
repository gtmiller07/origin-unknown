'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin/queue` },
    });
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <div style={{ maxWidth: '400px', margin: '8rem auto', padding: '0 1.5rem' }}>
      <h1 style={{ fontFamily: 'var(--font-serif)', fontWeight: 300, fontStyle: 'italic', fontSize: '1.75rem', marginBottom: '2rem' }}>
        Curator access
      </h1>
      {sent ? (
        <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.85rem', color: '#737373' }}>
          Check your email. A sign-in link is waiting.
        </p>
      ) : (
        <form onSubmit={handleSubmit}>
          <label style={{ fontFamily: 'var(--font-mono)', fontSize: '0.75rem', color: '#737373', display: 'block', marginBottom: '0.5rem' }}>
            Email
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{
              display: 'block',
              width: '100%',
              border: 'none',
              borderBottom: '1px solid #737373',
              background: 'transparent',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.9rem',
              padding: '0.5rem 0',
              outline: 'none',
              marginBottom: '2rem',
              boxSizing: 'border-box',
            }}
            onFocus={(e) => (e.target.style.borderBottomWidth = '2px')}
            onBlur={(e) => (e.target.style.borderBottomWidth = '1px')}
          />
          {error && (
            <p style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8rem', color: '#B85C3B', marginBottom: '1rem' }}>
              {error}
            </p>
          )}
          <button
            type="submit"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--font-serif)',
              fontStyle: 'italic',
              fontSize: '1rem',
              color: '#171717',
              textDecoration: 'underline',
              textDecorationThickness: '1px',
              textUnderlineOffset: '3px',
              padding: 0,
            }}
          >
            Send sign-in link
          </button>
        </form>
      )}
    </div>
  );
}

import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestPasswordReset } from '../api/authRecovery';

// Shared by admin and staff logins. The user enters their email; the backend
// finds the matching account(s) and emails the reset link. The on-screen
// message never reveals whether the email is in the system.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await requestPasswordReset(email.trim());
      setDone(true);
    } catch {
      // Same generic message as a successful request — the backend never
      // reveals whether the email exists, and neither does this page.
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-[320px] space-y-4">
        <h1 className="text-xl font-montserrat font-bold text-[#031634] text-center">
          Forgot password
        </h1>

        {done ? (
          <p className="text-sm text-gray-600 text-center">
            If an account exists for that email, a reset link was sent to it. Check your inbox.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">Email</label>
              <input
                type="email"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                autoFocus
                required
              />
            </div>

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-md bg-[#031634] text-white text-sm font-montserrat disabled:opacity-60"
            >
              {submitting ? 'Sending...' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-center text-xs text-gray-400">
          <Link to="/staff/login" className="underline">
            Staff login
          </Link>
          {' · '}
          <Link to="/admin/login" className="underline">
            Admin login
          </Link>
        </p>
      </div>
    </div>
  );
}

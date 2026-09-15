import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { resetPasswordWithToken } from '../api/authRecovery';

// Reached from the link in the "forgot your password" email
// (?token=...). Shared by admin and staff — we don't know which role the
// token belongs to, so on success this just points to both logins.
export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await resetPasswordWithToken(token, newPassword);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'This reset link is invalid or has expired.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-[320px] text-center space-y-3">
          <h1 className="text-xl font-montserrat font-bold text-[#031634]">Reset password</h1>
          <p className="text-sm text-gray-600">
            This link is missing its token. Ask for a new one from the{' '}
            <Link to="/forgot-password" className="underline">
              forgot password
            </Link>{' '}
            page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="bg-white p-8 rounded-xl shadow-md w-full max-w-[320px] space-y-4">
        <h1 className="text-xl font-montserrat font-bold text-[#031634] text-center">
          Set a new password
        </h1>

        {done ? (
          <div className="space-y-3 text-center">
            <p className="text-sm text-gray-600">Your password was updated.</p>
            <p className="text-xs text-gray-400">
              <Link to="/staff/login" className="underline">
                Staff login
              </Link>
              {' · '}
              <Link to="/admin/login" className="underline">
                Admin login
              </Link>
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm mb-1">New password</label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm mb-1">Confirm new password</label>
              <input
                type="password"
                className="w-full border rounded-md px-3 py-2 text-sm"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>

            {error && <p className="text-xs text-red-500 text-center">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2 rounded-md bg-[#031634] text-white text-sm font-montserrat disabled:opacity-60"
            >
              {submitting ? 'Saving...' : 'Set new password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

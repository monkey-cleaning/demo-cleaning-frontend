import { useEffect, useState } from 'react';
import { X, Pencil } from 'lucide-react';

export interface AccountProfile {
  username: string;
  email: string;
}

export interface AccountUpdate {
  currentPassword: string;
  username?: string;
  email?: string;
  newPassword?: string;
}

type Variant = 'admin' | 'staff';

// Shared body for the "My account" modal (admin + staff). Shows the current
// username / email / password as read-only rows, each with a pencil to make
// that one field editable. Any pending edit reveals the "current password"
// field (required to save).
export default function AccountModalContent({
  variant,
  loadProfile,
  saveProfile,
  onClose,
  onUsernameChanged,
}: {
  variant: Variant;
  loadProfile: () => Promise<AccountProfile>;
  saveProfile: (body: AccountUpdate) => Promise<{ usernameChanged: boolean }>;
  onClose: () => void;
  onUsernameChanged: () => void;
}) {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);

  const [editUsername, setEditUsername] = useState(false);
  const [editEmail, setEditEmail] = useState(false);
  const [editPassword, setEditPassword] = useState(false);

  const [draftUsername, setDraftUsername] = useState('');
  const [draftEmail, setDraftEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<null | { usernameChanged: boolean }>(null);

  useEffect(() => {
    let cancelled = false;
    loadProfile()
      .then((p) => {
        if (cancelled) return;
        setProfile(p);
        setDraftUsername(p.username);
        setDraftEmail(p.email);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : 'Could not load your account details.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [loadProfile]);

  const hasPendingEdit = editUsername || editEmail || editPassword;
  // text-[#031634] explícito en los inputs: este componente puede montarse
  // dentro de un contenedor `text-white` (AdminNavbar), y sin color propio
  // el texto tipeado sale blanco sobre blanco.
  const input =
    variant === 'admin'
      ? 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-[#031634]'
      : 'w-full border rounded-md px-2 py-1.5 text-sm text-[#031634]';
  const lbl = 'text-xs font-semibold text-gray-500';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editPassword) {
      if (newPassword.length < 6) return setError('New password must be at least 6 characters.');
      if (newPassword !== confirmPassword) return setError('Passwords do not match.');
    }
    if (!currentPassword) return setError('Enter your current password to save changes.');

    setError(null);
    setSubmitting(true);
    try {
      const body: AccountUpdate = { currentPassword };
      if (editUsername) body.username = draftUsername.trim();
      if (editEmail) body.email = draftEmail.trim();
      if (editPassword) body.newPassword = newPassword;
      const { usernameChanged } = await saveProfile(body);
      setDone({ usernameChanged });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save your changes.');
    } finally {
      setSubmitting(false);
    }
  };

  const pencil = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="p-1 rounded-md text-gray-400 hover:text-[#031634] hover:bg-gray-100"
      aria-label="Edit"
    >
      <Pencil size={13} />
    </button>
  );

  return (
    <>
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <h2 className="font-bold text-[#031634] text-base font-montserrat">My account</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400">
          <X size={16} />
        </button>
      </div>

      <div className="px-6 py-5">
        {loading ? (
          <p className="text-sm text-gray-400 py-2 text-center">Loading...</p>
        ) : loadError ? (
          <div className="py-2 text-center space-y-2">
            <p className="text-sm text-red-500">{loadError}</p>
            {variant === 'admin' && (
              <p className="text-xs text-gray-400">
                If you logged in without a username, sign in again with your username
                (e.g. <span className="font-mono">jhony</span>) to manage your profile.
              </p>
            )}
          </div>
        ) : done ? (
          <div className="text-center py-2">
            <p className="text-sm text-gray-700">
              {done.usernameChanged
                ? 'Saved. Because your username changed, please log in again.'
                : 'Your account was updated.'}
            </p>
            <button
              onClick={done.usernameChanged ? onUsernameChanged : onClose}
              className="mt-4 w-full py-2 rounded-lg bg-[#031634] text-white text-sm"
            >
              {done.usernameChanged ? 'Go to login' : 'Close'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-3">
            {error && <p className="text-xs text-red-500">{error}</p>}

            {/* Username */}
            <div>
              <span className={lbl}>Username</span>
              {editUsername ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    className={input}
                    value={draftUsername}
                    onChange={(e) => setDraftUsername(e.target.value)}
                    autoComplete="username"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditUsername(false);
                      setDraftUsername(profile!.username);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm text-gray-800">{profile?.username}</span>
                  {pencil(() => setEditUsername(true))}
                </div>
              )}
            </div>

            {/* Recovery email */}
            <div>
              <span className={lbl}>Recovery email</span>
              {editEmail ? (
                <div className="flex items-center gap-2 mt-1">
                  <input
                    className={input}
                    type="email"
                    value={draftEmail}
                    onChange={(e) => setDraftEmail(e.target.value)}
                    autoComplete="email"
                    autoFocus
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditEmail(false);
                      setDraftEmail(profile!.email);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm text-gray-800 break-all">{profile?.email || '—'}</span>
                  {pencil(() => setEditEmail(true))}
                </div>
              )}
            </div>

            {/* Password */}
            <div>
              <span className={lbl}>Password</span>
              {editPassword ? (
                <div className="space-y-2 mt-1">
                  <input
                    className={input}
                    type="password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoComplete="new-password"
                    autoFocus
                  />
                  <input
                    className={input}
                    type="password"
                    placeholder="Confirm new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setEditPassword(false);
                      setNewPassword('');
                      setConfirmPassword('');
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between mt-0.5">
                  <span className="text-sm text-gray-800">••••••••</span>
                  {pencil(() => setEditPassword(true))}
                </div>
              )}
            </div>

            {hasPendingEdit && (
              <div className="border-t border-gray-100 pt-3 space-y-3">
                <div>
                  <span className={lbl}>Current password</span>
                  <input
                    className={`${input} mt-1`}
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    autoComplete="current-password"
                    placeholder="Required to save"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full py-2 rounded-lg bg-[#031634] text-white text-sm font-medium disabled:opacity-60"
                >
                  {submitting ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </>
  );
}

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { API_BASE_URL } from '../api/client';
import { STAFF_TOKEN_KEY } from '../api/staffClient';
import '../styles/staff-a11y.css';

// LAB423 — calco de AdminLoginPage.tsx pero contra /api/staff/auth/login,
// guardando el token bajo STAFF_TOKEN_KEY (no admin_blog_token), y en inglés
// (a pedido — la vista de cleaners es English-only). "staff-scope" acá
// también (a diferencia de AdminLoginPage, que no lo usa) — los inputs del
// login se benefician igual del focus ring de staff-a11y.css.
export default function StaffLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/staff/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      if (!res.ok) throw new Error('Login failed');

      const data = await res.json();
      localStorage.setItem(STAFF_TOKEN_KEY, data.token);
      navigate('/staff'); // LAB425 — home nueva; el calendario (LAB423) ahora es secundario
    } catch {
      setError('Incorrect username or password');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="staff-scope min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-md w-full max-w-[320px] space-y-4"
      >
        <h1 className="text-xl font-montserrat font-bold text-[#031634] text-center">
          My Calendar
        </h1>

        <div>
          <label className="block text-sm mb-1">Username</label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Password</label>
          <input
            type="password"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </div>

        {error && <p className="text-xs text-red-500 text-center">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 rounded-md bg-[#031634] text-white text-sm font-montserrat disabled:opacity-60"
        >
          {loading ? 'Signing in...' : 'Sign in'}
        </button>

        <p className="text-center text-xs">
          <Link to="/forgot-password" className="text-gray-400 underline">
            Forgot your password?
          </Link>
        </p>
      </form>
    </div>
  );
}

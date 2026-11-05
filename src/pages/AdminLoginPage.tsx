import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { API_BASE_URL } from '../api/client';
import { STAFF_TOKEN_KEY } from '../api/staffClient';

export default function AdminLoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  // LAB483 — sesión larga opcional.
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          username ? { username, password, rememberMe } : { password, rememberMe }
        ),
      });

      if (!res.ok) throw new Error('Login failed');

      const data = await res.json();
      // Cross-login: si son credenciales de un cleaner, el backend las acepta
      // acá y devuelve role:'cleaner'; el token va bajo la key de staff y se
      // lo manda a /staff. Espejo en StaffLoginPage.tsx.
      if (data.role === 'cleaner') {
        localStorage.setItem(STAFF_TOKEN_KEY, data.token);
        navigate('/staff');
        return;
      }
      localStorage.setItem('admin_blog_token', data.token);
      navigate('/admin/');
    } catch (err) {
      // Un fetch que ni sale tira TypeError: es falta de conexión, no una
      // contraseña mal puesta.
      setError(
        err instanceof TypeError || navigator.onLine === false
          ? "You're offline. Connect to the internet to sign in."
          : 'Incorrect username or password'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <form
        onSubmit={handleSubmit}
        className="bg-white p-8 rounded-xl shadow-md w-[320px] space-y-4"
      >
        <h1 className="text-xl font-montserrat font-bold text-[#031634] text-center">
          Admin Login
        </h1>

        <div>
          <label className="block text-sm mb-1">Username</label>
          <input
            type="text"
            className="w-full border rounded-md px-3 py-2 text-sm"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="jhony, clara..."
            autoComplete="username"
          />
        </div>

        <div>
          <label className="block text-sm mb-1">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              className="w-full border rounded-md px-3 py-2 pr-10 text-sm"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-gray-400 hover:text-[#031634] transition-colors"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Keep me signed in
            <span className="block text-gray-400">
              Otherwise the session lasts 7 days in this browser.
            </span>
          </span>
        </label>

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

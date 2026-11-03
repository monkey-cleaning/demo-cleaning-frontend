import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, isAuthError } from '../../api/client';
import '../../styles/admin-a11y.css';

type Props = {
  children: React.ReactNode;
};

export default function RequireAdmin({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const check = async () => {
      try {
        await api('/api/admin/auth/me', {}, 8000);
        setOk(true);
      } catch (e) {
        // Un backend dormido o sin red NO es una sesión vencida: el token
        // guardado sigue valiendo, así que se mantiene la sesión. Solo un
        // 401/403 del servidor cierra la sesión (y limpia el token).
        if (localStorage.getItem('admin_blog_token') && !isAuthError(e)) {
          setOk(true);
        } else {
          localStorage.removeItem('admin_blog_token');
          setOk(false);
          navigate('/admin/login', { state: { from: location.pathname } });
        }
      } finally {
        setChecking(false);
      }
    };

    check();
  }, [navigate, location.pathname]);

  if (checking) {
    return (
      <div className="admin-scope min-h-screen flex items-center justify-center text-gray-500">
        Checking access...
      </div>
    );
  }

  if (!ok) return null;

  return <div className="admin-scope">{children}</div>;
}
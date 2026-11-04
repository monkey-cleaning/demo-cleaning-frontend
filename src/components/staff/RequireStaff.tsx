import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { staffApi, isAuthError, STAFF_TOKEN_KEY } from '../../api/staffClient';
import { startStaffOffline } from '../../offline/register';
import OfflineBanner from './OfflineBanner';
import '../../styles/staff-a11y.css';

// LAB423 — calco de components/admin/RequireAdmin.tsx pero validando la
// sesión de cleaner contra /api/staff/auth/me. El wrapper "staff-scope" abajo
// es lo que activa staff-a11y.css (mismo mecanismo que "admin-scope" +
// admin-a11y.css en RequireAdmin.tsx).
type Props = {
  children: React.ReactNode;
};

export default function RequireStaff({ children }: Props) {
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const check = async () => {
      try {
        await staffApi('/api/staff/auth/me', {}, 6000);
        setOk(true);
        startStaffOffline();
      } catch (e) {
        // LAB463 — sin conexión (o backend caído) la sesión se mantiene: el token
        // guardado sigue valiendo y se muestran los datos guardados. Solo un 401
        // del servidor cierra la sesión.
        if (localStorage.getItem(STAFF_TOKEN_KEY) && !isAuthError(e)) {
          setOk(true);
          startStaffOffline();
        } else {
          setOk(false);
          navigate('/staff/login', { state: { from: location.pathname } });
        }
      } finally {
        setChecking(false);
      }
    };

    check();
  }, [navigate, location.pathname]);

  if (checking) {
    return (
      <div className="staff-scope min-h-screen flex items-center justify-center text-gray-500">
        Checking access...
      </div>
    );
  }

  if (!ok) return null;

  return (
    <div className="staff-scope staff-safe-area">
      <OfflineBanner />
      {children}
    </div>
  );
}

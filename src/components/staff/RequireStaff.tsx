import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { staffApi } from '../../api/staffClient';
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
        await staffApi('/api/staff/auth/me');
        setOk(true);
      } catch {
        setOk(false);
        navigate('/staff/login', { state: { from: location.pathname } });
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

  return <div className="staff-scope">{children}</div>;
}

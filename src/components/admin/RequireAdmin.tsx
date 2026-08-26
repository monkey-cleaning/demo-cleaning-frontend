import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../../api/client';
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
        await api('/api/admin/auth/me');
        setOk(true);
      } catch {
        setOk(false);
        navigate('/admin/login', { state: { from: location.pathname } });
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
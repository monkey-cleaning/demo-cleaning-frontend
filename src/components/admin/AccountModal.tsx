import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getAdminProfile, updateAdminProfile } from '../../api/adminAuth';
import AccountModalContent from '../account/AccountModalContent';

export default function AccountModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const onUsernameChanged = useCallback(() => {
    localStorage.removeItem('admin_blog_token');
    navigate('/admin/login');
  }, [navigate]);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm p-0 sm:p-4"
      onMouseDown={onClose}
    >
      <div
        // text-[#031634] explícito: este modal se renderiza DENTRO de
        // AdminNavbar, cuyo div raíz es `text-white` — sin esto, el texto que
        // se escribe en los inputs (y los puntos del password) sale blanco
        // sobre blanco e invisible.
        className="bg-white text-[#031634] rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <AccountModalContent
          variant="admin"
          loadProfile={getAdminProfile}
          saveProfile={updateAdminProfile}
          onClose={onClose}
          onUsernameChanged={onUsernameChanged}
        />
      </div>
    </div>
  );
}

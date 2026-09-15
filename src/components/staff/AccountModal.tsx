import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { getStaffProfile, updateStaffProfile } from '../../api/staffAuth';
import { STAFF_TOKEN_KEY } from '../../api/staffClient';
import AccountModalContent from '../account/AccountModalContent';

export default function AccountModal({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();

  const onUsernameChanged = useCallback(() => {
    localStorage.removeItem(STAFF_TOKEN_KEY);
    navigate('/staff/login');
  }, [navigate]);

  return (
    <div
      className="fixed inset-0 z-[80] bg-black/40 flex items-center justify-center px-4"
      onMouseDown={onClose}
    >
      <div
        className="bg-white text-[#031634] rounded-2xl shadow-xl w-full max-w-sm flex flex-col"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <AccountModalContent
          variant="staff"
          loadProfile={getStaffProfile}
          saveProfile={updateStaffProfile}
          onClose={onClose}
          onUsernameChanged={onUsernameChanged}
        />
      </div>
    </div>
  );
}

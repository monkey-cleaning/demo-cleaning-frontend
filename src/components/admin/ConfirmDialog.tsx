/**
 * Small in-UI replacement for window.confirm() — a centered modal with a
 * message and Cancel/Confirm buttons, styled to match the rest of the admin.
 */

import { AlertTriangle } from 'lucide-react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-sm shadow-2xl p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          {danger && (
            <div className="flex-shrink-0 w-9 h-9 rounded-full bg-red-50 text-red-500 flex items-center justify-center">
              <AlertTriangle size={18} />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-bold text-navy text-sm sm:text-base">{title}</h2>
            <p className="text-sm text-gray-500 mt-1">{message}</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end mt-5">
          <button
            onClick={onCancel}
            disabled={loading}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 transition-colors ${
              danger ? 'bg-red-500 text-white hover:bg-red-600' : 'bg-navy text-white hover:bg-navy/90'
            }`}
          >
            {loading ? 'Please wait...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

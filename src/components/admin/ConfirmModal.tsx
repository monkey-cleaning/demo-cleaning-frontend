import { useEffect, useRef } from 'react';

type Props = {
  title: string;
  body: string;
  cancelLabel: string;
  confirmLabel: string;
  /** When true, confirm uses the red destructive style used elsewhere in admin. */
  destructive?: boolean;
  confirming?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Minimal admin confirm dialog — shell matches AccountModal / calendar overlays
 * (fixed inset, black/40 + blur, white rounded-2xl card).
 */
export default function ConfirmModal({
  title,
  body,
  cancelLabel,
  confirmLabel,
  destructive = false,
  confirming = false,
  onCancel,
  onConfirm,
}: Props) {
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    cancelRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && !confirming) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel, confirming]);

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onMouseDown={() => {
        if (!confirming) onCancel();
      }}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-confirm-title"
        aria-describedby="admin-confirm-body"
        className="bg-white text-[#031634] rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-4"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h3 id="admin-confirm-title" className="text-sm font-semibold text-[#031634]">
          {title}
        </h3>
        <p id="admin-confirm-body" className="text-sm text-gray-500 leading-relaxed">
          {body}
        </p>
        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            ref={cancelRef}
            type="button"
            disabled={confirming}
            onClick={onCancel}
            className="px-3.5 py-2 text-xs font-semibold border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={onConfirm}
            className={
              destructive
                ? 'px-3.5 py-2 text-xs font-semibold rounded-lg bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
                : 'px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#031634] text-white hover:bg-[#031634]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

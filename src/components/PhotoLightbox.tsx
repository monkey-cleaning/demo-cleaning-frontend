import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Loader2, X } from 'lucide-react';

// LAB457 — visor de fotos del checklist. Se monta con createPortal en <body>,
// así que frena mousedown para no disparar el "click afuera" del popover del
// evento (que lo desmontaría junto con el visor).
export default function PhotoLightbox({
  url,
  onClose,
  onDelete,
}: {
  url: string;
  onClose: () => void;
  onDelete?: () => Promise<void>;
}) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleDelete() {
    if (!onDelete) return;
    setDeleting(true);
    try {
      await onDelete();
    } finally {
      setDeleting(false);
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-black/85 p-4"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={onClose}
    >
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 p-2 rounded-full bg-white/15 text-white hover:bg-white/25"
      >
        <X size={20} />
      </button>

      <img
        src={url}
        alt=""
        className="max-w-full max-h-[75vh] rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />

      {onDelete && (
        <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="px-4 py-2 text-sm rounded-lg bg-white/15 text-white hover:bg-white/25"
            >
              Delete photo
            </button>
          ) : (
            <>
              <span className="text-sm text-white">Delete this photo?</span>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-red-600 text-white disabled:opacity-60 flex items-center gap-1.5"
              >
                {deleting && <Loader2 size={13} className="animate-spin" />}
                Yes, delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                disabled={deleting}
                className="px-4 py-2 text-sm rounded-lg bg-white/15 text-white hover:bg-white/25"
              >
                Cancel
              </button>
            </>
          )}
        </div>
      )}
    </div>,
    document.body
  );
}

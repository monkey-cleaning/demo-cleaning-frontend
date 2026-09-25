import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ChevronDown,
  ExternalLink,
  Eye,
  Monitor,
  RefreshCw,
  Smartphone,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { resetSiteImage, uploadSiteImage } from '../../api/siteImages';
import {
  SITE_IMAGE_GROUPS,
  SITE_IMAGE_SLOTS,
  type SiteImageKey,
} from '../../config/siteImages';
import { useSiteImages } from '../../context/SiteImagesContext';

// LAB447 — sube/restaura las fotos de la landing pública. Los cambios se
// publican al instante: "Preview" abre la página real con la foto nueva.

const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'];
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024; // mismo tope que el backend
const MAX_DIMENSION = 2400;

/** Achica fotos grandes (celular/cámara) antes de subirlas; si falla, sube el original. */
async function prepareImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 2 * 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Modal con la página pública real en un iframe (mismo origen: lee las imágenes ya subidas). */
function PagePreviewModal({
  title,
  path,
  onClose,
}: {
  title: string;
  path: string;
  onClose: () => void;
}) {
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const deviceButton = (id: 'desktop' | 'mobile', Icon: typeof Monitor, label: string) => (
    <button
      type="button"
      onClick={() => setDevice(id)}
      className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
        device === id ? 'bg-[#031634] text-white' : 'text-gray-600 hover:bg-gray-100'
      }`}
    >
      <Icon size={13} /> {label}
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={`Preview: ${title}`}
        className="flex flex-col w-full max-w-[1400px] h-full max-h-[92vh] bg-white rounded-2xl shadow-xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-[#031634] truncate">Preview — {title}</h3>
          <div className="flex items-center gap-1 ml-2">
            {deviceButton('desktop', Monitor, 'Desktop')}
            {deviceButton('mobile', Smartphone, 'Mobile')}
          </div>
          <div className="flex items-center gap-1 ml-auto">
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
              title="Reload preview"
            >
              <RefreshCw size={14} />
            </button>
            <a
              href={path}
              target="_blank"
              rel="noreferrer"
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
              title="Open in new tab"
            >
              <ExternalLink size={14} />
            </a>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-gray-500 hover:bg-gray-100 rounded-md"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div className="flex-1 min-h-0 bg-gray-100 flex justify-center overflow-hidden sm:p-3">
          <iframe
            key={reloadKey}
            src={path}
            title={`Preview of ${title}`}
            className={`h-full bg-white border-0 sm:rounded-lg shadow-sm ${
              device === 'mobile' ? 'w-[390px] max-w-full' : 'w-full'
            }`}
          />
        </div>
      </div>
    </div>
  );
}

export default function SiteImagesSettingsSection() {
  const [preview, setPreview] = useState<{ title: string; path: string } | null>(null);
  const { img, overrides, setOverrides } = useSiteImages();
  const [openGroup, setOpenGroup] = useState<string | null>('home');
  const [busySlot, setBusySlot] = useState<string | null>(null);
  const [error, setError] = useState<{ slot: string; message: string } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingSlot = useRef<SiteImageKey | null>(null);

  function pickFile(slot: SiteImageKey) {
    pendingSlot.current = slot;
    inputRef.current?.click();
  }

  async function handleFile(file: File | undefined) {
    const slot = pendingSlot.current;
    if (inputRef.current) inputRef.current.value = '';
    if (!file || !slot) return;

    setError(null);
    if (!ACCEPTED.includes(file.type)) {
      setError({ slot, message: 'Use a JPG, PNG, WebP or AVIF image.' });
      return;
    }
    setBusySlot(slot);
    try {
      const blob = await prepareImage(file);
      if (blob.size > MAX_UPLOAD_BYTES) {
        setError({ slot, message: 'Image is too large (max 8 MB).' });
        return;
      }
      setOverrides(await uploadSiteImage(slot, blob));
    } catch {
      setError({ slot, message: 'Could not upload the image. Try again.' });
    } finally {
      setBusySlot(null);
    }
  }

  async function handleReset(slot: SiteImageKey) {
    setError(null);
    setBusySlot(slot);
    try {
      setOverrides(await resetSiteImage(slot));
    } catch {
      setError({ slot, message: 'Could not restore the default image.' });
    } finally {
      setBusySlot(null);
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
        <h2 className="text-sm font-semibold text-[#031634]">Landing page images</h2>
        <p className="mt-0.5 text-xs text-gray-400">
          Replace the photos of the public site. Changes go live immediately — use
          “Preview” to see how each page looks with your images. JPG, PNG, WebP or
          AVIF, up to 8 MB (large photos are resized automatically).
        </p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(',')}
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0])}
      />

      <div className="divide-y divide-gray-100">
        {SITE_IMAGE_GROUPS.map((group) => {
          const slots = SITE_IMAGE_SLOTS.filter((s) => s.group === group.id);
          const customCount = slots.filter((s) => overrides[s.key]).length;
          const open = openGroup === group.id;
          return (
            <div key={group.id}>
              <div className="flex items-center gap-3 px-6 py-3">
                <button
                  type="button"
                  onClick={() => setOpenGroup(open ? null : group.id)}
                  className="flex flex-1 items-center gap-2 text-left min-w-0"
                  aria-expanded={open}
                >
                  <ChevronDown
                    size={14}
                    className={`flex-shrink-0 text-gray-400 transition-transform ${open ? '' : '-rotate-90'}`}
                  />
                  <span className="text-sm font-medium text-[#031634]">{group.label}</span>
                  <span className="text-xs text-gray-400">
                    {slots.length} {slots.length === 1 ? 'image' : 'images'}
                    {customCount > 0 && ` · ${customCount} custom`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setPreview({ title: group.label, path: group.path })}
                  className="flex items-center gap-1 text-xs font-medium text-[#031634] hover:underline flex-shrink-0"
                >
                  <Eye size={13} /> Preview
                </button>
              </div>

              {open && (
                <ul className="px-6 pb-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {slots.map((slot) => {
                    const custom = !!overrides[slot.key];
                    const busy = busySlot === slot.key;
                    return (
                      <li
                        key={slot.key}
                        className="flex gap-3 p-3 rounded-xl border border-gray-100"
                      >
                        <img
                          src={img(slot.key)}
                          alt=""
                          loading="lazy"
                          className="w-24 h-16 flex-shrink-0 rounded-lg object-cover bg-gray-100"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium text-[#031634] leading-snug">
                            {slot.label}
                          </p>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {custom ? 'Custom image' : 'Default image'}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => pickFile(slot.key)}
                              disabled={busy}
                              className="flex items-center gap-1 px-2.5 py-1 whitespace-nowrap border border-transparent bg-[#031634] text-white text-[11px] font-semibold rounded-md hover:bg-[#031634]/90 disabled:opacity-50 transition-colors"
                            >
                              {busy ? (
                                <RefreshCw size={11} className="animate-spin" />
                              ) : (
                                <Upload size={11} />
                              )}
                              {custom ? 'Replace' : 'Upload'}
                            </button>
                            {custom && (
                              <button
                                type="button"
                                onClick={() => void handleReset(slot.key)}
                                disabled={busy}
                                title="Restore the default image"
                                className="flex items-center gap-1 px-2.5 py-1 whitespace-nowrap text-[11px] font-semibold text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50 transition-colors"
                              >
                                <Undo2 size={11} />
                                Reset
                              </button>
                            )}
                          </div>
                          {error?.slot === slot.key && (
                            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-red-600">
                              <AlertCircle size={11} className="flex-shrink-0" />
                              {error.message}
                            </p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {preview && (
        <PagePreviewModal
          title={preview.title}
          path={preview.path}
          onClose={() => setPreview(null)}
        />
      )}
    </div>
  );
}

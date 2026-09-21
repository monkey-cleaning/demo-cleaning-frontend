import { useEffect, useState } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  getAdminBlogSettings,
  putAdminBlogSettings,
  type AdminBlogSettings,
  type AutoAddonStatus,
} from '../../api/blogSettings';
import type { BlogMode } from '../../api/siteConfig';
import { useSiteConfig } from '../../context/SiteConfigContext';
import { blogSettingsCopy as copy } from '../../copy/blogSettings';
import ConfirmModal from './ConfirmModal';

const MODE_ORDER: BlogMode[] = ['off', 'manual', 'auto'];

function addonNotice(
  mode: BlogMode,
  status: AutoAddonStatus,
): string | null {
  if (mode !== 'auto') return null;
  if (status === 'requested') return copy.notices.requested;
  if (status === 'active') return copy.notices.active;
  if (status === 'past_due') return copy.notices.past_due;
  return null;
}

export default function BlogModeSettingsSection() {
  const { refresh: refreshSiteConfig } = useSiteConfig();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [draftMode, setDraftMode] = useState<BlogMode>('off');
  const [server, setServer] = useState<AdminBlogSettings | null>(null);
  const [confirmOffOpen, setConfirmOffOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdminBlogSettings();
        if (cancelled) return;
        setServer(data);
        setDraftMode(data.blog_mode);
      } catch {
        if (!cancelled) setError(copy.loadError);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = server != null && draftMode !== server.blog_mode;
  const notice =
    server != null
      ? addonNotice(server.blog_mode, server.auto_addon_status)
      : null;

  async function persistMode() {
    setSaving(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const data = await putAdminBlogSettings(draftMode);
      setServer(data);
      setDraftMode(data.blog_mode);
      setSuccessMsg(copy.saved);
      setConfirmOffOpen(false);
      await refreshSiteConfig();
    } catch {
      setError(copy.saveError);
      setConfirmOffOpen(false);
    } finally {
      setSaving(false);
    }
  }

  function handleSave() {
    setError(null);
    setSuccessMsg(null);

    if (draftMode === 'off' && server?.blog_mode !== 'off') {
      setConfirmOffOpen(true);
      return;
    }

    void persistMode();
  }

  function handleConfirmOffCancel() {
    if (saving) return;
    setConfirmOffOpen(false);
    if (server) setDraftMode(server.blog_mode);
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 bg-gray-50/60">
        <h2 className="text-sm font-semibold text-[#031634]">{copy.sectionTitle}</h2>
        <p className="mt-0.5 text-xs text-gray-400">{copy.sectionDescription}</p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 px-6 py-8 text-sm text-gray-400">
          <RefreshCw size={14} className="animate-spin" />
          {copy.loading}
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {error && (
            <div className="flex items-center gap-2 px-6 py-3 bg-red-50 text-red-600 text-sm">
              <AlertCircle size={14} className="flex-shrink-0" />
              {error}
            </div>
          )}
          {successMsg && (
            <div className="px-6 py-3 bg-emerald-50 text-emerald-700 text-sm">
              {successMsg}
            </div>
          )}

          <div className="px-6 py-4 space-y-3">
            {MODE_ORDER.map((mode) => {
              const meta = copy.modes[mode];
              const selected = draftMode === mode;
              return (
                <label
                  key={mode}
                  className={`flex gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                    selected
                      ? 'border-[#031634] bg-[#031634]/[0.03]'
                      : 'border-gray-100 hover:border-gray-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="blog_mode"
                    className="mt-1"
                    checked={selected}
                    onChange={() => {
                      setDraftMode(mode);
                      setError(null);
                      setSuccessMsg(null);
                    }}
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-[#031634]">
                      {meta.label}
                    </span>
                    <span className="block text-xs text-gray-400 leading-relaxed mt-0.5">
                      {meta.description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>

          {server && (
            <div className="px-6 py-3 text-xs text-gray-500 space-y-1">
              <p>{copy.effectiveHint(server.effective_mode)}</p>
              {notice && (
                <p
                  className={
                    server.auto_addon_status === 'past_due'
                      ? 'text-amber-700'
                      : server.auto_addon_status === 'active'
                        ? 'text-emerald-700'
                        : 'text-[#031634]'
                  }
                >
                  {notice}
                </p>
              )}
            </div>
          )}

          <div className="px-6 py-4 flex justify-end">
            <button
              type="button"
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-[#031634] text-white text-xs font-semibold rounded-lg hover:bg-[#031634]/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? (
                <>
                  <RefreshCw size={13} className="animate-spin" />
                  {copy.saving}
                </>
              ) : (
                copy.save
              )}
            </button>
          </div>
        </div>
      )}

      {confirmOffOpen && (
        <ConfirmModal
          title={copy.confirmOffTitle}
          body={copy.confirmOff}
          cancelLabel={copy.confirmOffCancel}
          confirmLabel={saving ? copy.saving : copy.confirmOffConfirm}
          destructive
          confirming={saving}
          onCancel={handleConfirmOffCancel}
          onConfirm={() => void persistMode()}
        />
      )}
    </div>
  );
}

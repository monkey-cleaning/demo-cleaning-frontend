import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError, api } from '../api/client';
import type { BlogMode } from '../api/siteConfig';
import BlogDisabledScreen from '../components/admin/BlogDisabledScreen';
import ConfirmModal from '../components/admin/ConfirmModal';
import { useSiteConfig } from '../context/SiteConfigContext';
import { blogAdminCopy as copy } from '../copy/blogSettings';

export type BlogPostSource = 'seo-blog-platform' | 'admin' | null;

type AdminBlogPost = {
  id: number;
  slug: string;
  title: string;
  status: 'draft' | 'published';
  published_at: string | null;
  created_at: string;
  /** Present when the backend supports it; treat missing as manually editable. */
  source?: BlogPostSource;
};

function isSyncedLocked(blogMode: BlogMode, source: BlogPostSource | undefined): boolean {
  return blogMode === 'auto' && source === 'seo-blog-platform';
}

export default function AdminBlogsListPage() {
  const { ready, blogEnabled, blogMode } = useSiteConfig();
  const [posts, setPosts] = useState<AdminBlogPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disabledByApi, setDisabledByApi] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;
    if (!blogEnabled) {
      setLoading(false);
      return;
    }

    const load = async () => {
      setLoading(true);
      setError(null);
      setDisabledByApi(false);
      try {
        const data = await api<AdminBlogPost[]>('/api/admin/blogs');
        setPosts(data);
      } catch (e: unknown) {
        console.error(e);
        if (e instanceof ApiError && e.status === 403 && e.code === 'blog_disabled') {
          setDisabledByApi(true);
          return;
        }
        setError(e instanceof Error ? e.message : 'Error loading posts');
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [ready, blogEnabled]);

  const performDelete = async (id: number) => {
    setDeleting(true);
    try {
      await api(`/api/admin/blogs/${id}`, { method: 'DELETE' });
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setPendingDeleteId(null);
    } catch (e: unknown) {
      console.error(e);
      if (e instanceof ApiError && e.code === 'blog_managed_by_platform') {
        alert(copy.managedByPlatform);
        setPendingDeleteId(null);
        return;
      }
      if (e instanceof ApiError && e.code === 'blog_disabled') {
        setDisabledByApi(true);
        setPendingDeleteId(null);
        return;
      }
      alert(e instanceof Error ? e.message : 'Error deleting the post');
      setPendingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  if (ready && (!blogEnabled || disabledByApi)) {
    return <BlogDisabledScreen />;
  }

  if (!ready || loading) {
    return <div className="p-8 text-center text-gray-500">Loading...</div>;
  }

  if (error) {
    return <div className="p-8 text-center text-red-500">{error}</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="max-w-5xl mx-auto px-4">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-montserrat font-bold text-[#031634]">
            Blog Posts (Admin)
          </h1>
          <button
            onClick={() => navigate('/admin/blogs/new')}
            className="px-4 py-2 rounded-lg bg-[#031634] text-white font-montserrat text-sm hover:bg-[#042045] transition-colors"
          >
            + New Post
          </button>
        </div>

        {posts.length === 0 ? (
          <p className="text-gray-500">No posts yet.</p>
        ) : (
          <>
            <div className="hidden md:block">
              <table className="w-full bg-white shadow-sm rounded-lg overflow-hidden text-sm">
                <thead className="bg-gray-100">
                  <tr>
                    <th className="text-left p-3 font-semibold">Title</th>
                    <th className="text-left p-3 font-semibold">Slug</th>
                    <th className="text-left p-3 font-semibold">Status</th>
                    <th className="text-left p-3 font-semibold">Published</th>
                    <th className="text-center p-3 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {posts.map((p) => {
                    const locked = isSyncedLocked(blogMode, p.source);
                    return (
                      <tr key={p.id} className="border-t border-gray-100 hover:bg-gray-50 transition-colors">
                        <td className="p-3 font-medium">
                          <span className="inline-flex items-center gap-2 flex-wrap">
                            {p.title}
                            {locked && (
                              <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold uppercase tracking-wide">
                                {copy.syncedBadge}
                              </span>
                            )}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-500">{p.slug}</td>
                        <td className="p-3">
                          <span
                            className={
                              p.status === 'published'
                                ? 'px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium'
                                : 'px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium'
                            }
                          >
                            {p.status}
                          </span>
                        </td>
                        <td className="p-3 text-xs text-gray-500">
                          {p.published_at
                            ? new Date(p.published_at).toLocaleDateString()
                            : '-'}
                        </td>
                        <td className="p-3">
                          {locked ? (
                            <p className="text-xs text-gray-400 text-center">{copy.syncedReadOnlyHint}</p>
                          ) : (
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => navigate(`/admin/blogs/${p.id}`)}
                                className="px-3 py-1 rounded-md border border-gray-300 text-xs hover:bg-gray-50 transition-colors"
                              >
                                Edit
                              </button>
                              <button
                                onClick={() => setPendingDeleteId(p.id)}
                                className="px-3 py-1 rounded-md border border-red-300 text-xs text-red-600 hover:bg-red-50 transition-colors"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="md:hidden space-y-4">
              {posts.map((p) => {
                const locked = isSyncedLocked(blogMode, p.source);
                return (
                  <div key={p.id} className="bg-white rounded-lg shadow-sm p-4 space-y-3">
                    <div>
                      <h3 className="font-medium text-[#031634] mb-1 inline-flex items-center gap-2 flex-wrap">
                        {p.title}
                        {locked && (
                          <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[10px] font-semibold uppercase tracking-wide">
                            {copy.syncedBadge}
                          </span>
                        )}
                      </h3>
                      <p className="text-xs text-gray-500">{p.slug}</p>
                    </div>

                    <div className="flex items-center justify-between">
                      <span
                        className={
                          p.status === 'published'
                            ? 'px-2 py-1 rounded-full bg-green-100 text-green-700 text-xs font-medium'
                            : 'px-2 py-1 rounded-full bg-yellow-100 text-yellow-700 text-xs font-medium'
                        }
                      >
                        {p.status}
                      </span>
                      <span className="text-xs text-gray-500">
                        {p.published_at
                          ? new Date(p.published_at).toLocaleDateString()
                          : 'Not published'}
                      </span>
                    </div>

                    {locked ? (
                      <p className="text-xs text-gray-400">{copy.syncedReadOnlyHint}</p>
                    ) : (
                      <div className="flex gap-2 pt-2">
                        <button
                          onClick={() => navigate(`/admin/blogs/${p.id}`)}
                          className="flex-1 px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-50 transition-colors"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => setPendingDeleteId(p.id)}
                          className="flex-1 px-3 py-2 rounded-md border border-red-300 text-sm text-red-600 hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {pendingDeleteId != null && (
        <ConfirmModal
          title={copy.deleteConfirmTitle}
          body={copy.deleteConfirmBody}
          cancelLabel={copy.deleteConfirmCancel}
          confirmLabel={deleting ? copy.deleteConfirmDeleting : copy.deleteConfirmConfirm}
          destructive
          confirming={deleting}
          onCancel={() => {
            if (!deleting) setPendingDeleteId(null);
          }}
          onConfirm={() => void performDelete(pendingDeleteId)}
        />
      )}
    </div>
  );
}
